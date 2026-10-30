import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { Copy, KeyRound, Plus, RefreshCw } from 'lucide-react';
import { functions } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { canManageApiKeys } from '../utils/apiKeyAccess';
import { Button } from './ui/button';
import { Input } from './ui/input';

const permissions = [
  ['bookings:read', 'View and search bookings', 'Find bookings by name or date and read their details.'],
  ['availability:read', 'View availability', 'Check remaining spaces for a day or departure time.'],
  ['bookings:create', 'Create bookings', 'Add bookings directly to the daily plan.'],
  ['bookings:update', 'Alter booking details', 'Edit customer details, passengers, date and time.'],
  ['bookings:status', 'Change booking status', 'Set confirmed, unconfirmed, pending, cancelled or no show.'],
  ['bookings:delete', 'Delete bookings', 'Move bookings to Deleted. They remain recoverable in the app.'],
  ['booking-requests:create', 'Submit booking requests', 'Add pending requests for the team to review.'],
] as const;
type ApiKey = {
  id: string; name: string; prefix: string; scopes: string[]; createdAt: string;
  expiresAt: string | null; revokedAt: string | null; lastUsedAt: string | null;
};
const listKeys = httpsCallable<void, { keys: ApiKey[] }>(functions, 'listIntegrationApiKeys');
const createKey = httpsCallable<{ name: string; scopes: string[]; expiresAt: string | null },
  { key: ApiKey; secret: string }>(functions, 'createIntegrationApiKey');
const revokeKey = httpsCallable<{ id: string }, { revoked: boolean }>(functions, 'revokeIntegrationApiKey');
const formatDate = (date: string | null) => date ? new Date(date).toLocaleString() : 'Never';
// The function URL works from any tool, whether or not Hosting serves the /api/v1 rewrite.
const baseUrl = import.meta.env.VITE_BOOKING_API_LOCAL === 'true' ? `${window.location.origin}/api/v1` :
  `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net/bookingApi/api/v1`;
const mcpUrl = `${baseUrl}/mcp`;

function CopyField({ label, value, onError }: { label: string; value: string; onError: () => void }) {
  const [copied, setCopied] = useState(false);
  return <div>
    <div className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</div>
    <div className="flex items-stretch gap-2">
      <code className="block min-w-0 flex-1 break-all rounded-lg bg-white p-3 text-sm dark:bg-zinc-950">{value}</code>
      <Button type="button" variant="outline" aria-label={`Copy ${label}`} onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); } catch { onError(); }
      }}><Copy size={14} className="mr-2" />{copied ? 'Copied' : 'Copy'}</Button>
    </div>
  </div>;
}

export function ApiKeys() {
  const { currentUser, loading: authLoading } = useAuth();
  const allowed = canManageApiKeys(currentUser);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiry, setExpiry] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function reload() {
    setLoading(true);
    setError('');
    try { setKeys((await listKeys()).data.keys); }
    catch { setError('Could not load API keys. Check your connection and that the API functions are available.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (!allowed) { setKeys([]); setSecret(''); return; }
    let active = true;
    listKeys().then(result => { if (active) setKeys(result.data.keys); })
      .catch(() => { if (active) setError('Could not load API keys. Check your connection and that the API functions are available.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed]);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = (await createKey({ name: name.trim(), scopes,
        expiresAt: expiry ? new Date(expiry).toISOString() : null })).data;
      setKeys(previous => [result.key, ...previous]);
      setSecret(result.secret); setShowForm(false);
      setName(''); setScopes([]); setExpiry('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the API key.');
    } finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setError('');
    try {
      await revokeKey({ id });
      setKeys(previous => previous.map(key => key.id === id ? { ...key, revokedAt: new Date().toISOString() } : key));
      if (secret.startsWith(`twin_${id}_`)) setSecret('');
      setRevoking(null);
    } catch { setError('Could not revoke the key. Please try again.'); }
    finally { setBusy(false); }
  }
  if (authLoading) return <div className="p-8 text-zinc-500">Loading…</div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 text-gray-900 sm:px-8 dark:text-zinc-100">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-zinc-500">
            <KeyRound size={15} /> Private integrations
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">API keys</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Give each tool only the access it needs.</p>
        </div>
        <Button onClick={() => { setShowForm(value => !value); setError(''); }} disabled={busy || !!secret}>
          <Plus size={16} className="mr-2" /> {showForm ? 'Close form' : 'Create API key'}
        </Button>
      </div>
      {error && <div role="alert" className="mb-5 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
      {secret && <section aria-label="New API key" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-700/60 dark:bg-amber-950/20">
        <h2 className="font-semibold">Copy your new key</h2>
        <p className="mb-4 mt-1 text-sm text-zinc-600 dark:text-zinc-400">This is the only time the full key is shown. Keep it in your tool’s secret settings.</p>
        <div className="space-y-4">
          <CopyField label="API key" value={secret} onError={() => setError('Copy was unavailable. Select and copy the key above.')} />
          <CopyField label="Connector URL (MCP)" value={mcpUrl} onError={() => setError('Copy was unavailable. Select and copy the URL above.')} />
        </div>
        <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">To connect an AI tool or app connector (e.g. noudle mail → Settings → Connectors), enter the connector URL as the server URL and this key as the API key.</p>
        <div className="mt-4">
          <Button variant="outline" onClick={() => setSecret('')}>I’ve saved the key</Button>
        </div>
      </section>}
      {showForm && <form onSubmit={generate} className="mb-8 rounded-xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-5 text-lg font-semibold">Create a key</h2>
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Name<Input className="mt-2" placeholder="e.g. Booking assistant" required maxLength={80} value={name} onChange={event => setName(event.target.value)} disabled={busy} /></label>
          <label className="text-sm">Expiry <span className="text-zinc-500">(optional)</span><Input className="mt-2" type="datetime-local" value={expiry} onChange={event => setExpiry(event.target.value)} disabled={busy} /></label>
        </div>
        <fieldset disabled={busy}>
          <legend className="mb-2 text-sm font-medium">Permissions</legend>
          <div className="divide-y divide-gray-100 dark:divide-zinc-800">
            {permissions.map(([scope, label, description]) => <label key={scope} className="flex cursor-pointer items-start gap-3 py-3">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-zinc-900 dark:accent-white" checked={scopes.includes(scope)} onChange={event => setScopes(previous => event.target.checked ? [...previous, scope] : previous.filter(item => item !== scope))} />
              <span><span className="block text-sm font-medium">{label}</span><span className="mt-0.5 block text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{description}</span></span>
            </label>)}
          </div>
        </fieldset>
        <div className="mt-6 flex gap-2">
          <Button type="submit" disabled={busy || !name.trim() || !scopes.length}>{busy ? 'Creating…' : 'Generate key'}</Button>
          <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={busy}>Cancel</Button>
        </div>
      </form>}
      <section aria-label="Your API keys" className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">Your keys <span className="ml-2 font-normal text-zinc-500">{keys.length}</span></h2>
          <Button variant="ghost" size="sm" onClick={reload} disabled={loading || busy} aria-label="Refresh API keys"><RefreshCw size={15} /></Button>
        </div>
        {loading ? <p className="p-6 text-sm text-zinc-500">Loading keys…</p> : keys.length === 0 ?
          <div className="px-6 py-12 text-center"><KeyRound size={24} className="mx-auto mb-3 text-zinc-400" /><p className="font-medium">No API keys yet</p><p className="mt-1 text-sm text-zinc-500">Create a separate key for each tool or integration.</p></div> :
          <div className="divide-y divide-gray-200 dark:divide-zinc-800">{keys.map(key => {
            const inactive = !!key.revokedAt || !!(key.expiresAt && Date.parse(key.expiresAt) <= Date.now());
            return <article key={key.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-medium">{key.name} <span className={`ml-2 text-xs font-normal ${inactive ? 'text-zinc-500' : 'text-emerald-700 dark:text-emerald-400'}`}>{key.revokedAt ? 'Revoked' : inactive ? 'Expired' : 'Active'}</span></h3><code className="mt-1 block text-xs text-zinc-500">{key.prefix}…</code></div>
                {!key.revokedAt && (revoking === key.id ? <div className="flex items-center gap-2"><span className="text-xs">Stop this key’s access?</span><Button variant="destructive" size="sm" disabled={busy} onClick={() => revoke(key.id)}>Revoke key</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => setRevoking(null)}>Cancel</Button></div> : <Button variant="outline" size="sm" disabled={busy} onClick={() => setRevoking(key.id)}>Revoke</Button>)}
              </div>
              <div className="my-3 flex flex-wrap gap-1.5">{key.scopes.map(scope => <span key={scope} className="rounded-md bg-gray-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{permissions.find(item => item[0] === scope)?.[1] || scope}</span>)}</div>
              <p className="text-xs leading-6 text-zinc-500">Created {formatDate(key.createdAt)} · Last used {formatDate(key.lastUsedAt)} · Expires {formatDate(key.expiresAt)}</p>
            </article>;
          })}</div>}
      </section>
      <details className="mt-6 rounded-xl border border-gray-200 p-5 text-sm dark:border-zinc-800">
        <summary className="cursor-pointer font-medium">How to connect a tool</summary>
        <h3 className="mt-4 font-medium">AI tools and connectors (MCP)</h3>
        <p className="mt-1 text-zinc-500 dark:text-zinc-400">Enter this as the server or connector URL, with your key as the API key. The tool only sees actions its key allows.</p>
        <code className="my-3 block break-all rounded-lg bg-gray-100 p-3 text-xs dark:bg-zinc-900">{mcpUrl}</code>
        <h3 className="mt-5 font-medium">Direct API (REST)</h3>
        <p className="mt-1 text-zinc-500 dark:text-zinc-400">Use the key from a server or a tool’s secure connection settings. Send it as an Authorization: Bearer header. Writes also require a unique Idempotency-Key header; reuse it when retrying the same request.</p>
        <code className="my-4 block break-all rounded-lg bg-gray-100 p-3 text-xs dark:bg-zinc-900">{baseUrl}</code>
        <ul className="space-y-2 break-all font-mono text-xs">
          <li>GET /bookings?name=Peter</li><li>GET /bookings?date=2026-10-01</li>
          <li>GET /bookings/BOOKING_ID</li><li>GET /availability?date=2026-10-01&amp;time=14:00</li>
          <li>POST /bookings</li><li>PATCH /bookings/BOOKING_ID</li><li>DELETE /bookings/BOOKING_ID</li><li>POST /booking-requests</li>
        </ul>
        <p className="mt-4 text-zinc-500">Name searches can return a nextCursor. Continue with that cursor until it is null, including after an empty page.</p>
      </details>
    </main>
  );
}

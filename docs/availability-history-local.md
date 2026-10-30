# Availability history — local implementation

Nothing has been deployed. No production data is migrated, backfilled, or rewritten.

## Compatibility boundary

The existing availability records, string timestamps, save helper, pilot ordering,
booking capacity, schedule history, booking unassignment, and payment cleanup
remain unchanged. A Firestore observer writes a separate, append-only audit
collection after each source write, including writes from older clients. The
new overview popover is the only app reader of this collection. The overview
grid's existing colours, counts, and cell dates are unchanged.

This deliberately replaces the proposed client-side combined save: an audit
failure must not block a pilot signing in. Recording is asynchronous, not an
atomic availability/history transaction. The popover says history may lag;
source-state gaps suppress inferred whole-day transitions. There is no
promise of immediate completeness or of recovering pre-existing lost history.

Events contain original before/after states, database commit time, source
versions, and the authenticated principal when provided by Firebase. Unknown
actors remain explicitly unknown. Authenticated actor names are resolved from
current profiles; those names can subsequently change. Times use Europe/Zurich.
Event IDs deduplicate retries, and commit timestamps (including nanoseconds)
order delayed deliveries. Events are retained without a TTL. Client writes,
edits, and deletion of audit entries are denied; reads are admin-only.

The observer also records direct deletion and a record moving between dates or
pilots, without performing such operations itself. Same-status timestamp-only
writes remain in the audit trail but are omitted from the status-change list.
Exact no-op writes do not produce Firestore trigger events, even if a source
version advances. Consequently replay checks state continuity rather than
version continuity. Catch-up detection is conservative but not a delivery
monitor: a still-missing cycle returning to identical fields may be invisible
until delivered. The UI always warns that records may take a moment to appear.

## Local verification

Requires Node 24+, Java 21+, installed root/functions dependencies, and Firebase CLI.
The runner detects Homebrew Java when JAVA_HOME is unset.

```sh
npm run test:availability-history
npm run test:availability-local
```

The second command starts disposable Auth, Firestore and Functions emulators
using `demo-twin-history`. Its fixture loads only the actual history observer:
email, push, and other production functions are not loaded. All seed/test
records are synthetic; scripts refuse non-local endpoints.

Firestore Emulator 1.21 supplies `fake-auth-id@gmail.com` instead of the actual
authenticated actor. Integration tests explicitly report this limitation;
unit tests verify supplied principal IDs are preserved. Real actor attribution
is not claimed as locally verified and remains a future release check.

For an interactive preview, in separate terminals:

```sh
npm run emulators:availability-local
FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199 node scripts/seedAvailabilityLocal.mjs
npm run dev:availability-local
```

Open http://localhost:5178, choose Sign in with Google, then use the **local
emulator** account picker to add/select `preview-admin@example.test` (display
name: Preview Admin). This is an emulator identity, not a real Google login.
The account also has password `local-history-only` for SDK-level tests.
The special Vite config overrides production Firebase environment values,
disables push initialization, and has no production API proxy. Storage and
unrelated backend features are intentionally unavailable in this focused preview.
The seed is create-only and safe to repeat. Stopping the emulators discards data.

To review the real pilot availability rather than synthetic pilots, run this
after starting the emulators and creating the local admin:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199 node scripts/copyAvailabilityToLocal.mjs 2026-09
```

This reads only pilot display/scheduling fields and the selected month's
availability from production, then creates copies in the isolated demo project.
It removes this feature's named synthetic fixtures locally, retains the preview
admin login, and never overwrites existing copied real records. Local background
recording is suspended during the copy so imported records do not become fake
historical sign-in events. The copy has the original incomplete legacy
timestamps; new permanent history starts with subsequent local test changes.
No production writes, authentication-account imports, or deployments occur.

## Future release boundary — not performed

Review and explicitly authorize release separately. The observer and admin-only
read rules must be available before the new UI. Verify source writes succeed,
audit delivery/retries, actor identity, and monitoring of failed deliveries before
enabling the popover. Historical completeness starts with successful recording;
never label legacy timestamps as a complete audit trail. Rolling back the UI
does not require deleting events or modifying availability. Trigger failures
need monitoring and repair; asynchronous delivery is not an absolute guarantee.

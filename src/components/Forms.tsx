import { useState } from "react";
import { Copy, ExternalLink, Check } from "lucide-react";

export function Forms() {
  const [copiedIframe, setCopiedIframe] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const formUrl = `${window.location.origin}/booking-request`;
  const iframeCode = `<iframe src="${formUrl}" width="100%" height="800" frameborder="0"></iframe>`;

  const copyToClipboard = async (text: string, type: 'iframe' | 'url') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'iframe') {
        setCopiedIframe(true);
        setTimeout(() => setCopiedIframe(false), 2000);
      } else {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 p-6 overflow-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Public Booking Form</h1>

      <div className="max-w-3xl">
        {/* Direct Link Section */}
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 mb-6">
          <h3 className="text-lg font-medium text-white mb-3">Direct Link</h3>
          <p className="text-zinc-400 text-sm mb-4">Share this link with customers to submit booking requests.</p>

          <div className="flex gap-2">
            <input
              type="text"
              value={formUrl}
              readOnly
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm font-mono"
            />
            <button
              onClick={() => copyToClipboard(formUrl, 'url')}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors flex items-center gap-2"
            >
              {copiedUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedUrl ? 'Copied!' : 'Copy'}
            </button>
            <a
              href={formUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Open
            </a>
          </div>
        </div>

        {/* Embed Code Section */}
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
          <h3 className="text-lg font-medium text-white mb-3">Embed Code</h3>
          <p className="text-zinc-400 text-sm mb-4">Copy this code to embed the form on your website.</p>

          <div className="bg-zinc-800 border border-zinc-700 rounded p-4 mb-4">
            <code className="text-green-400 text-sm break-all font-mono">{iframeCode}</code>
          </div>

          <button
            onClick={() => copyToClipboard(iframeCode, 'iframe')}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors flex items-center gap-2"
          >
            {copiedIframe ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiedIframe ? 'Copied!' : 'Copy Embed Code'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Copy, ExternalLink, Check } from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";

export function Forms() {
  const [copiedIframe, setCopiedIframe] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [hideAvailability, setHideAvailability] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const baseFormUrl = `${window.location.origin}/booking-request`;
  const embedUrl = `${window.location.origin}/embed/`;

  // Load form settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, "settings", "form"));
        if (settingsDoc.exists()) {
          setHideAvailability(settingsDoc.data().hideAvailability ?? false);
        }
      } catch (error) {
        console.error("Error loading form settings:", error);
      }
    };
    loadSettings();
  }, []);

  // Save settings when toggle changes
  const handleToggleAvailability = async () => {
    const newValue = !hideAvailability;
    setHideAvailability(newValue);
    setSavingSettings(true);
    try {
      await setDoc(doc(db, "settings", "form"), { hideAvailability: newValue }, { merge: true });
    } catch (error) {
      console.error("Error saving form settings:", error);
      // Revert on error
      setHideAvailability(!newValue);
    } finally {
      setSavingSettings(false);
    }
  };

  // Include hideAvailability param in URL when enabled (for iframe cross-origin support)
  const formUrl = hideAvailability
    ? `${baseFormUrl}?hideAvailability=true`
    : baseFormUrl;

  // Embed URL uses the optimized lightweight bundle
  const embedFormUrl = hideAvailability
    ? `${embedUrl}?hideAvailability=true`
    : embedUrl;

  const iframeCode = `<iframe src="${embedFormUrl}" width="100%" height="800" frameborder="0"></iframe>`;

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
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-zinc-950 p-6 overflow-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Public Booking Form</h1>

      <div className="max-w-3xl">
        {/* Direct Link Section */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800 p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Direct Link</h3>
          <p className="text-gray-600 dark:text-zinc-400 text-sm mb-4">Share this link with customers to submit booking requests.</p>

          <div className="flex gap-2">
            <input
              type="text"
              value={formUrl}
              readOnly
              className="flex-1 bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded px-3 py-2 text-gray-900 dark:text-white text-sm font-mono"
            />
            <button
              onClick={() => copyToClipboard(formUrl, 'url')}
              className="px-4 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-900 dark:text-white rounded transition-colors flex items-center gap-2"
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
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Embed Code</h3>
          <p className="text-gray-600 dark:text-zinc-400 text-sm mb-4">Copy this code to embed the form on your website.</p>

          <div className="bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded p-4 mb-4">
            <code className="text-green-600 dark:text-green-400 text-sm break-all font-mono">{iframeCode}</code>
          </div>

          <button
            onClick={() => copyToClipboard(iframeCode, 'iframe')}
            className="px-4 py-2 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-900 dark:text-white rounded transition-colors flex items-center gap-2"
          >
            {copiedIframe ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiedIframe ? 'Copied!' : 'Copy Embed Code'}
          </button>
        </div>

        {/* Form Settings Section */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800 p-6 mt-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Form Settings</h3>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-900 dark:text-white font-medium">Don't show availability</p>
              <p className="text-gray-600 dark:text-zinc-400 text-sm">
                When enabled, customers won't see available spots and can book for any number of people.
              </p>
            </div>
            <button
              onClick={handleToggleAvailability}
              disabled={savingSettings}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                hideAvailability ? 'bg-blue-600' : 'bg-gray-300 dark:bg-zinc-600'
              } ${savingSettings ? 'opacity-50' : ''}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  hideAvailability ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

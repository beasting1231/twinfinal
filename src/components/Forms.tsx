import { useState } from "react";
import { Button } from "./ui/button";

export function Forms() {
  const [copied, setCopied] = useState(false);

  // The form URL - this will point to the public booking request form
  const formUrl = `${window.location.origin}/booking-request`;

  // Embed code for iframe
  const embedCode = `<iframe src="${formUrl}" width="100%" height="800" frameborder="0"></iframe>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenInNewTab = () => {
    window.open(formUrl, "_blank");
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-8">
        <h1 className="text-3xl font-bold text-white mb-8">Booking Request Form</h1>

        <div className="space-y-6">
          {/* Form Link Section */}
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-white">Form Link</h2>
            <p className="text-sm text-zinc-400">
              Share this link with customers to submit booking requests.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={formUrl}
                readOnly
                className="flex-1 px-4 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-300 text-sm"
              />
              <Button
                onClick={handleOpenInNewTab}
                className="bg-white text-black hover:bg-zinc-200"
              >
                Open Form
              </Button>
            </div>
          </div>

          {/* Embed Code Section */}
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-white">Embed Code</h2>
            <p className="text-sm text-zinc-400">
              Copy this code to embed the booking form on your website.
            </p>
            <div className="relative">
              <pre className="p-4 bg-zinc-950 border border-zinc-800 rounded text-zinc-300 text-sm overflow-x-auto">
                <code>{embedCode}</code>
              </pre>
              <Button
                onClick={handleCopy}
                className="absolute top-2 right-2 bg-white text-black hover:bg-zinc-200"
              >
                {copied ? "Copied!" : "Copy Code"}
              </Button>
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-8 p-4 bg-zinc-950 border border-zinc-800 rounded">
            <h3 className="text-lg font-semibold text-white mb-2">How it works</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-zinc-400">
              <li>Customers fill out the form with their booking details</li>
              <li>Booking requests appear in your Daily Plan inbox</li>
              <li>You can review and approve or reject each request</li>
              <li>Approved bookings are added to your schedule</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export interface EmailSettings {
  // IMAP settings
  imapHost: string;
  imapPort: string;
  imapUsername: string;
  imapPassword: string;
  imapSsl: boolean;
  // SMTP settings
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  smtpSsl: boolean;
}

interface EmailSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (settings: EmailSettings) => void;
  initialSettings?: EmailSettings;
}

const defaultSettings: EmailSettings = {
  imapHost: "",
  imapPort: "993",
  imapUsername: "",
  imapPassword: "",
  imapSsl: true,
  smtpHost: "",
  smtpPort: "587",
  smtpUsername: "",
  smtpPassword: "",
  smtpSsl: true,
};

export function EmailSettingsModal({
  open,
  onClose,
  onSave,
  initialSettings,
}: EmailSettingsModalProps) {
  const [settings, setSettings] = useState<EmailSettings>(
    initialSettings || defaultSettings
  );

  const handleSave = () => {
    onSave(settings);
    onClose();
  };

  const updateSetting = <K extends keyof EmailSettings>(
    key: K,
    value: EmailSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email Settings</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-6 mt-4">
          {/* IMAP Settings */}
          <div className="space-y-4">
            <h3 className="font-medium text-stone-100">
              IMAP Settings (Incoming Mail)
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <Label htmlFor="imapHost">Host</Label>
                <Input
                  id="imapHost"
                  value={settings.imapHost}
                  onChange={(e) => updateSetting("imapHost", e.target.value)}
                  placeholder="imap.example.com"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label htmlFor="imapPort">Port</Label>
                <Input
                  id="imapPort"
                  value={settings.imapPort}
                  onChange={(e) => updateSetting("imapPort", e.target.value)}
                  placeholder="993"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="imapUsername">Username</Label>
                <Input
                  id="imapUsername"
                  value={settings.imapUsername}
                  onChange={(e) => updateSetting("imapUsername", e.target.value)}
                  placeholder="your@email.com"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="imapPassword">Password</Label>
                <Input
                  id="imapPassword"
                  type="password"
                  value={settings.imapPassword}
                  onChange={(e) => updateSetting("imapPassword", e.target.value)}
                  placeholder="App password or password"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="imapSsl"
                  checked={settings.imapSsl}
                  onChange={(e) => updateSetting("imapSsl", e.target.checked)}
                  className="rounded border-stone-600 bg-stone-800 text-stone-100 focus:ring-stone-500"
                />
                <Label htmlFor="imapSsl" className="cursor-pointer text-stone-300">
                  Use SSL/TLS
                </Label>
              </div>
            </div>
          </div>

          {/* SMTP Settings */}
          <div className="space-y-4">
            <h3 className="font-medium text-stone-100">
              SMTP Settings (Outgoing Mail)
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <Label htmlFor="smtpHost">Host</Label>
                <Input
                  id="smtpHost"
                  value={settings.smtpHost}
                  onChange={(e) => updateSetting("smtpHost", e.target.value)}
                  placeholder="smtp.example.com"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label htmlFor="smtpPort">Port</Label>
                <Input
                  id="smtpPort"
                  value={settings.smtpPort}
                  onChange={(e) => updateSetting("smtpPort", e.target.value)}
                  placeholder="587"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="smtpUsername">Username</Label>
                <Input
                  id="smtpUsername"
                  value={settings.smtpUsername}
                  onChange={(e) => updateSetting("smtpUsername", e.target.value)}
                  placeholder="your@email.com"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="smtpPassword">Password</Label>
                <Input
                  id="smtpPassword"
                  type="password"
                  value={settings.smtpPassword}
                  onChange={(e) => updateSetting("smtpPassword", e.target.value)}
                  placeholder="App password or password"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="smtpSsl"
                  checked={settings.smtpSsl}
                  onChange={(e) => updateSetting("smtpSsl", e.target.checked)}
                  className="rounded border-stone-600 bg-stone-800 text-stone-100 focus:ring-stone-500"
                />
                <Label htmlFor="smtpSsl" className="cursor-pointer text-stone-300">
                  Use SSL/TLS
                </Label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Settings</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { Mail, Send, Plus, X, Save, Loader2 } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";

interface NotificationConfig {
  emailNotifications: {
    enabled: boolean;
    recipients: string[];
  };
  telegramNotifications: {
    enabled: boolean;
    chatIds: string[];
    botToken: string;
  };
}

const defaultConfig: NotificationConfig = {
  emailNotifications: {
    enabled: true,
    recipients: [],
  },
  telegramNotifications: {
    enabled: false,
    chatIds: [],
    botToken: "",
  },
};

export function NotificationSettings() {
  const [config, setConfig] = useState<NotificationConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newChatId, setNewChatId] = useState("");
  const [emailError, setEmailError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch notification config from Firestore
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const configRef = doc(db, "settings", "notifications");
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          const data = configSnap.data() as NotificationConfig;
          setConfig({
            emailNotifications: {
              enabled: data.emailNotifications?.enabled ?? true,
              recipients: data.emailNotifications?.recipients ?? [],
            },
            telegramNotifications: {
              enabled: data.telegramNotifications?.enabled ?? false,
              chatIds: data.telegramNotifications?.chatIds ?? [],
              botToken: data.telegramNotifications?.botToken ?? "",
            },
          });
        }
      } catch (error) {
        console.error("Error fetching notification config:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  // Validate email
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // Add email recipient
  const handleAddEmail = () => {
    if (!newEmail.trim()) return;

    if (!isValidEmail(newEmail.trim())) {
      setEmailError("Please enter a valid email address");
      return;
    }

    if (config.emailNotifications.recipients.includes(newEmail.trim())) {
      setEmailError("This email is already in the list");
      return;
    }

    setConfig((prev) => ({
      ...prev,
      emailNotifications: {
        ...prev.emailNotifications,
        recipients: [...prev.emailNotifications.recipients, newEmail.trim()],
      },
    }));
    setNewEmail("");
    setEmailError("");
  };

  // Remove email recipient
  const handleRemoveEmail = (email: string) => {
    setConfig((prev) => ({
      ...prev,
      emailNotifications: {
        ...prev.emailNotifications,
        recipients: prev.emailNotifications.recipients.filter((e) => e !== email),
      },
    }));
  };

  // Add Telegram chat ID
  const handleAddChatId = () => {
    if (!newChatId.trim()) return;

    if (config.telegramNotifications.chatIds.includes(newChatId.trim())) {
      return;
    }

    setConfig((prev) => ({
      ...prev,
      telegramNotifications: {
        ...prev.telegramNotifications,
        chatIds: [...prev.telegramNotifications.chatIds, newChatId.trim()],
      },
    }));
    setNewChatId("");
  };

  // Remove Telegram chat ID
  const handleRemoveChatId = (chatId: string) => {
    setConfig((prev) => ({
      ...prev,
      telegramNotifications: {
        ...prev.telegramNotifications,
        chatIds: prev.telegramNotifications.chatIds.filter((c) => c !== chatId),
      },
    }));
  };

  // Save config to Firestore
  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const configRef = doc(db, "settings", "notifications");
      await setDoc(configRef, config);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving notification config:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="w-8 h-8 border-4 border-gray-300 dark:border-zinc-700 border-t-gray-900 dark:border-t-white rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-zinc-950 p-4 overflow-y-auto">
      <div className="w-full max-w-xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Notification Settings</h1>
        <p className="text-gray-600 dark:text-zinc-400 text-sm">
          Configure how you receive notifications when someone submits a booking request
        </p>
      </div>

      {/* Email Notifications Section */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Email Notifications</h2>
              <p className="text-sm text-gray-500 dark:text-zinc-500">Receive booking requests via email</p>
            </div>
          </div>
          <Switch
            checked={config.emailNotifications.enabled}
            onCheckedChange={(checked) =>
              setConfig((prev) => ({
                ...prev,
                emailNotifications: { ...prev.emailNotifications, enabled: checked },
              }))
            }
          />
        </div>

        {config.emailNotifications.enabled && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2 block">
                Email Recipients
              </label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Enter email address..."
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    setEmailError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleAddEmail()}
                  className="flex-1 bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white"
                />
                <Button
                  onClick={handleAddEmail}
                  className="bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-zinc-200"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {emailError && <p className="text-sm text-red-500 mt-1">{emailError}</p>}
            </div>

            {config.emailNotifications.recipients.length > 0 ? (
              <div className="space-y-2">
                {config.emailNotifications.recipients.map((email) => (
                  <div
                    key={email}
                    className="flex items-center justify-between bg-gray-50 dark:bg-zinc-800 rounded-lg px-4 py-3"
                  >
                    <span className="text-gray-900 dark:text-white">{email}</span>
                    <button
                      onClick={() => handleRemoveEmail(email)}
                      className="text-gray-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-zinc-500 italic">
                No email recipients configured. Add at least one email to receive notifications.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Telegram Notifications Section */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
              <Send className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Telegram Notifications</h2>
              <p className="text-sm text-gray-500 dark:text-zinc-500">Receive booking requests via Telegram</p>
            </div>
          </div>
          <Switch
            checked={config.telegramNotifications.enabled}
            onCheckedChange={(checked) =>
              setConfig((prev) => ({
                ...prev,
                telegramNotifications: { ...prev.telegramNotifications, enabled: checked },
              }))
            }
          />
        </div>

        {config.telegramNotifications.enabled && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2 block">
                Bot Token
              </label>
              <Input
                type="password"
                placeholder="Enter your Telegram bot token..."
                value={config.telegramNotifications.botToken}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    telegramNotifications: { ...prev.telegramNotifications, botToken: e.target.value },
                  }))
                }
                className="bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-zinc-500 mt-1">
                Create a bot via @BotFather on Telegram to get your token
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2 block">
                Chat IDs
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Enter chat ID..."
                  value={newChatId}
                  onChange={(e) => setNewChatId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddChatId()}
                  className="flex-1 bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white"
                />
                <Button
                  onClick={handleAddChatId}
                  className="bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-zinc-200"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-500 dark:text-zinc-500 mt-1">
                Send /start to your bot, then use @userinfobot to find your chat ID
              </p>
            </div>

            {config.telegramNotifications.chatIds.length > 0 ? (
              <div className="space-y-2">
                {config.telegramNotifications.chatIds.map((chatId) => (
                  <div
                    key={chatId}
                    className="flex items-center justify-between bg-gray-50 dark:bg-zinc-800 rounded-lg px-4 py-3"
                  >
                    <span className="text-gray-900 dark:text-white font-mono">{chatId}</span>
                    <button
                      onClick={() => handleRemoveChatId(chatId)}
                      className="text-gray-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-zinc-500 italic">
                No chat IDs configured. Add at least one chat ID to receive Telegram notifications.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        {saveSuccess && (
          <span className="text-green-600 dark:text-green-400 text-sm self-center">
            Settings saved successfully!
          </span>
        )}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-zinc-200 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>
      </div>
    </div>
  );
}

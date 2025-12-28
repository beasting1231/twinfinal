import { useState, useEffect, useCallback } from "react";
import { auth } from "../firebase/config";
import { useAuth } from "../contexts/AuthContext";
import type { EmailSettings } from "../components/Email/EmailSettingsModal";

// Helper to make API calls with auth token
async function apiCall<T>(
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: unknown
): Promise<T> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Not authenticated");
  }

  const token = await user.getIdToken();
  const response = await fetch(`/api${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "API request failed");
  }

  return response.json();
}

export function useEmailSettings() {
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentUser } = useAuth();

  // Load settings from API
  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    const loadSettings = async () => {
      try {
        const result = await apiCall<{ settings: EmailSettings | null }>("/settings", "GET");
        setSettings(result.settings);
        setError(null);
      } catch (err) {
        console.error("Error loading email settings:", err);
        setError("Failed to load email settings");
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [currentUser]);

  // Save settings via API
  const saveSettings = useCallback(async (newSettings: EmailSettings) => {
    if (!currentUser) {
      throw new Error("Must be authenticated to save settings");
    }

    try {
      await apiCall<{ success: boolean }>("/settings", "POST", newSettings);
      setSettings(newSettings);
      setError(null);
      return true;
    } catch (err) {
      console.error("Error saving email settings:", err);
      setError("Failed to save email settings");
      throw err;
    }
  }, [currentUser]);

  // Check if settings are configured
  const isConfigured = Boolean(
    settings?.imapHost &&
    settings?.imapUsername &&
    settings?.imapPassword
  );

  return {
    settings,
    loading,
    error,
    saveSettings,
    isConfigured,
  };
}

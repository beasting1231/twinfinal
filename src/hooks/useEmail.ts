import { useState, useCallback, useEffect, useRef } from "react";
import { auth } from "../firebase/config";
import type { EmailSettings } from "../components/Email/EmailSettingsModal";
import type { EmailFolder } from "../components/Email/EmailFolders";
import type { EmailSummary } from "../components/Email/EmailList";
import type { EmailContent } from "../components/Email/EmailViewer";

// Polling interval for new emails (30 seconds)
const POLL_INTERVAL_MS = 30 * 1000;

// Cache configuration
const CACHE_KEY_EMAILS = "email_content_cache";
const CACHE_KEY_FOLDERS = "email_folders_cache";
const CACHE_KEY_LIST = "email_list_cache";
const CACHE_EXPIRY_MS = 2 * 24 * 60 * 60 * 1000; // 2 days in milliseconds

interface CachedEmail {
  content: Omit<EmailContent, "date"> & { date: string };
  cachedAt: number;
}

interface CachedEmailList {
  emails: Array<Omit<EmailSummary, "date"> & { date: string }>;
  cachedAt: number;
}

interface CachedFolders {
  folders: EmailFolder[];
  cachedAt: number;
}

interface EmailCache {
  [key: string]: CachedEmail;
}

interface EmailListCache {
  [folderId: string]: CachedEmailList;
}

// Get email from cache
function getCachedEmail(folderId: string, uid: string): EmailContent | null {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY_EMAILS);
    if (!cacheStr) return null;

    const cache: EmailCache = JSON.parse(cacheStr);
    const key = `${folderId}:${uid}`;
    const cached = cache[key];

    if (!cached) return null;

    if (Date.now() - cached.cachedAt > CACHE_EXPIRY_MS) {
      delete cache[key];
      localStorage.setItem(CACHE_KEY_EMAILS, JSON.stringify(cache));
      return null;
    }

    return {
      ...cached.content,
      date: new Date(cached.content.date),
    };
  } catch {
    return null;
  }
}

// Save email to cache
function setCachedEmail(folderId: string, uid: string, content: EmailContent): void {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY_EMAILS);
    const cache: EmailCache = cacheStr ? JSON.parse(cacheStr) : {};
    const key = `${folderId}:${uid}`;

    cache[key] = {
      content: {
        ...content,
        date: content.date.toISOString(),
      },
      cachedAt: Date.now(),
    };

    localStorage.setItem(CACHE_KEY_EMAILS, JSON.stringify(cache));
  } catch {
    // Ignore cache errors
  }
}

// Get folders from cache
function getCachedFolders(): EmailFolder[] | null {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY_FOLDERS);
    if (!cacheStr) return null;

    const cached: CachedFolders = JSON.parse(cacheStr);

    if (Date.now() - cached.cachedAt > CACHE_EXPIRY_MS) {
      localStorage.removeItem(CACHE_KEY_FOLDERS);
      return null;
    }

    return cached.folders;
  } catch {
    return null;
  }
}

// Save folders to cache
function setCachedFolders(folders: EmailFolder[]): void {
  try {
    const cached: CachedFolders = {
      folders,
      cachedAt: Date.now(),
    };
    localStorage.setItem(CACHE_KEY_FOLDERS, JSON.stringify(cached));
  } catch {
    // Ignore cache errors
  }
}

// Get email list from cache
function getCachedEmailList(folderId: string): EmailSummary[] | null {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY_LIST);
    if (!cacheStr) return null;

    const cache: EmailListCache = JSON.parse(cacheStr);
    const cached = cache[folderId];

    if (!cached) return null;

    if (Date.now() - cached.cachedAt > CACHE_EXPIRY_MS) {
      delete cache[folderId];
      localStorage.setItem(CACHE_KEY_LIST, JSON.stringify(cache));
      return null;
    }

    return cached.emails.map((e) => ({
      ...e,
      date: new Date(e.date),
    }));
  } catch {
    return null;
  }
}

// Save email list to cache
function setCachedEmailList(folderId: string, emails: EmailSummary[]): void {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY_LIST);
    const cache: EmailListCache = cacheStr ? JSON.parse(cacheStr) : {};

    cache[folderId] = {
      emails: emails.map((e) => ({
        ...e,
        date: e.date.toISOString(),
      })),
      cachedAt: Date.now(),
    };

    localStorage.setItem(CACHE_KEY_LIST, JSON.stringify(cache));
  } catch {
    // Ignore cache errors
  }
}

// Clean up expired cache entries
function cleanExpiredCache(): void {
  try {
    // Clean email content cache
    const emailCacheStr = localStorage.getItem(CACHE_KEY_EMAILS);
    if (emailCacheStr) {
      const cache: EmailCache = JSON.parse(emailCacheStr);
      const now = Date.now();
      let hasChanges = false;

      for (const key of Object.keys(cache)) {
        if (now - cache[key].cachedAt > CACHE_EXPIRY_MS) {
          delete cache[key];
          hasChanges = true;
        }
      }

      if (hasChanges) {
        localStorage.setItem(CACHE_KEY_EMAILS, JSON.stringify(cache));
      }
    }

    // Clean email list cache
    const listCacheStr = localStorage.getItem(CACHE_KEY_LIST);
    if (listCacheStr) {
      const cache: EmailListCache = JSON.parse(listCacheStr);
      const now = Date.now();
      let hasChanges = false;

      for (const key of Object.keys(cache)) {
        if (now - cache[key].cachedAt > CACHE_EXPIRY_MS) {
          delete cache[key];
          hasChanges = true;
        }
      }

      if (hasChanges) {
        localStorage.setItem(CACHE_KEY_LIST, JSON.stringify(cache));
      }
    }

    // Clean folders cache
    const foldersCacheStr = localStorage.getItem(CACHE_KEY_FOLDERS);
    if (foldersCacheStr) {
      const cached: CachedFolders = JSON.parse(foldersCacheStr);
      if (Date.now() - cached.cachedAt > CACHE_EXPIRY_MS) {
        localStorage.removeItem(CACHE_KEY_FOLDERS);
      }
    }
  } catch {
    // Ignore cache errors
  }
}

// Helper to get auth token and make API calls
async function apiCall<T>(
  endpoint: string,
  method: "GET" | "POST" = "POST",
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

export function useEmail(settings: EmailSettings | null) {
  const [folders, setFolders] = useState<EmailFolder[]>([]);
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track current folder for polling
  const currentFolderRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clean expired cache on mount
  useEffect(() => {
    cleanExpiredCache();
  }, []);

  // Fetch folders from IMAP (with stale-while-revalidate caching)
  const fetchFolders = useCallback(async () => {
    if (!settings) return;

    // Load from cache immediately
    const cachedFolders = getCachedFolders();
    if (cachedFolders) {
      setFolders(cachedFolders);
    } else {
      setLoadingFolders(true);
    }

    setError(null);

    try {
      const result = await apiCall<{ folders: EmailFolder[] }>("/folders", "POST", settings);
      setFolders(result.folders);
      setCachedFolders(result.folders);
    } catch (err: unknown) {
      console.error("Error fetching folders:", err);
      // Only show error if we don't have cached data
      if (!cachedFolders) {
        setError(err instanceof Error ? err.message : "Failed to fetch folders");
      }
    } finally {
      setLoadingFolders(false);
    }
  }, [settings]);

  // Fetch emails from a folder (with stale-while-revalidate caching)
  const fetchEmails = useCallback(
    async (folderId: string) => {
      if (!settings) return;

      // Load from cache immediately
      const cachedEmails = getCachedEmailList(folderId);
      if (cachedEmails) {
        setEmails(cachedEmails);
      } else {
        setLoadingEmails(true);
      }

      setError(null);

      try {
        const result = await apiCall<{
          emails: Array<{
            uid: number;
            from: string;
            subject: string;
            date: string;
            read: boolean;
          }>;
        }>("/emails", "POST", { settings, folderId, limit: 50 });

        const mappedEmails: EmailSummary[] = result.emails.map((e) => ({
          id: String(e.uid),
          from: e.from,
          subject: e.subject,
          preview: "",
          date: new Date(e.date),
          read: e.read,
        }));

        setEmails(mappedEmails);
        setCachedEmailList(folderId, mappedEmails);
      } catch (err: unknown) {
        console.error("Error fetching emails:", err);
        // Only show error if we don't have cached data
        if (!cachedEmails) {
          setError(err instanceof Error ? err.message : "Failed to fetch emails");
        }
      } finally {
        setLoadingEmails(false);
      }
    },
    [settings]
  );

  // Fetch full email content (with caching)
  const fetchEmailContent = useCallback(
    async (folderId: string, uid: string): Promise<EmailContent | null> => {
      if (!settings) return null;

      // Check cache first
      const cached = getCachedEmail(folderId, uid);
      if (cached) {
        return cached;
      }

      try {
        const result = await apiCall<{
          email: {
            uid: number;
            from: string;
            to: string;
            subject: string;
            date: string;
            body: string;
            html: string | null;
            read?: boolean;
            starred?: boolean;
          };
        }>(`/email/${uid}`, "POST", { settings, folderId });

        const emailContent: EmailContent = {
          id: String(result.email.uid),
          from: result.email.from,
          to: result.email.to,
          subject: result.email.subject,
          body: result.email.body,
          html: result.email.html,
          date: new Date(result.email.date),
          read: result.email.read ?? true,
          starred: result.email.starred ?? false,
        };

        // Save to cache
        setCachedEmail(folderId, uid, emailContent);

        return emailContent;
      } catch (err: unknown) {
        console.error("Error fetching email content:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch email content");
        return null;
      }
    },
    [settings]
  );

  // Send an email
  const sendEmail = useCallback(
    async (to: string, subject: string, body: string): Promise<boolean> => {
      if (!settings) return false;

      try {
        await apiCall<{ success: boolean }>("/send", "POST", { settings, to, subject, body });
        return true;
      } catch (err: unknown) {
        console.error("Error sending email:", err);
        setError(err instanceof Error ? err.message : "Failed to send email");
        return false;
      }
    },
    [settings]
  );

  // Silent fetch for polling (no loading states)
  const silentFetchEmails = useCallback(
    async (folderId: string) => {
      if (!settings) return;

      try {
        const result = await apiCall<{
          emails: Array<{
            uid: number;
            from: string;
            subject: string;
            date: string;
            read: boolean;
          }>;
        }>("/emails", "POST", { settings, folderId, limit: 50 });

        const mappedEmails: EmailSummary[] = result.emails.map((e) => ({
          id: String(e.uid),
          from: e.from,
          subject: e.subject,
          preview: "",
          date: new Date(e.date),
          read: e.read,
        }));

        setEmails(mappedEmails);
        setCachedEmailList(folderId, mappedEmails);
      } catch (err: unknown) {
        // Silently fail - don't show errors for background polling
        console.error("Error polling emails:", err);
      }
    },
    [settings]
  );

  // Start polling for the current folder
  const startPolling = useCallback(
    (folderId: string) => {
      currentFolderRef.current = folderId;

      // Clear any existing interval
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      // Start new polling interval
      pollIntervalRef.current = setInterval(() => {
        if (currentFolderRef.current) {
          silentFetchEmails(currentFolderRef.current);
        }
      }, POLL_INTERVAL_MS);
    },
    [silentFetchEmails]
  );

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    currentFolderRef.current = null;
  }, []);

  // Delete email
  const deleteEmail = useCallback(
    async (folderId: string, uid: string): Promise<boolean> => {
      if (!settings) return false;

      try {
        await apiCall<{ success: boolean }>("/delete", "POST", {
          settings,
          folderId,
          uid,
        });
        // Remove from local state
        setEmails((prev) => prev.filter((e) => e.id !== uid));
        return true;
      } catch (err: unknown) {
        console.error("Error deleting email:", err);
        setError(err instanceof Error ? err.message : "Failed to delete email");
        return false;
      }
    },
    [settings]
  );

  // Archive email
  const archiveEmail = useCallback(
    async (folderId: string, uid: string): Promise<boolean> => {
      if (!settings) return false;

      try {
        await apiCall<{ success: boolean }>("/archive", "POST", {
          settings,
          folderId,
          uid,
        });
        // Remove from local state
        setEmails((prev) => prev.filter((e) => e.id !== uid));
        return true;
      } catch (err: unknown) {
        console.error("Error archiving email:", err);
        setError(err instanceof Error ? err.message : "Failed to archive email");
        return false;
      }
    },
    [settings]
  );

  // Mark email as unread
  const markAsUnread = useCallback(
    async (folderId: string, uid: string): Promise<boolean> => {
      if (!settings) return false;

      try {
        await apiCall<{ success: boolean }>("/mark-unread", "POST", {
          settings,
          folderId,
          uid,
        });
        // Update local state
        setEmails((prev) =>
          prev.map((e) => (e.id === uid ? { ...e, read: false } : e))
        );
        return true;
      } catch (err: unknown) {
        console.error("Error marking as unread:", err);
        setError(err instanceof Error ? err.message : "Failed to mark as unread");
        return false;
      }
    },
    [settings]
  );

  // Star/unstar email
  const starEmail = useCallback(
    async (folderId: string, uid: string, starred: boolean): Promise<boolean> => {
      if (!settings) return false;

      try {
        await apiCall<{ success: boolean }>("/star", "POST", {
          settings,
          folderId,
          uid,
          starred,
        });
        return true;
      } catch (err: unknown) {
        console.error("Error starring email:", err);
        setError(err instanceof Error ? err.message : "Failed to star email");
        return false;
      }
    },
    [settings]
  );

  // Mark email as read
  const markAsRead = useCallback(
    async (folderId: string, uid: string): Promise<boolean> => {
      if (!settings) return false;

      try {
        await apiCall<{ success: boolean }>("/mark-read", "POST", {
          settings,
          folderId,
          uid,
        });
        // Update local state
        setEmails((prev) =>
          prev.map((e) => (e.id === uid ? { ...e, read: true } : e))
        );
        return true;
      } catch (err: unknown) {
        console.error("Error marking as read:", err);
        setError(err instanceof Error ? err.message : "Failed to mark as read");
        return false;
      }
    },
    [settings]
  );

  // Move email to inbox (restore/unarchive)
  const moveToInbox = useCallback(
    async (folderId: string, uid: string): Promise<boolean> => {
      if (!settings) return false;

      try {
        await apiCall<{ success: boolean }>("/move-to-inbox", "POST", {
          settings,
          folderId,
          uid,
        });
        // Remove from local state
        setEmails((prev) => prev.filter((e) => e.id !== uid));
        return true;
      } catch (err: unknown) {
        console.error("Error moving to inbox:", err);
        setError(err instanceof Error ? err.message : "Failed to move to inbox");
        return false;
      }
    },
    [settings]
  );

  // Search emails by content using IMAP SEARCH
  const searchEmails = useCallback(
    async (folderId: string, query: string): Promise<EmailSummary[]> => {
      if (!settings || !query.trim()) return [];

      try {
        const result = await apiCall<{
          emails: Array<{
            uid: number;
            from: string;
            subject: string;
            date: string;
            read: boolean;
          }>;
        }>("/search", "POST", { settings, folderId, query });

        return result.emails.map((e) => ({
          id: String(e.uid),
          from: e.from,
          subject: e.subject,
          preview: "",
          date: new Date(e.date),
          read: e.read,
        }));
      } catch (err: unknown) {
        console.error("Error searching emails:", err);
        setError(err instanceof Error ? err.message : "Failed to search emails");
        return [];
      }
    },
    [settings]
  );

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  return {
    folders,
    emails,
    loadingFolders,
    loadingEmails,
    error,
    fetchFolders,
    fetchEmails,
    fetchEmailContent,
    sendEmail,
    startPolling,
    stopPolling,
    deleteEmail,
    archiveEmail,
    markAsUnread,
    markAsRead,
    starEmail,
    moveToInbox,
    searchEmails,
  };
}

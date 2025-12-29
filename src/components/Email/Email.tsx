import { useState, useCallback, useEffect, useRef } from "react";
import { EmailFolders } from "./EmailFolders";
import { EmailList } from "./EmailList";
import { EmailViewer } from "./EmailViewer";
import { ComposeModal, type ComposeData } from "./ComposeModal";
import { EmailSettingsModal } from "./EmailSettingsModal";
import { useEmailSettings } from "../../hooks/useEmailSettings";
import { useEmail } from "../../hooks/useEmail";
import { Loader2, Mail, Search, ChevronDown, Settings, Plus, PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { EmailContent, EmailAction } from "./EmailViewer";

// Hook to detect mobile viewport
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [breakpoint]);

  return isMobile;
}

type MobileView = "list" | "viewer" | "compose";

export function Email() {
  const { settings, loading: settingsLoading, saveSettings, isConfigured } = useEmailSettings();
  const {
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
    markAsAnswered,
    starEmail,
    moveToInbox,
    searchEmails,
  } = useEmail(settings);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [emailContent, setEmailContent] = useState<EmailContent | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeData, setComposeData] = useState<ComposeData | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Mobile-specific state
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [foldersOpen, setFoldersOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<typeof emails | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced server-side search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim() || !selectedFolderId) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    // Debounce search by 500ms
    searchTimeoutRef.current = setTimeout(async () => {
      const results = await searchEmails(selectedFolderId, searchQuery);
      setSearchResults(results);
      setIsSearching(false);
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, selectedFolderId, searchEmails]);

  // Use search results when searching, otherwise show all emails
  const filteredEmails = searchResults !== null ? searchResults : emails;

  const currentFolderName = folders.find(f => f.id === selectedFolderId)?.name || "Inbox";

  // Fetch folders when settings are configured
  useEffect(() => {
    if (isConfigured && settings) {
      fetchFolders();
    }
  }, [isConfigured, settings, fetchFolders]);

  // Select first folder when folders are loaded
  useEffect(() => {
    if (folders.length > 0 && !selectedFolderId) {
      const inbox = folders.find(
        (f) => f.id.toUpperCase() === "INBOX" || f.name.toUpperCase() === "INBOX"
      );
      setSelectedFolderId(inbox?.id || folders[0].id);
    }
  }, [folders, selectedFolderId]);

  // Fetch emails when folder changes and start polling
  useEffect(() => {
    if (selectedFolderId && isConfigured) {
      fetchEmails(selectedFolderId);
      startPolling(selectedFolderId);
      setSelectedEmailId(null);
      setEmailContent(null);
    }

    return () => {
      stopPolling();
    };
  }, [selectedFolderId, isConfigured, fetchEmails, startPolling, stopPolling]);

  const handleFolderSelect = (folderId: string) => {
    setSelectedFolderId(folderId);
    setSearchQuery(""); // Clear search when changing folders
    if (isMobile) {
      setFoldersOpen(false);
    }
  };

  const handleEmailSelect = useCallback(
    async (emailId: string) => {
      if (!selectedFolderId) return;

      setSelectedEmailId(emailId);
      setEmailLoading(true);

      // On mobile, switch to viewer
      if (isMobile) {
        setMobileView("viewer");
      }

      const content = await fetchEmailContent(selectedFolderId, emailId);
      setEmailContent(content);
      setEmailLoading(false);
    },
    [selectedFolderId, fetchEmailContent, isMobile]
  );

  const handleBackToList = () => {
    setMobileView("list");
    setSelectedEmailId(null);
    setEmailContent(null);
  };

  const handleCompose = () => {
    setComposeData(undefined);
    setComposeOpen(true);
  };

  const handleSendEmailFromViewer = async (to: string, subject: string, body: string): Promise<boolean> => {
    return await sendEmail(to, subject, body);
  };

  const handleMarkAnswered = useCallback((emailId: string) => {
    if (selectedFolderId) {
      markAsAnswered(selectedFolderId, emailId);
    }
  }, [selectedFolderId, markAsAnswered]);

  const handleSendEmail = async (email: { to: string; subject: string; body: string }) => {
    const success = await sendEmail(email.to, email.subject, email.body);
    if (success) {
      setComposeOpen(false);
      setComposeData(undefined);
    }
  };

  const handleSaveSettings = async (newSettings: typeof settings) => {
    if (newSettings) {
      await saveSettings(newSettings);
    }
  };

  const handleEmailAction = useCallback(
    async (action: EmailAction, emailId: string) => {
      if (!selectedFolderId) return;

      let success = false;
      switch (action) {
        case "delete":
          success = await deleteEmail(selectedFolderId, emailId);
          break;
        case "restore":
          success = await moveToInbox(selectedFolderId, emailId);
          break;
        case "archive":
          success = await archiveEmail(selectedFolderId, emailId);
          break;
        case "unarchive":
          success = await moveToInbox(selectedFolderId, emailId);
          break;
        case "markUnread":
          success = await markAsUnread(selectedFolderId, emailId);
          if (success && emailContent) {
            setEmailContent({ ...emailContent, read: false });
          }
          break;
        case "markRead":
          success = await markAsRead(selectedFolderId, emailId);
          if (success && emailContent) {
            setEmailContent({ ...emailContent, read: true });
          }
          break;
        case "star":
          success = await starEmail(selectedFolderId, emailId, true);
          if (success && emailContent) {
            setEmailContent({ ...emailContent, starred: true });
          }
          break;
        case "unstar":
          success = await starEmail(selectedFolderId, emailId, false);
          if (success && emailContent) {
            setEmailContent({ ...emailContent, starred: false });
          }
          break;
      }

      // Clear selection if email was removed/moved
      if (success && (action === "delete" || action === "archive" || action === "restore" || action === "unarchive")) {
        setSelectedEmailId(null);
        setEmailContent(null);
        // On mobile, go back to list
        if (isMobile) {
          setMobileView("list");
        }
      }
    },
    [selectedFolderId, deleteEmail, archiveEmail, markAsUnread, markAsRead, starEmail, moveToInbox, emailContent, isMobile]
  );

  // Show loading while settings are being fetched
  if (settingsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-stone-950">
        <Loader2 className="h-8 w-8 animate-spin text-stone-500" />
      </div>
    );
  }

  // Show setup prompt if not configured
  if (!isConfigured) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 bg-stone-950">
        <div className="text-center max-w-md">
          <Mail className="h-12 w-12 text-stone-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-stone-100 mb-2">
            Email Not Configured
          </h2>
          <p className="text-stone-400 mb-6">
            Configure your IMAP and SMTP settings to start using the email client.
          </p>
          <Button onClick={() => setSettingsOpen(true)}>Configure Email Settings</Button>
        </div>

        <EmailSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
          initialSettings={settings || undefined}
        />
      </div>
    );
  }

  // Mobile layout
  if (isMobile) {
    return (
      <TooltipProvider delayDuration={200}>
        <div className="flex-1 flex flex-col overflow-hidden bg-stone-950">

          {/* Mobile List View */}
          {mobileView === "list" && (
            <div className="flex-1 flex flex-col h-full">
              {/* Search Header */}
              <div className="flex items-center gap-2 px-3 py-3 border-b border-stone-800">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
                  <input
                    type="text"
                    placeholder="Search emails..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-stone-900 border border-stone-800 rounded-full text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-stone-700 focus:ring-1 focus:ring-stone-700"
                  />
                </div>
                <button
                  onClick={() => setMobileView("compose")}
                  className="flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-full bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-stone-100 transition-colors"
                >
                  <PenSquare className="h-4 w-4" />
                </button>
              </div>
              {/* Folder Selector */}
              <div className="border-b border-stone-800/50">
                <button
                  onClick={() => setFoldersOpen(!foldersOpen)}
                  className="w-full px-4 py-2 flex items-center justify-between text-left hover:bg-stone-900/50 transition-colors"
                >
                  <span className="text-xs font-medium text-stone-400 uppercase tracking-wider">
                    {currentFolderName}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-stone-500 transition-transform ${foldersOpen ? "rotate-180" : ""}`} />
                </button>
                {/* Expanded Folder List */}
                {foldersOpen && (
                  <div className="border-t border-stone-800/50 bg-stone-900/30">
                    {loadingFolders ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-stone-500" />
                      </div>
                    ) : (
                      <div className="py-1">
                        {folders.map((folder) => (
                          <button
                            key={folder.id}
                            onClick={() => handleFolderSelect(folder.id)}
                            className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                              selectedFolderId === folder.id
                                ? "bg-stone-800 text-stone-100"
                                : "text-stone-400 hover:bg-stone-800/50 hover:text-stone-200"
                            }`}
                          >
                            {folder.name}
                          </button>
                        ))}
                        {/* Compose and Settings buttons */}
                        <div className="border-t border-stone-800/50 mt-1 pt-1 flex gap-2 px-4 py-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              setFoldersOpen(false);
                              handleCompose();
                            }}
                            className="flex-1"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Compose
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setFoldersOpen(false);
                              setSettingsOpen(true);
                            }}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Email List */}
              <div className="flex-1 overflow-y-auto">
                {loadingEmails || isSearching ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-5 w-5 animate-spin text-stone-500" />
                  </div>
                ) : (
                  <EmailList
                    emails={filteredEmails}
                    selectedEmailId={selectedEmailId}
                    onEmailSelect={handleEmailSelect}
                    currentFolder={selectedFolderId || undefined}
                  />
                )}
              </div>
            </div>
          )}

          {/* Mobile Viewer */}
          {mobileView === "viewer" && (
            <div className="flex-1 flex flex-col h-full">
              <EmailViewer
                email={emailContent}
                loading={emailLoading}
                currentFolder={selectedFolderId || undefined}
                onSendEmail={handleSendEmailFromViewer}
                onAction={handleEmailAction}
                onMarkAnswered={handleMarkAnswered}
                onBack={handleBackToList}
                isMobile
              />
            </div>
          )}

          {/* Mobile Compose */}
          {mobileView === "compose" && (
            <div className="flex-1 flex flex-col h-full">
              <EmailViewer
                email={null}
                loading={false}
                onSendEmail={handleSendEmailFromViewer}
                onBack={handleBackToList}
                isMobile
                composeNewEmail
              />
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="fixed bottom-4 left-4 right-4 bg-red-950 border border-red-800 text-red-200 px-4 py-2 rounded-lg shadow-lg text-sm">
              {error}
            </div>
          )}

          {/* Compose modal */}
          <ComposeModal
            open={composeOpen}
            onClose={() => {
              setComposeOpen(false);
              setComposeData(undefined);
            }}
            onSend={handleSendEmail}
            initialData={composeData}
          />

          {/* Settings modal */}
          <EmailSettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            onSave={handleSaveSettings}
            initialSettings={settings || undefined}
          />
        </div>
      </TooltipProvider>
    );
  }

  // Desktop layout
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex-1 flex overflow-hidden bg-stone-950">
        {/* Sidebar - Folders */}
        <div className="w-56 border-r border-stone-800 flex flex-col h-full">
          {loadingFolders ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-stone-500" />
            </div>
          ) : (
            <EmailFolders
              folders={folders}
              selectedFolderId={selectedFolderId}
              onFolderSelect={handleFolderSelect}
              onCompose={handleCompose}
              onSettings={() => setSettingsOpen(true)}
            />
          )}
        </div>

        {/* Email List */}
        <div className="w-80 border-r border-stone-800 flex flex-col h-full">
          {/* Search Input */}
          <div className="p-3 border-b border-stone-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" />
              <input
                type="text"
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-stone-900 border border-stone-800 rounded-full text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-stone-700 focus:ring-1 focus:ring-stone-700"
              />
            </div>
          </div>
          {/* Folder Label */}
          <div className="px-4 py-2 border-b border-stone-800/50">
            <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
              {currentFolderName}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingEmails || isSearching ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-5 w-5 animate-spin text-stone-500" />
              </div>
            ) : (
              <EmailList
                emails={filteredEmails}
                selectedEmailId={selectedEmailId}
                onEmailSelect={handleEmailSelect}
              />
            )}
          </div>
        </div>

        {/* Email Content */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <EmailViewer
            email={emailContent}
            loading={emailLoading}
            currentFolder={selectedFolderId || undefined}
            onSendEmail={handleSendEmailFromViewer}
            onAction={handleEmailAction}
            onMarkAnswered={handleMarkAnswered}
          />
        </div>

        {/* Error display */}
        {error && (
          <div className="fixed bottom-4 right-4 bg-red-950 border border-red-800 text-red-200 px-4 py-2 rounded-lg shadow-lg text-sm">
            {error}
          </div>
        )}

        {/* Compose modal */}
        <ComposeModal
          open={composeOpen}
          onClose={() => {
            setComposeOpen(false);
            setComposeData(undefined);
          }}
          onSend={handleSendEmail}
          initialData={composeData}
        />

        {/* Settings modal */}
        <EmailSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
          initialSettings={settings || undefined}
        />
      </div>
    </TooltipProvider>
  );
}

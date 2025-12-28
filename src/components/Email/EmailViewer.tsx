import { format, isToday } from "date-fns";
import {
  Loader2,
  Reply,
  Forward,
  Send,
  X,
  MoreVertical,
  Trash2,
  Star,
  Mail,
  MailOpen,
  Archive,
  Inbox,
  Clock,
  ArrowLeft,
  ChevronDown,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

export interface EmailContent {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  html: string | null;
  date: Date;
  read?: boolean;
  starred?: boolean;
}

type ComposeMode = "none" | "reply" | "forward";

export type EmailAction =
  | "delete"
  | "restore"
  | "star"
  | "unstar"
  | "markUnread"
  | "markRead"
  | "archive"
  | "unarchive";

interface EmailViewerProps {
  email: EmailContent | null;
  loading: boolean;
  currentFolder?: string;
  onSendEmail?: (to: string, subject: string, body: string) => Promise<boolean>;
  onAction?: (action: EmailAction, emailId: string) => void;
  onBack?: () => void;
  isMobile?: boolean;
}

// Helper to determine folder type
function getFolderType(folderId?: string): "inbox" | "trash" | "archive" | "other" {
  if (!folderId) return "other";
  const lower = folderId.toLowerCase();
  if (lower === "inbox") return "inbox";
  if (lower.includes("trash") || lower.includes("deleted")) return "trash";
  if (lower.includes("archive") || lower.includes("all mail")) return "archive";
  return "other";
}

// Simple email validation
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Extract display name from sender
function getDisplayName(from: string): string {
  const nameMatch = from.match(/^([^<]+)/);
  if (nameMatch) {
    return nameMatch[1].trim().replace(/"/g, "");
  }
  const emailMatch = from.match(/([^@]+)@/);
  return emailMatch ? emailMatch[1] : from;
}

// Extract email address from sender
function getEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

// Extract initials from sender
function getInitials(from: string): string {
  const name = getDisplayName(from);
  const parts = name.split(/[\s@]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function EmailViewer({ email, loading, currentFolder, onSendEmail, onAction, onBack, isMobile }: EmailViewerProps) {
  const folderType = getFolderType(currentFolder);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [composeMode, setComposeMode] = useState<ComposeMode>("none");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);
  const recipientInputRef = useRef<HTMLInputElement>(null);
  const [headerExpanded, setHeaderExpanded] = useState(false);

  const handleAction = (action: EmailAction) => {
    if (email && onAction) {
      onAction(action, email.id);
    }
  };

  // Get valid recipients for sending
  const validRecipients = recipients.filter(isValidEmail);

  // Reset compose and header state when email changes
  useEffect(() => {
    setComposeMode("none");
    setRecipients([]);
    setRecipientInput("");
    setComposeBody("");
    setHeaderExpanded(false);
  }, [email?.id]);

  const addRecipient = (emailAddr: string) => {
    const trimmed = emailAddr.trim();
    if (trimmed && !recipients.includes(trimmed)) {
      setRecipients([...recipients, trimmed]);
    }
    setRecipientInput("");
  };

  const removeRecipient = (emailAddr: string) => {
    setRecipients(recipients.filter((r) => r !== emailAddr));
  };

  const handleRecipientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === " " || e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (recipientInput.trim()) {
        addRecipient(recipientInput);
      }
    } else if (e.key === "Backspace" && !recipientInput && recipients.length > 0) {
      // Remove last recipient when backspace on empty input
      setRecipients(recipients.slice(0, -1));
    }
  };

  const handleRecipientBlur = () => {
    if (recipientInput.trim()) {
      addRecipient(recipientInput);
    }
  };

  useEffect(() => {
    if (email?.html && iframeRef.current) {
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  margin: 0;
                  padding: 16px;
                  background: #0c0a09;
                  color: #d6d3d1;
                }
                a { color: #60a5fa; }
                img { max-width: 100%; height: auto; }
              </style>
            </head>
            <body>${email.html}</body>
          </html>
        `);
        doc.close();
      }
    }
  }, [email?.html]);

  const handleStartReply = () => {
    if (!email) return;
    // Extract email address from "Name <email>" format
    const match = email.from.match(/<([^>]+)>/);
    const replyTo = match ? match[1] : email.from;
    setRecipients([replyTo]);
    setRecipientInput("");
    setComposeBody("");
    setComposeMode("reply");
  };

  const handleStartForward = () => {
    setRecipients([]);
    setRecipientInput("");
    setComposeBody("");
    setComposeMode("forward");
  };

  const handleCancelCompose = () => {
    setComposeMode("none");
    setRecipients([]);
    setRecipientInput("");
    setComposeBody("");
  };

  const handleSend = async () => {
    if (!email || !onSendEmail || validRecipients.length === 0) return;
    if (composeMode === "reply" && !composeBody.trim()) return;

    const toAddresses = validRecipients.join(", ");

    let subject: string;
    let fullBody: string;

    if (composeMode === "reply") {
      subject = email.subject.startsWith("Re:")
        ? email.subject
        : `Re: ${email.subject}`;

      fullBody = `${composeBody}\n\n---------- Original Message ----------\nFrom: ${email.from}\nDate: ${format(email.date, "MMM d, yyyy 'at' h:mm a")}\nSubject: ${email.subject}\n\n${email.body}`;
    } else {
      subject = email.subject.startsWith("Fwd:")
        ? email.subject
        : `Fwd: ${email.subject}`;

      fullBody = `${composeBody}\n\n---------- Forwarded Message ----------\nFrom: ${email.from}\nDate: ${format(email.date, "MMM d, yyyy 'at' h:mm a")}\nSubject: ${email.subject}\nTo: ${email.to}\n\n${email.body}`;
    }

    setSending(true);
    const success = await onSendEmail(toAddresses, subject, fullBody);
    setSending(false);

    if (success) {
      setComposeMode("none");
      setRecipients([]);
      setRecipientInput("");
      setComposeBody("");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-stone-950">
        {isMobile && onBack && (
          <div className="flex items-center px-2 py-2 border-b border-stone-800">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-9 w-9 text-stone-400"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-stone-600" />
        </div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex flex-col h-full bg-stone-950">
        {isMobile && onBack && (
          <div className="flex items-center px-2 py-2 border-b border-stone-800">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-9 w-9 text-stone-400"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center text-stone-500">
          <p className="text-sm">No message selected</p>
        </div>
      </div>
    );
  }

  const displayName = getDisplayName(email.from);
  const emailAddress = getEmailAddress(email.from);
  const initials = getInitials(email.from);
  const formattedDate = isToday(email.date)
    ? format(email.date, "'Today at' h:mm a")
    : format(email.date, "MMM d, yyyy 'at' h:mm a");

  return (
    <div className="flex flex-col h-full bg-stone-950">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 md:px-4 py-2 border-b border-stone-800">
        <div className="flex items-center gap-1">
          {/* Back button on mobile */}
          {isMobile && onBack && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="h-8 w-8 text-stone-400 hover:text-stone-100 hover:bg-stone-800"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Separator orientation="vertical" className="mx-1 h-6 bg-stone-800" />
            </>
          )}
          {/* Archive/Unarchive button */}
          {folderType === "archive" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleAction("unarchive")}
                  className="h-8 w-8 text-stone-400 hover:text-stone-100 hover:bg-stone-800"
                >
                  <Inbox className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move to Inbox</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleAction("archive")}
                  className="h-8 w-8 text-stone-400 hover:text-stone-100 hover:bg-stone-800"
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Archive</TooltipContent>
            </Tooltip>
          )}
          {/* Delete/Restore button */}
          {folderType === "trash" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleAction("restore")}
                  className="h-8 w-8 text-stone-400 hover:text-stone-100 hover:bg-stone-800"
                >
                  <Inbox className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Restore to Inbox</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleAction("delete")}
                  className="h-8 w-8 text-stone-400 hover:text-stone-100 hover:bg-stone-800"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move to trash</TooltipContent>
            </Tooltip>
          )}
          <Separator orientation="vertical" className="mx-1 h-6 bg-stone-800" />
          {/* Mark read/unread button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleAction(email.read ? "markUnread" : "markRead")}
                className="h-8 w-8 text-stone-400 hover:text-stone-100 hover:bg-stone-800"
              >
                {email.read ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{email.read ? "Mark as unread" : "Mark as read"}</TooltipContent>
          </Tooltip>
          {/* Star/Unstar button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleAction(email.starred ? "unstar" : "star")}
                className={`h-8 w-8 hover:bg-stone-800 ${
                  email.starred ? "text-yellow-500 hover:text-yellow-400" : "text-stone-400 hover:text-stone-100"
                }`}
              >
                <Star className={`h-4 w-4 ${email.starred ? "fill-current" : ""}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{email.starred ? "Unstar" : "Star"}</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleStartReply}
                disabled={composeMode !== "none"}
                className="h-8 w-8 text-stone-400 hover:text-stone-100 hover:bg-stone-800"
              >
                <Reply className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reply</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleStartForward}
                disabled={composeMode !== "none"}
                className="h-8 w-8 text-stone-400 hover:text-stone-100 hover:bg-stone-800"
              >
                <Forward className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Forward</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="mx-1 h-6 bg-stone-800" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-stone-400 hover:text-stone-100 hover:bg-stone-800"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-stone-900 border-stone-800">
              <DropdownMenuItem
                onClick={() => handleAction(email.starred ? "unstar" : "star")}
                className="text-stone-200 focus:bg-stone-800 focus:text-stone-100"
              >
                <Star className={`mr-2 h-4 w-4 ${email.starred ? "text-yellow-500 fill-current" : "text-yellow-500"}`} />
                {email.starred ? "Unstar" : "Star"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAction(email.read ? "markUnread" : "markRead")}
                className="text-stone-200 focus:bg-stone-800 focus:text-stone-100"
              >
                {email.read ? <MailOpen className="mr-2 h-4 w-4" /> : <Mail className="mr-2 h-4 w-4" />}
                {email.read ? "Mark as unread" : "Mark as read"}
              </DropdownMenuItem>
              {folderType === "archive" ? (
                <DropdownMenuItem
                  onClick={() => handleAction("unarchive")}
                  className="text-stone-200 focus:bg-stone-800 focus:text-stone-100"
                >
                  <Inbox className="mr-2 h-4 w-4" />
                  Move to Inbox
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => handleAction("archive")}
                  className="text-stone-200 focus:bg-stone-800 focus:text-stone-100"
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="bg-stone-800" />
              {folderType === "trash" ? (
                <DropdownMenuItem
                  onClick={() => handleAction("restore")}
                  className="text-stone-200 focus:bg-stone-800 focus:text-stone-100"
                >
                  <Inbox className="mr-2 h-4 w-4" />
                  Restore to Inbox
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => handleAction("delete")}
                  className="text-red-400 focus:bg-stone-800 focus:text-red-300"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Email Header - Compact */}
      <div className="border-b border-stone-800">
        <button
          onClick={() => setHeaderExpanded(!headerExpanded)}
          className="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-stone-900/30 transition-colors"
        >
          <ChevronDown className={`h-4 w-4 text-stone-500 flex-shrink-0 transition-transform ${headerExpanded ? "rotate-180" : ""}`} />
          <h2 className="flex-1 font-medium text-stone-100 truncate">
            {email.subject || "(No subject)"}
          </h2>
        </button>
        {/* Expanded Header Details */}
        {headerExpanded && (
          <div className="px-4 pb-3 pt-1 border-t border-stone-800/50 bg-stone-900/20">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-stone-700 flex items-center justify-center text-xs font-medium text-stone-200">
                {initials}
              </div>
              {/* Details */}
              <div className="flex-1 min-w-0 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-stone-100">{displayName}</span>
                  <span className="text-stone-500 truncate">&lt;{emailAddress}&gt;</span>
                </div>
                <div className="text-stone-400 mt-0.5">
                  To: <span className="text-stone-300">{email.to}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-1">
                  <Clock className="h-3 w-3" />
                  {formattedDate}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Inline Compose Area (Reply/Forward) */}
      {composeMode !== "none" && (
        <div className="p-4 border-b border-stone-800 bg-stone-900/30">
          <div className="flex items-center gap-2 mb-3">
            <div className={`px-2 py-1 rounded text-xs font-medium ${
              composeMode === "reply"
                ? "bg-blue-600/20 text-blue-400"
                : "bg-orange-600/20 text-orange-400"
            }`}>
              {composeMode === "reply" ? "Reply" : "Forward"}
            </div>
          </div>
          <div className="flex items-start gap-3 mb-3">
            <span className="text-sm text-stone-500 w-6 pt-2 text-right">To</span>
            <div
              className="flex-1 flex flex-wrap items-center gap-1.5 px-3 py-2 bg-stone-900/50 border border-stone-800 rounded-lg focus-within:border-stone-700 min-h-[40px] cursor-text"
              onClick={() => recipientInputRef.current?.focus()}
            >
              {recipients.map((recipient) => {
                const isValid = isValidEmail(recipient);
                return (
                  <span
                    key={recipient}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-sm rounded ${
                      isValid
                        ? "bg-stone-800 text-stone-200"
                        : "bg-red-900/30 text-red-300 border border-red-800/50"
                    }`}
                    title={isValid ? undefined : "Invalid email address"}
                  >
                    {recipient}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecipient(recipient);
                      }}
                      className="text-stone-500 hover:text-stone-300 ml-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
              <input
                ref={recipientInputRef}
                type="text"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={handleRecipientKeyDown}
                onBlur={handleRecipientBlur}
                placeholder={recipients.length === 0 ? "Add recipients..." : ""}
                className="flex-1 min-w-[120px] bg-transparent text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none"
                autoFocus={composeMode === "forward"}
              />
            </div>
          </div>
          <Textarea
            value={composeBody}
            onChange={(e) => {
              setComposeBody(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.max(100, e.target.scrollHeight)}px`;
            }}
            placeholder={composeMode === "reply" ? "Write your reply..." : "Add a message (optional)..."}
            className="min-h-[100px] bg-stone-900/50 border-stone-800 text-stone-100 placeholder:text-stone-600 focus:border-stone-700 resize-y rounded-lg"
            autoFocus={composeMode === "reply"}
          />
          <div className="flex justify-between items-center mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelCompose}
              disabled={sending}
              className="text-stone-400 hover:text-stone-200 hover:bg-stone-800"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={sending || validRecipients.length === 0 || (composeMode === "reply" && !composeBody.trim())}
              className="gap-2 bg-stone-100 text-stone-900 hover:bg-stone-200"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send
            </Button>
          </div>
        </div>
      )}

      {/* Email Content */}
      <div className="flex-1 overflow-hidden">
        {email.html ? (
          <iframe
            ref={iframeRef}
            title="Email content"
            className="w-full h-full border-0 bg-stone-950"
            sandbox="allow-same-origin"
          />
        ) : (
          <div className="p-4 overflow-y-auto h-full">
            <div className="text-sm text-stone-300 whitespace-pre-wrap leading-relaxed">
              {email.body}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

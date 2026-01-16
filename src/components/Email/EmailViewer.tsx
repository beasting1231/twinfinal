import { format, isToday } from "date-fns";
import {
  Loader2,
  Reply,
  Forward,
  Send,
  X,
  Trash2,
  Star,
  Mail,
  MailOpen,
  Archive,
  Inbox,
  Clock,
  ArrowLeft,
  ChevronDown,
  Sparkles,
  Plus,
  Image,
  Paperclip,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

type ComposeMode = "none" | "reply" | "forward" | "new";

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
  onMarkAnswered?: (emailId: string) => void;
  onBack?: () => void;
  isMobile?: boolean;
  composeNewEmail?: boolean;
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

export function EmailViewer({ email, loading, currentFolder, onSendEmail, onAction, onMarkAnswered, onBack, isMobile, composeNewEmail }: EmailViewerProps) {
  const folderType = getFolderType(currentFolder);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [composeMode, setComposeMode] = useState<ComposeMode>("none");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [sending, setSending] = useState(false);
  const recipientInputRef = useRef<HTMLInputElement>(null);
  const [headerExpanded, setHeaderExpanded] = useState(false);

  // Attachment and image handling
  const [attachments, setAttachments] = useState<File[]>([]);
  const composeEditorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAction = (action: EmailAction) => {
    if (email && onAction) {
      onAction(action, email.id);
    }
  };

  // Get valid recipients for sending
  const validRecipients = recipients.filter(isValidEmail);

  // Reset compose and header state when email changes
  useEffect(() => {
    if (!composeNewEmail) {
      setComposeMode("none");
      setRecipients([]);
      setRecipientInput("");
      setComposeBody("");
      setComposeSubject("");
      setHeaderExpanded(false);
      setAttachments([]);
      setSelectedImage(null);
      if (composeEditorRef.current) {
        composeEditorRef.current.innerHTML = "";
      }
    }
  }, [email?.id, composeNewEmail]);

  // Set compose mode when composeNewEmail is true
  useEffect(() => {
    if (composeNewEmail) {
      setComposeMode("new");
      setRecipients([]);
      setRecipientInput("");
      setComposeBody("");
      setComposeSubject("");
      setAttachments([]);
      setSelectedImage(null);
      if (composeEditorRef.current) {
        composeEditorRef.current.innerHTML = "";
      }
    }
  }, [composeNewEmail]);

  // State for image resizing
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  // Handle image insertion at cursor position
  const handleImageInsert = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !composeEditorRef.current) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;

      // Focus the editor and insert image at cursor or at end
      composeEditorRef.current?.focus();

      const selection = window.getSelection();
      const range = selection?.getRangeAt(0);

      // Create wrapper for resizable image
      const wrapper = document.createElement("span");
      wrapper.className = "inline-block relative";
      wrapper.contentEditable = "false";

      const img = document.createElement("img");
      img.src = base64;
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      img.style.margin = "8px 0";
      img.style.borderRadius = "4px";
      img.style.display = "block";
      img.style.cursor = "pointer";
      img.draggable = false;

      // Add click handler to select image for resizing
      img.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedImage(img);
      });

      wrapper.appendChild(img);

      if (range && composeEditorRef.current?.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        range.insertNode(wrapper);
        range.setStartAfter(wrapper);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      } else {
        composeEditorRef.current?.appendChild(wrapper);
      }

      // Update state
      setComposeBody(composeEditorRef.current?.innerText?.trim() || "");
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = "";
  };

  // Handle resize start
  const handleResizeStart = (e: React.MouseEvent) => {
    if (!selectedImage) return;
    e.preventDefault();
    e.stopPropagation();

    setIsResizing(true);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: selectedImage.offsetWidth,
      height: selectedImage.offsetHeight,
    };
  };

  // Handle resize move
  useEffect(() => {
    if (!isResizing || !selectedImage) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;

      const deltaX = e.clientX - resizeStartRef.current.x;
      const newWidth = Math.max(50, resizeStartRef.current.width + deltaX);

      // Maintain aspect ratio
      const aspectRatio = resizeStartRef.current.height / resizeStartRef.current.width;
      const newHeight = newWidth * aspectRatio;

      selectedImage.style.width = `${newWidth}px`;
      selectedImage.style.height = `${newHeight}px`;
      selectedImage.style.maxWidth = "none";
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
      // Update state
      if (composeEditorRef.current) {
        setComposeBody(composeEditorRef.current.innerText?.trim() || "");
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, selectedImage]);

  // Deselect image when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (selectedImage && !selectedImage.contains(e.target as Node)) {
        const resizeHandle = document.querySelector(".image-resize-handle");
        if (!resizeHandle?.contains(e.target as Node)) {
          setSelectedImage(null);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedImage]);

  // Handle file attachment
  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setAttachments(prev => [...prev, ...Array.from(files)]);
    e.target.value = "";
  };

  // Remove attachment
  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

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
    setAttachments([]);
    setSelectedImage(null);
    if (composeEditorRef.current) {
      composeEditorRef.current.innerHTML = "";
    }
    setComposeMode("reply");
  };

  const handleStartForward = () => {
    setRecipients([]);
    setRecipientInput("");
    setComposeBody("");
    setAttachments([]);
    setSelectedImage(null);
    if (composeEditorRef.current) {
      composeEditorRef.current.innerHTML = "";
    }
    setComposeMode("forward");
  };

  const handleCancelCompose = () => {
    setComposeMode("none");
    setRecipients([]);
    setRecipientInput("");
    setComposeBody("");
    setComposeSubject("");
    setAttachments([]);
    setSelectedImage(null);
    if (composeEditorRef.current) {
      composeEditorRef.current.innerHTML = "";
    }
    // If in compose new email mode, go back
    if (composeNewEmail && onBack) {
      onBack();
    }
  };

  const handleSend = async () => {
    if (!onSendEmail || validRecipients.length === 0) return;

    // Get content from editor
    const editorContent = composeEditorRef.current?.innerHTML || "";
    const textContent = composeEditorRef.current?.innerText?.trim() || "";

    // For new email, require subject and body
    if (composeMode === "new" && (!composeSubject.trim() || !textContent)) return;
    // For reply, require body
    if (composeMode === "reply" && !textContent) return;
    // For reply/forward, require email to exist
    if ((composeMode === "reply" || composeMode === "forward") && !email) return;

    const toAddresses = validRecipients.join(", ");

    let subject: string;
    let fullBody: string;

    // Check if content has images (HTML content)
    const hasImages = editorContent.includes("<img");

    if (composeMode === "new") {
      subject = composeSubject.trim();
      fullBody = hasImages ? editorContent : textContent;
    } else if (composeMode === "reply" && email) {
      subject = email.subject.startsWith("Re:")
        ? email.subject
        : `Re: ${email.subject}`;

      if (hasImages) {
        // Send as HTML
        fullBody = `${editorContent}<br><br><hr><p><strong>Original Message</strong></p><p>From: ${email.from}<br>Date: ${format(email.date, "MMM d, yyyy 'at' h:mm a")}<br>Subject: ${email.subject}</p><br>${email.html || email.body.replace(/\n/g, "<br>")}`;
      } else {
        fullBody = `${textContent}\n\n---------- Original Message ----------\nFrom: ${email.from}\nDate: ${format(email.date, "MMM d, yyyy 'at' h:mm a")}\nSubject: ${email.subject}\n\n${email.body}`;
      }
    } else if (email) {
      subject = email.subject.startsWith("Fwd:")
        ? email.subject
        : `Fwd: ${email.subject}`;

      if (hasImages) {
        fullBody = `${editorContent}<br><br><hr><p><strong>Forwarded Message</strong></p><p>From: ${email.from}<br>Date: ${format(email.date, "MMM d, yyyy 'at' h:mm a")}<br>Subject: ${email.subject}<br>To: ${email.to}</p><br>${email.html || email.body.replace(/\n/g, "<br>")}`;
      } else {
        fullBody = `${textContent}\n\n---------- Forwarded Message ----------\nFrom: ${email.from}\nDate: ${format(email.date, "MMM d, yyyy 'at' h:mm a")}\nSubject: ${email.subject}\nTo: ${email.to}\n\n${email.body}`;
      }
    } else {
      return;
    }

    setSending(true);
    const success = await onSendEmail(toAddresses, subject, fullBody);
    setSending(false);

    if (success) {
      // Mark original email as answered if this was a reply
      if (composeMode === "reply" && email && onMarkAnswered) {
        onMarkAnswered(email.id);
      }

      setComposeMode("none");
      setRecipients([]);
      setRecipientInput("");
      setComposeBody("");
      setComposeSubject("");
      setAttachments([]);
      setSelectedImage(null);
      if (composeEditorRef.current) {
        composeEditorRef.current.innerHTML = "";
      }
      // If in compose new email mode, go back
      if (composeNewEmail && onBack) {
        onBack();
      }
    }
  };

  // Compose new email view
  if (composeNewEmail && composeMode === "new") {
    return (
      <div className="flex flex-col h-full bg-stone-950">
        {/* Header */}
        <div className="flex items-center justify-between px-2 md:px-4 py-2 border-b border-stone-800">
          <div className="flex items-center gap-2">
            {onBack && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCancelCompose}
                className="h-8 w-8 text-stone-400 hover:text-stone-100 hover:bg-stone-800"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <span className="text-sm font-medium text-stone-100">New Message</span>
          </div>
        </div>

        {/* Compose Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-stone-900/30">
          {/* To field */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-800/50">
            <span className="text-xs text-stone-500">To:</span>
            <div
              className="flex-1 flex flex-wrap items-center gap-1 cursor-text"
              onClick={() => recipientInputRef.current?.focus()}
            >
              {recipients.map((recipient) => {
                const isValid = isValidEmail(recipient);
                return (
                  <span
                    key={recipient}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded ${
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
                      className="text-stone-500 hover:text-stone-300"
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
                className="flex-1 min-w-[80px] bg-transparent text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none"
                autoFocus
              />
            </div>
          </div>

          {/* Subject field */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-800/50">
            <span className="text-xs text-stone-500">Subject:</span>
            <input
              type="text"
              value={composeSubject}
              onChange={(e) => setComposeSubject(e.target.value)}
              placeholder="Enter subject..."
              className="flex-1 bg-transparent text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none"
            />
          </div>

          {/* Hidden file inputs */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageInsert}
            className="hidden"
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileAttach}
            className="hidden"
          />

          <div className="flex-1 relative overflow-hidden">
            <div
              ref={composeEditorRef}
              contentEditable
              data-placeholder="Write your message..."
              onInput={() => setComposeBody(composeEditorRef.current?.innerText?.trim() || "")}
              className="h-full w-full bg-stone-900/50 border-0 text-stone-100 focus:outline-none resize-none p-3 pr-12 overflow-y-auto empty:before:content-[attr(data-placeholder)] empty:before:text-stone-600"
              style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            />

            {/* Image resize overlay */}
            {selectedImage && composeEditorRef.current?.contains(selectedImage) && (
              <div
                className="pointer-events-none absolute"
                style={{
                  top: selectedImage.offsetTop + (selectedImage.parentElement?.offsetTop || 0),
                  left: selectedImage.offsetLeft + (selectedImage.parentElement?.offsetLeft || 0),
                  width: selectedImage.offsetWidth,
                  height: selectedImage.offsetHeight,
                }}
              >
                <div className="absolute inset-0 border-2 border-blue-500 rounded" />
                <div
                  className="image-resize-handle pointer-events-auto absolute -bottom-2 -right-2 w-4 h-4 bg-blue-500 rounded-full cursor-se-resize flex items-center justify-center shadow-lg"
                  onMouseDown={handleResizeStart}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="white">
                    <path d="M7 1L1 7M7 4L4 7M7 7L7 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            )}

            <div className="absolute top-2 right-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-stone-500 hover:text-stone-300 hover:bg-stone-800"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-stone-900 border-stone-800">
                  <DropdownMenuItem
                    onClick={() => imageInputRef.current?.click()}
                    className="text-stone-200 focus:bg-stone-800 focus:text-stone-100 cursor-pointer"
                  >
                    <Image className="mr-2 h-4 w-4" />
                    Insert image
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => fileInputRef.current?.click()}
                    className="text-stone-200 focus:bg-stone-800 focus:text-stone-100 cursor-pointer"
                  >
                    <Paperclip className="mr-2 h-4 w-4" />
                    Attach file
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Attachments list */}
          {attachments.length > 0 && (
            <div className="px-3 py-2 border-t border-stone-800 flex flex-wrap gap-2">
              {attachments.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-2 py-1 bg-stone-800 rounded text-xs text-stone-300"
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="max-w-[150px] truncate">{file.name}</span>
                  <span className="text-stone-500">({formatFileSize(file.size)})</span>
                  <button
                    onClick={() => removeAttachment(index)}
                    className="text-stone-500 hover:text-stone-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Footer with send button */}
          <div className="flex justify-between items-center px-3 py-2 border-t border-stone-800">
            <Button
              variant="outline"
              size="sm"
              disabled={sending}
              className="gap-1.5 border-stone-700 text-stone-300 hover:text-stone-100 hover:bg-stone-800"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI
            </Button>
            <div className="flex items-center gap-2">
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
                disabled={sending || validRecipients.length === 0 || !composeSubject.trim() || !composeBody}
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
        </div>
      </div>
    );
  }

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
    <div className="flex flex-col h-full overflow-hidden bg-stone-950">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between px-2 md:px-4 py-2 border-b border-stone-800">
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
        </div>
      </div>

      {/* Email Header - Compact */}
      <div className="flex-shrink-0 border-b border-stone-800">
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
        <div className="flex-shrink-0 border-b border-stone-800 bg-stone-900/30">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-800/50">
            <span className="text-xs text-stone-500">To:</span>
            <div
              className="flex-1 flex flex-wrap items-center gap-1 cursor-text"
              onClick={() => recipientInputRef.current?.focus()}
            >
              {recipients.map((recipient) => {
                const isValid = isValidEmail(recipient);
                return (
                  <span
                    key={recipient}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded ${
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
                      className="text-stone-500 hover:text-stone-300"
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
                className="flex-1 min-w-[80px] bg-transparent text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none"
                autoFocus={composeMode === "forward"}
              />
            </div>
          </div>
          {/* Hidden file inputs */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageInsert}
            className="hidden"
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileAttach}
            className="hidden"
          />

          <div className="relative">
            <div
              ref={composeEditorRef}
              contentEditable
              data-placeholder={composeMode === "reply" ? "Write your reply..." : "Add a message (optional)..."}
              onInput={() => setComposeBody(composeEditorRef.current?.innerText?.trim() || "")}
              className="min-h-[50vh] w-full bg-stone-900/50 border-0 border-b border-stone-800 text-stone-100 focus:outline-none resize-none p-3 pr-12 overflow-y-auto empty:before:content-[attr(data-placeholder)] empty:before:text-stone-600"
              style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            />

            {/* Image resize overlay */}
            {selectedImage && composeEditorRef.current?.contains(selectedImage) && (
              <div
                className="pointer-events-none absolute"
                style={{
                  top: selectedImage.offsetTop + (selectedImage.parentElement?.offsetTop || 0),
                  left: selectedImage.offsetLeft + (selectedImage.parentElement?.offsetLeft || 0),
                  width: selectedImage.offsetWidth,
                  height: selectedImage.offsetHeight,
                }}
              >
                {/* Selection border */}
                <div className="absolute inset-0 border-2 border-blue-500 rounded" />
                {/* Resize handle */}
                <div
                  className="image-resize-handle pointer-events-auto absolute -bottom-2 -right-2 w-4 h-4 bg-blue-500 rounded-full cursor-se-resize flex items-center justify-center shadow-lg"
                  onMouseDown={handleResizeStart}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="white">
                    <path d="M7 1L1 7M7 4L4 7M7 7L7 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            )}

            <div className="absolute top-2 right-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-stone-500 hover:text-stone-300 hover:bg-stone-800"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-stone-900 border-stone-800">
                  <DropdownMenuItem
                    onClick={() => imageInputRef.current?.click()}
                    className="text-stone-200 focus:bg-stone-800 focus:text-stone-100 cursor-pointer"
                  >
                    <Image className="mr-2 h-4 w-4" />
                    Insert image
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => fileInputRef.current?.click()}
                    className="text-stone-200 focus:bg-stone-800 focus:text-stone-100 cursor-pointer"
                  >
                    <Paperclip className="mr-2 h-4 w-4" />
                    Attach file
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Attachments list */}
          {attachments.length > 0 && (
            <div className="px-3 py-2 border-b border-stone-800 flex flex-wrap gap-2">
              {attachments.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-2 py-1 bg-stone-800 rounded text-xs text-stone-300"
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="max-w-[150px] truncate">{file.name}</span>
                  <span className="text-stone-500">({formatFileSize(file.size)})</span>
                  <button
                    onClick={() => removeAttachment(index)}
                    className="text-stone-500 hover:text-stone-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between items-center px-3 py-2">
            <Button
              variant="outline"
              size="sm"
              disabled={sending}
              className="gap-1.5 border-stone-700 text-stone-300 hover:text-stone-100 hover:bg-stone-800"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI
            </Button>
            <div className="flex items-center gap-2">
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
                disabled={sending || validRecipients.length === 0 || (composeMode === "reply" && !composeBody)}
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
        </div>
      )}

      {/* Email Content */}
      <div className="flex-1 min-h-0 relative">
        {email.html ? (
          <iframe
            ref={iframeRef}
            title="Email content"
            className="absolute inset-0 w-full h-full border-0 bg-stone-950"
            sandbox="allow-same-origin"
          />
        ) : (
          <div className="absolute inset-0 p-4 overflow-auto">
            <div className="text-sm text-stone-300 whitespace-pre-wrap leading-relaxed">
              {email.body}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

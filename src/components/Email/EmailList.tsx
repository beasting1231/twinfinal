import { format, isToday } from "date-fns";

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  preview: string;
  date: Date;
  read: boolean;
}

interface EmailListProps {
  emails: EmailSummary[];
  selectedEmailId: string | null;
  onEmailSelect: (emailId: string) => void;
}

// Extract initials from email sender
function getInitials(from: string): string {
  // Try to get name from "Name <email>" format
  const nameMatch = from.match(/^([^<]+)/);
  const name = nameMatch ? nameMatch[1].trim() : from;

  const parts = name.split(/[\s@]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// Extract display name from sender
function getDisplayName(from: string): string {
  const nameMatch = from.match(/^([^<]+)/);
  if (nameMatch) {
    return nameMatch[1].trim().replace(/"/g, "");
  }
  // If no name, return email part before @
  const emailMatch = from.match(/([^@]+)@/);
  return emailMatch ? emailMatch[1] : from;
}

export function EmailList({
  emails,
  selectedEmailId,
  onEmailSelect,
}: EmailListProps) {
  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-8 text-stone-500">
        <p className="text-sm">No messages</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-stone-800/50">
      {emails.map((email) => {
        const isSelected = selectedEmailId === email.id;
        const initials = getInitials(email.from);
        const displayName = getDisplayName(email.from);

        return (
          <button
            key={email.id}
            onClick={() => onEmailSelect(email.id)}
            className={`w-full text-left px-4 py-3 transition-colors ${
              isSelected
                ? "bg-stone-800"
                : "hover:bg-stone-900/50"
            }`}
          >
            <div className="flex gap-3">
              {/* Avatar */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                !email.read
                  ? "bg-blue-600 text-white"
                  : "bg-stone-700 text-stone-300"
              }`}>
                {initials}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm truncate ${
                    !email.read ? "font-semibold text-stone-100" : "text-stone-300"
                  }`}>
                    {displayName}
                  </span>
                  <span className={`text-xs flex-shrink-0 ${
                    !email.read ? "text-stone-300" : "text-stone-500"
                  }`}>
                    {isToday(email.date)
                      ? format(email.date, "h:mm a")
                      : format(email.date, "MMM d")}
                  </span>
                </div>
                <p className={`text-sm truncate mt-0.5 ${
                  !email.read ? "text-stone-200" : "text-stone-400"
                }`}>
                  {email.subject || "(No subject)"}
                </p>
                {email.preview && (
                  <p className="text-xs text-stone-500 truncate mt-0.5">
                    {email.preview}
                  </p>
                )}
              </div>

              {/* Unread indicator */}
              {!email.read && (
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-2" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

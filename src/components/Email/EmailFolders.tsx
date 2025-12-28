import { Button } from "@/components/ui/button";
import {
  Pencil,
  Inbox,
  Send,
  File,
  Trash2,
  Archive,
  AlertCircle,
  Settings
} from "lucide-react";

export interface EmailFolder {
  id: string;
  name: string;
  count?: number;
}

interface EmailFoldersProps {
  folders: EmailFolder[];
  selectedFolderId: string | null;
  onFolderSelect: (folderId: string) => void;
  onCompose: () => void;
  onSettings: () => void;
}

// Map folder names to icons
const getFolderIcon = (name: string) => {
  const lowerName = name.toLowerCase();
  if (lowerName === "inbox") return Inbox;
  if (lowerName === "sent" || lowerName.includes("sent")) return Send;
  if (lowerName === "drafts" || lowerName.includes("draft")) return File;
  if (lowerName === "trash" || lowerName.includes("trash")) return Trash2;
  if (lowerName === "archive" || lowerName.includes("archive")) return Archive;
  if (lowerName === "junk" || lowerName === "spam") return AlertCircle;
  return Inbox;
};

export function EmailFolders({
  folders,
  selectedFolderId,
  onFolderSelect,
  onCompose,
  onSettings,
}: EmailFoldersProps) {
  return (
    <div className="flex flex-col h-full bg-stone-900/50">
      {/* Compose Button */}
      <div className="p-3">
        <Button
          onClick={onCompose}
          className="w-full gap-2 bg-stone-100 text-stone-900 hover:bg-stone-200"
        >
          <Pencil className="h-4 w-4" />
          Compose
        </Button>
      </div>

      {/* Folders List */}
      <div className="flex-1 overflow-y-auto px-2">
        <nav className="space-y-0.5">
          {folders.map((folder) => {
            const Icon = getFolderIcon(folder.name);
            const isSelected = selectedFolderId === folder.id;

            return (
              <button
                key={folder.id}
                onClick={() => onFolderSelect(folder.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
                  isSelected
                    ? "bg-stone-800 text-stone-100"
                    : "text-stone-400 hover:bg-stone-800/50 hover:text-stone-200"
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 truncate text-left">{folder.name}</span>
                {folder.count !== undefined && folder.count > 0 && (
                  <span className={`text-xs tabular-nums ${
                    isSelected ? "text-stone-300" : "text-stone-500"
                  }`}>
                    {folder.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Settings Button */}
      <div className="p-3 border-t border-stone-800">
        <button
          onClick={onSettings}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-stone-400 hover:text-stone-200 hover:bg-stone-800/50 rounded-md transition-colors"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";

interface DailyNoteSectionProps {
  note: string;
  onUpdateNote: (note: string) => Promise<void>;
  isAdmin: boolean;
}

export function DailyNoteSection({ note, onUpdateNote, isAdmin }: DailyNoteSectionProps) {
  const [localNote, setLocalNote] = useState(note);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalNote(note);
  }, [note]);

  const handleBlur = async () => {
    if (localNote !== note && isAdmin) {
      setIsSaving(true);
      try {
        await onUpdateNote(localNote);
      } catch (error) {
        console.error("Failed to save note:", error);
        setLocalNote(note); // Revert on error
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Don't render for non-admins if there's no note
  if (!isAdmin && !note) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="h-7 flex items-center justify-center bg-purple-600/80 rounded-lg font-medium text-sm text-white">
        Notes
      </div>
      <div className="relative">
        <textarea
          value={localNote}
          onChange={(e) => setLocalNote(e.target.value)}
          onBlur={handleBlur}
          disabled={!isAdmin || isSaving}
          placeholder={isAdmin ? "Add notes..." : ""}
          className={`
            w-full h-[150px] px-3 py-2 text-sm resize-none
            rounded-lg border transition-colors
            bg-white dark:bg-zinc-900
            border-gray-300 dark:border-zinc-700
            text-gray-900 dark:text-zinc-100
            placeholder:text-gray-400 dark:placeholder:text-zinc-600
            focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600
            disabled:opacity-50 disabled:cursor-not-allowed
            ${!isAdmin ? 'cursor-default' : 'cursor-text'}
          `}
        />
        {isSaving && (
          <div className="absolute top-2 right-2">
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

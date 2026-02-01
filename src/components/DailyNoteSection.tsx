import { useState, useEffect } from "react";
import { useTimeSlotNotes } from "../hooks/useTimeSlotNotes";

interface DailyNoteSectionProps {
  isAdmin: boolean;
  selectedDate: Date;
  timeSlots: string[];
  currentUserDisplayName?: string;
}

export function DailyNoteSection({
  isAdmin,
  selectedDate,
  timeSlots,
  currentUserDisplayName
}: DailyNoteSectionProps) {
  const { notes, updateNote: updateTimeSlotNote } = useTimeSlotNotes(selectedDate);
  const [localTimeSlotNotes, setLocalTimeSlotNotes] = useState<{ [timeIndex: number]: string }>({});

  // Sync local state with Firebase notes
  useEffect(() => {
    setLocalTimeSlotNotes(notes);
  }, [notes]);

  const handleTimeSlotNoteChange = (timeIndex: number, value: string) => {
    setLocalTimeSlotNotes(prev => ({ ...prev, [timeIndex]: value }));
  };

  const handleTimeSlotNoteBlur = async (timeIndex: number) => {
    const currentValue = localTimeSlotNotes[timeIndex] || "";
    const savedValue = notes[timeIndex] || "";

    if (currentValue !== savedValue && isAdmin) {
      try {
        await updateTimeSlotNote(timeIndex, currentValue, currentUserDisplayName);
      } catch (error) {
        console.error("Failed to save time slot note:", error);
        // Revert on error
        setLocalTimeSlotNotes(prev => ({ ...prev, [timeIndex]: savedValue }));
      }
    }
  };

  // Check if there are any notes
  const hasAnyNotes = Object.values(notes).some(note => note && note.trim() !== "");

  // Don't render for non-admins if there are no notes
  if (!isAdmin && !hasAnyNotes) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="h-7 flex items-center justify-center bg-purple-600/80 rounded-lg font-medium text-sm text-white">
        Notes
      </div>

      {/* Time slot notes */}
      <div className="flex flex-col gap-2">
        {timeSlots.map((_, index) => (
          <div key={index} className="h-20">
            <textarea
              value={localTimeSlotNotes[index] || ""}
              onChange={(e) => handleTimeSlotNoteChange(index, e.target.value)}
              onBlur={() => handleTimeSlotNoteBlur(index)}
              disabled={!isAdmin}
              placeholder={isAdmin ? "Add note..." : ""}
              className={`
                w-full h-full px-3 py-2 text-sm resize-none
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
          </div>
        ))}
      </div>
    </div>
  );
}

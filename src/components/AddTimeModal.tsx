import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";

interface AddTimeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingTimes: string[];
  onAddTime: (newTime: string) => void;
}

export function AddTimeModal({
  open,
  onOpenChange,
  existingTimes,
  onAddTime,
}: AddTimeModalProps) {
  const [newTime, setNewTime] = useState("");

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setNewTime("");
    }
  }, [open]);

  const handleSave = () => {
    const trimmedTime = newTime.trim();

    if (!trimmedTime) {
      alert("Please enter a time");
      return;
    }

    // Validate time format (H:MM or HH:MM)
    const timeMatch = trimmedTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) {
      alert("Please enter a valid time format (e.g., 8:30 or 14:00)");
      return;
    }

    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);

    // Validate hours (0-23) and minutes (0-59)
    if (hours < 0 || hours > 23) {
      alert("Hours must be between 0 and 23");
      return;
    }
    if (minutes < 0 || minutes > 59) {
      alert("Minutes must be between 0 and 59");
      return;
    }

    // Check if time already exists
    if (existingTimes.includes(trimmedTime)) {
      alert("This time slot already exists");
      return;
    }

    onAddTime(trimmedTime);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setNewTime("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-white dark:bg-zinc-950 border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">
            Add Extra Time Slot
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-gray-600 dark:text-zinc-400">
            Add a new time slot for an extra flight. This will create a new row in the schedule.
          </p>

          <div className="space-y-2">
            <Label htmlFor="new-time" className="text-gray-900 dark:text-white">
              New Time
            </Label>
            <Input
              id="new-time"
              type="text"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              placeholder="e.g., 10:15"
              className="bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white"
              autoFocus
            />
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            onClick={handleSave}
            className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-zinc-200"
          >
            Add
          </Button>
          <Button
            variant="outline"
            onClick={handleCancel}
            className="flex-1 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

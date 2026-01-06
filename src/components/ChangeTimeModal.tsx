import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";

interface ChangeTimeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalTime: string;
  currentOverride?: string;
  onChangeTime: (newTime: string | null) => void;
}

export function ChangeTimeModal({
  open,
  onOpenChange,
  originalTime,
  currentOverride,
  onChangeTime,
}: ChangeTimeModalProps) {
  const [newTime, setNewTime] = useState("");

  // Initialize with current override or empty
  useEffect(() => {
    if (open) {
      setNewTime(currentOverride || "");
    }
  }, [open, currentOverride]);

  const handleSave = () => {
    const trimmedTime = newTime.trim();

    // Validate time format (H:MM or HH:MM)
    if (trimmedTime && !/^\d{1,2}:\d{2}$/.test(trimmedTime)) {
      alert("Please enter a valid time format (e.g., 8:30 or 14:00)");
      return;
    }

    onChangeTime(trimmedTime || null);
    onOpenChange(false);
  };

  const handleReset = () => {
    onChangeTime(null);
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
            Change Time for {originalTime}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-gray-600 dark:text-zinc-400">
            Enter a new time to override the default time slot. All bookings at this time will display the new time.
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
              placeholder="e.g., 9:00"
              className="bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white"
              autoFocus
            />
          </div>

          {currentOverride && (
            <p className="text-sm text-orange-600 dark:text-orange-400">
              Currently changed to: {currentOverride}
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            onClick={handleSave}
            className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-zinc-200"
          >
            Save
          </Button>
          {currentOverride && (
            <Button
              variant="outline"
              onClick={handleReset}
              className="flex-1 border-orange-500 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20"
            >
              Reset
            </Button>
          )}
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

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface DeskAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDesk?: string | null;
  onSave: (desk: string) => Promise<void>;
}

export function DeskAssignmentModal({
  isOpen,
  onClose,
  initialDesk,
  onSave,
}: DeskAssignmentModalProps) {
  const [desk, setDesk] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setDesk(initialDesk || "");
  }, [isOpen, initialDesk]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(desk);
      onClose();
    } catch (error) {
      console.error("Error updating desk assignment:", error);
      alert("Failed to update desk information");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDesk(initialDesk || "");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="bg-white dark:bg-zinc-950 border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white max-w-md"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">Desk</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-4">
          <Label htmlFor="desk" className="text-gray-900 dark:text-white">
            Desk
          </Label>
          <Input
            id="desk"
            value={desk}
            onChange={(event) => setDesk(event.target.value)}
            placeholder="Who is operating the desk?"
            autoComplete="off"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-zinc-200"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSaving}
            className="flex-1 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

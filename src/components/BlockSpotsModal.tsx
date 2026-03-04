import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";

interface BlockSpotsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBlock: (numberOfPeople: number) => void;
}

export function BlockSpotsModal({ open, onOpenChange, onBlock }: BlockSpotsModalProps) {
  const [numberOfPeople, setNumberOfPeople] = useState("1");

  useEffect(() => {
    if (open) {
      setNumberOfPeople("1");
    }
  }, [open]);

  const handleBlock = () => {
    const number = parseInt(numberOfPeople, 10);
    if (Number.isNaN(number) || number < 1) {
      alert("Please choose a valid number of spots");
      return;
    }

    onBlock(number);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-white dark:bg-zinc-950 border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white w-[min(92vw,420px)] max-w-[420px] overflow-x-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">Block spots</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2 min-w-0 w-full">
          <Label className="text-gray-900 dark:text-white">How many people?</Label>
          <div className="w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
            <div className="inline-flex min-w-max gap-2 pb-2 pr-1">
              {Array.from({ length: 30 }, (_, i) => i + 1).map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setNumberOfPeople(num.toString())}
                  className={`flex-shrink-0 w-12 h-12 rounded-lg font-medium transition-colors ${
                    numberOfPeople === num.toString()
                      ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                      : "bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2 w-full min-w-0">
          <Button
            onClick={handleBlock}
            className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-zinc-200"
          >
            Block
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

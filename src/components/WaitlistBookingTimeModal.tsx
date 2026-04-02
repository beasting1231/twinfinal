import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import type { BookingRequest } from "../types/index";

interface WaitlistTimeOption {
  timeIndex: number;
  displayTime: string;
  availableSpots: number;
  isPreferred?: boolean;
}

interface WaitlistBookingTimeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: BookingRequest | null;
  options: WaitlistTimeOption[];
  onConfirm: (timeIndex: number) => void;
}

export function WaitlistBookingTimeModal({
  open,
  onOpenChange,
  request,
  options,
  onConfirm,
}: WaitlistBookingTimeModalProps) {
  const [selectedTimeIndex, setSelectedTimeIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedTimeIndex(null);
  }, [open, options]);

  const selectedOption = useMemo(
    () => options.find((option) => option.timeIndex === selectedTimeIndex) || null,
    [options, selectedTimeIndex]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[90vw] max-w-[420px] rounded-2xl bg-white dark:bg-zinc-950 border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">
            What time do you want to book them for?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm text-gray-600 dark:text-zinc-400">
            {request?.customerName || "Customer"}
          </p>
          <p className="text-xs text-gray-500 dark:text-zinc-500">
            Preferred customer times are highlighted.
          </p>
          <div className="space-y-2">
            {options.map((option) => {
              const isSelected = selectedTimeIndex === option.timeIndex;
              return (
                <button
                  key={`${option.timeIndex}-${option.displayTime}`}
                  type="button"
                  onClick={() => setSelectedTimeIndex(option.timeIndex)}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2 border transition-colors ${
                    isSelected
                      ? "border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-black"
                      : option.isPreferred
                      ? "border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-gray-900 dark:text-white hover:bg-blue-100 dark:hover:bg-blue-900/40"
                      : "border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{option.displayTime}</span>
                    {option.isPreferred && !isSelected && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white">
                        Preferred
                      </span>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    option.availableSpots <= 0
                      ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                      : "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                  }`}>
                    {option.availableSpots} spots
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-zinc-200"
            disabled={!selectedOption}
            onClick={() => {
              if (!selectedOption) return;
              onConfirm(selectedOption.timeIndex);
            }}
          >
            Confirm
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

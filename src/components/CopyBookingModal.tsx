import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { doc, getDoc } from "firebase/firestore";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { db } from "../firebase/config";
import { getTimeSlotsByDate } from "../utils/timeSlots";

interface CopyBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: { date: string; timeIndex: number }) => void;
  defaultDate: string;
  defaultTimeIndex: number;
}

interface TimeOption {
  label: string;
  value: number;
}

export function CopyBookingModal({
  open,
  onOpenChange,
  onConfirm,
  defaultDate,
  defaultTimeIndex,
}: CopyBookingModalProps) {
  const [targetDate, setTargetDate] = useState(defaultDate);
  const [targetTimeIndex, setTargetTimeIndex] = useState<number>(defaultTimeIndex);
  const [timeOverrides, setTimeOverrides] = useState<Record<number, string>>({});
  const [additionalSlots, setAdditionalSlots] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setTargetDate(defaultDate);
    setTargetTimeIndex(defaultTimeIndex);
  }, [open, defaultDate, defaultTimeIndex]);

  useEffect(() => {
    if (!open || !targetDate) return;

    const loadTimeOverrides = async () => {
      try {
        const snap = await getDoc(doc(db, "timeOverrides", targetDate));
        if (!snap.exists()) {
          setTimeOverrides({});
          setAdditionalSlots([]);
          return;
        }
        const data = snap.data();
        setTimeOverrides((data.overrides || {}) as Record<number, string>);
        setAdditionalSlots(Array.isArray(data.additionalSlots) ? data.additionalSlots : []);
      } catch (error) {
        console.error("Error loading time overrides for copy modal:", error);
        setTimeOverrides({});
        setAdditionalSlots([]);
      }
    };

    void loadTimeOverrides();
  }, [open, targetDate]);

  const timeOptions = useMemo<TimeOption[]>(() => {
    const date = new Date(targetDate + "T00:00:00");
    const baseSlots = getTimeSlotsByDate(date);

    const base = baseSlots.map((slot, idx) => ({
      label: timeOverrides[idx] || slot,
      value: idx,
    }));
    const extra = additionalSlots.map((slot, idx) => ({
      label: slot,
      value: 1000 + idx,
    }));
    return [...base, ...extra];
  }, [targetDate, timeOverrides, additionalSlots]);

  useEffect(() => {
    if (!open || timeOptions.length === 0) return;
    const exists = timeOptions.some((o) => o.value === targetTimeIndex);
    if (!exists) {
      setTargetTimeIndex(timeOptions[0].value);
    }
  }, [open, targetTimeIndex, timeOptions]);

  const handleSubmit = () => {
    if (!targetDate) {
      alert("Please select a target date.");
      return;
    }
    onConfirm({ date: targetDate, timeIndex: targetTimeIndex });
    onOpenChange(false);
  };

  const minDate = format(new Date(), "yyyy-MM-dd");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-white dark:bg-zinc-950 border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white max-w-md"
        overlayClassName="bg-transparent backdrop-blur-none"
        overlayStyle={{ backdropFilter: "none", WebkitBackdropFilter: "none" }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">Copy Booking To</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="copy-target-date" className="text-gray-900 dark:text-white">
              Target Date
            </Label>
            <Input
              id="copy-target-date"
              type="date"
              min={minDate}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-900 dark:text-white">Target Time</Label>
            <Select
              value={String(targetTimeIndex)}
              onValueChange={(value) => setTargetTimeIndex(Number(value))}
            >
              <SelectTrigger className="bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white">
                <SelectValue placeholder="Select time slot" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white">
                {timeOptions.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            onClick={handleSubmit}
            className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-zinc-200"
          >
            Copy Booking
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

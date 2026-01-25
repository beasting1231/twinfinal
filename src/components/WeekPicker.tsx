import { useState } from "react";
import { format, startOfWeek, addWeeks } from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface WeekPickerProps {
  weekStartDate: Date;
  onWeekChange: (date: Date) => void;
}

export function WeekPicker({ weekStartDate, onWeekChange }: WeekPickerProps) {
  const [open, setOpen] = useState(false);

  const handlePrevWeek = () => {
    const newDate = addWeeks(weekStartDate, -1);
    onWeekChange(newDate);
  };

  const handleNextWeek = () => {
    const newDate = addWeeks(weekStartDate, 1);
    onWeekChange(newDate);
  };

  // Display just the start date in uppercase
  const displayText = format(weekStartDate, 'dd MMM yyyy').toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={handlePrevWeek}
        className="h-10 w-10 border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:border-gray-400 dark:hover:border-zinc-600"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "justify-center text-center font-normal min-w-[200px] border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:border-gray-400 dark:hover:border-zinc-600"
            )}
          >
            {displayText}
            <CalendarIcon className="ml-2 h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-800" align="center">
          <Calendar
            mode="single"
            selected={weekStartDate}
            onSelect={(selectedDate) => {
              if (selectedDate) {
                // Get the start of the week for the selected date
                const newWeekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
                onWeekChange(newWeekStart);
                setOpen(false);
              }
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="icon"
        onClick={handleNextWeek}
        className="h-10 w-10 border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:border-gray-400 dark:hover:border-zinc-600"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

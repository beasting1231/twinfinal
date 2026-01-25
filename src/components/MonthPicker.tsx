import { useState } from "react";
import { format, startOfMonth, addMonths } from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface MonthPickerProps {
  monthStartDate: Date;
  onMonthChange: (date: Date) => void;
}

export function MonthPicker({ monthStartDate, onMonthChange }: MonthPickerProps) {
  const [open, setOpen] = useState(false);

  const handlePrevMonth = () => {
    const newDate = addMonths(monthStartDate, -1);
    onMonthChange(newDate);
  };

  const handleNextMonth = () => {
    const newDate = addMonths(monthStartDate, 1);
    onMonthChange(newDate);
  };

  // Display just the month and year in uppercase
  const displayText = format(monthStartDate, 'MMM yyyy').toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={handlePrevMonth}
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
            selected={monthStartDate}
            onSelect={(selectedDate) => {
              if (selectedDate) {
                // Get the start of the month for the selected date
                const newMonthStart = startOfMonth(selectedDate);
                onMonthChange(newMonthStart);
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
        onClick={handleNextMonth}
        className="h-10 w-10 border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:border-gray-400 dark:hover:border-zinc-600"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

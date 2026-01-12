import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DatePickerProps {
  date: Date;
  onDateChange: (date: Date) => void;
}

export function DatePicker({ date, onDateChange }: DatePickerProps) {
  const [open, setOpen] = useState(false);

  const handlePrevDay = () => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() - 1);
    onDateChange(newDate);
  };

  const handleNextDay = () => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() + 1);
    onDateChange(newDate);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={handlePrevDay}
        className="h-10 w-10 border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:border-gray-400 dark:hover:border-zinc-600"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "justify-center text-center font-normal min-w-[200px] border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:border-gray-400 dark:hover:border-zinc-600",
              !date && "text-gray-400 dark:text-zinc-500"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, "dd MMM yyyy") : <span>Pick a date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-800" align="center">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(selectedDate) => {
              if (selectedDate) {
                onDateChange(selectedDate);
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
        onClick={handleNextDay}
        className="h-10 w-10 border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:border-gray-400 dark:hover:border-zinc-600"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

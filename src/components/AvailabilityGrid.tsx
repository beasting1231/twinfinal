import { useState } from "react";
import { AvailabilityCell } from "./AvailabilityCell";
import { format, startOfWeek, addDays } from "date-fns";

interface AvailabilityGridProps {
  weekStartDate: Date;
  timeSlots: string[];
}

export function AvailabilityGrid({ weekStartDate, timeSlots }: AvailabilityGridProps) {
  // Generate the 7 days of the week starting from weekStartDate
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));

  // Initialize availability state: [dayIndex][timeIndex] -> boolean
  // All cells are unavailable (false/red) by default
  const [availability, setAvailability] = useState<boolean[][]>(() => {
    return days.map(() => {
      return timeSlots.map(() => false);
    });
  });

  const toggleCell = (dayIndex: number, timeIndex: number) => {
    setAvailability(prev => {
      const newAvailability = prev.map(day => [...day]);
      newAvailability[dayIndex][timeIndex] = !newAvailability[dayIndex][timeIndex];
      return newAvailability;
    });
  };

  const toggleColumn = (dayIndex: number) => {
    setAvailability(prev => {
      const newAvailability = prev.map(day => [...day]);
      // Check if all cells in this column are available
      const allAvailable = newAvailability[dayIndex].every(isAvailable => isAvailable);
      // If all are available, set all to unavailable. Otherwise, set all to available.
      const newState = !allAvailable;
      newAvailability[dayIndex] = newAvailability[dayIndex].map(() => newState);
      return newAvailability;
    });
  };

  return (
    <div className="flex-1 overflow-auto p-4 bg-zinc-950 flex justify-center">
      <div className="inline-block">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(7, 200px)` }}>
          {/* Day Headers */}
          {days.map((day, index) => {
            const dayName = format(day, 'EEE').toUpperCase();
            const monthDay = format(day, 'MMM d').toUpperCase();

            return (
              <button
                key={index}
                onClick={() => toggleColumn(index)}
                className="h-14 flex flex-col items-center justify-center bg-zinc-900 rounded-lg font-medium text-sm hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <div className="text-xs text-zinc-400">{dayName}</div>
                <div>{monthDay}</div>
              </button>
            );
          })}

          {/* Time Slots and Availability Cells */}
          {timeSlots.map((timeSlot, timeIndex) => (
            days.map((day, dayIndex) => {
              return (
                <div
                  key={`cell-${timeIndex}-${dayIndex}`}
                  className="h-14"
                >
                  <AvailabilityCell
                    timeSlot={timeSlot}
                    isAvailable={availability[dayIndex][timeIndex]}
                    onToggle={() => toggleCell(dayIndex, timeIndex)}
                  />
                </div>
              );
            })
          ))}
        </div>
      </div>
    </div>
  );
}

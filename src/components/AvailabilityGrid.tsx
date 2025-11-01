import { AvailabilityCell } from "./AvailabilityCell";
import { format, addDays } from "date-fns";
import { useAvailability } from "../hooks/useAvailability";

interface AvailabilityGridProps {
  weekStartDate: Date;
  timeSlots: string[];
}

export function AvailabilityGrid({ weekStartDate, timeSlots }: AvailabilityGridProps) {
  // Generate the 7 days of the week starting from weekStartDate
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));

  const { isAvailable, toggleAvailability, toggleDay, loading, saving, justSaved } = useAvailability();

  const handleToggleCell = async (dayIndex: number, timeSlot: string) => {
    await toggleAvailability(days[dayIndex], timeSlot);
  };

  const handleToggleColumn = async (dayIndex: number) => {
    await toggleDay(days[dayIndex], timeSlots);
  };

  return (
    <div className="flex-1 overflow-auto p-4 bg-zinc-950 flex justify-center relative">
      {/* Saving indicator */}
      {(saving || justSaved) && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="w-24 h-8 bg-zinc-700/90 rounded-md shadow-lg flex items-center justify-center gap-1.5 px-2 transition-all">
            {saving ? (
              <>
                <div className="w-3 h-3 border-2 border-zinc-300 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-medium text-zinc-200">Saving</span>
              </>
            ) : (
              <>
                <svg className="w-3 h-3 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-xs font-medium text-zinc-200">Saved</span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="inline-block">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(7, 200px)` }}>
          {/* Day Headers */}
          {days.map((day, index) => {
            const dayName = format(day, 'EEE').toUpperCase();
            const monthDay = format(day, 'MMM d').toUpperCase();

            return (
              <button
                key={index}
                onClick={() => handleToggleColumn(index)}
                className="h-14 flex flex-col items-center justify-center bg-zinc-900 rounded-lg font-medium text-sm hover:bg-zinc-800 transition-colors cursor-pointer"
                disabled={loading}
              >
                <div className="text-xs text-zinc-400">{dayName}</div>
                <div>{monthDay}</div>
              </button>
            );
          })}

          {/* Time Slots and Availability Cells */}
          {timeSlots.map((timeSlot, timeIndex) => (
            days.map((day, dayIndex) => {
              if (loading) {
                return (
                  <div
                    key={`skeleton-${timeIndex}-${dayIndex}`}
                    className="h-14"
                  >
                    <div className="w-full h-14 bg-zinc-800 rounded-lg animate-pulse" />
                  </div>
                );
              }

              return (
                <div
                  key={`cell-${timeIndex}-${dayIndex}`}
                  className="h-14"
                >
                  <AvailabilityCell
                    timeSlot={timeSlot}
                    isAvailable={isAvailable(day, timeSlot)}
                    onToggle={() => handleToggleCell(dayIndex, timeSlot)}
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

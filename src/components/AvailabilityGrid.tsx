import { AvailabilityCell } from "./AvailabilityCell";
import { format, addDays } from "date-fns";
import { useAvailability } from "../hooks/useAvailability";
import { getTimeSlotsByDate } from "../utils/timeSlots";
import { useMemo, useState, useRef, useEffect } from "react";

interface AvailabilityGridProps {
  weekStartDate: Date;
  timeSlots?: string[]; // Made optional for backwards compatibility
}

export function AvailabilityGrid({ weekStartDate }: AvailabilityGridProps) {
  // Generate the 7 days of the week starting from weekStartDate
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));

  // Get time slots for each day based on the date
  const dailyTimeSlots = useMemo(() => {
    return days.map(day => getTimeSlotsByDate(day));
  }, [days]);

  // Get all unique time slots across the week for rendering rows
  const allTimeSlots = useMemo(() => {
    const allSlots = new Set<string>();
    dailyTimeSlots.forEach(slots => slots.forEach(slot => allSlots.add(slot)));
    // Sort time slots chronologically
    return Array.from(allSlots).sort((a, b) => {
      const [aHour, aMin] = a.split(':').map(Number);
      const [bHour, bMin] = b.split(':').map(Number);
      return (aHour * 60 + aMin) - (bHour * 60 + bMin);
    });
  }, [dailyTimeSlots]);

  const { isAvailable, toggleAvailability, toggleDay, loading, saving, justSaved } = useAvailability();

  // Zoom state
  const [scale, setScale] = useState(1);
  const [isPinching, setIsPinching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialDistanceRef = useRef<number | null>(null);
  const initialScaleRef = useRef<number>(1);
  const rafRef = useRef<number | null>(null);

  const handleToggleCell = async (dayIndex: number, timeSlot: string) => {
    await toggleAvailability(days[dayIndex], timeSlot);
  };

  const handleToggleColumn = async (dayIndex: number) => {
    // Use the time slots specific to that day
    await toggleDay(days[dayIndex], dailyTimeSlots[dayIndex]);
  };

  // Get distance between two touch points
  const getDistance = (touch1: React.Touch, touch2: React.Touch) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Handle touch start for pinch zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      setIsPinching(true);
      const distance = getDistance(e.touches[0], e.touches[1]);
      initialDistanceRef.current = distance;
      initialScaleRef.current = scale;
    }
  };

  // Handle touch move for pinch zoom
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialDistanceRef.current) {
      e.preventDefault();

      // Cancel any pending animation frame
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      // Use requestAnimationFrame for smoother updates
      rafRef.current = requestAnimationFrame(() => {
        const distance = getDistance(e.touches[0], e.touches[1]);
        const scaleChange = distance / initialDistanceRef.current!;
        const newScale = Math.max(0.15, Math.min(2, initialScaleRef.current * scaleChange));
        setScale(newScale);
      });
    }
  };

  // Handle touch end
  const handleTouchEnd = () => {
    initialDistanceRef.current = null;
    setIsPinching(false);

    // Cancel any pending animation frame
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  // Add touch event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const preventDefault = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
      }
    };

    container.addEventListener('touchmove', preventDefault, { passive: false });

    return () => {
      container.removeEventListener('touchmove', preventDefault);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto p-4 bg-zinc-950"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
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

      <div
        className={`inline-block origin-top-left ${!isPinching ? 'transition-transform duration-100' : ''}`}
        style={{ transform: `scale(${scale})` }}
      >
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
          {allTimeSlots.map((timeSlot, timeIndex) => (
            days.map((day, dayIndex) => {
              // Check if this time slot is valid for this specific day
              const isValidSlot = dailyTimeSlots[dayIndex].includes(timeSlot);

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

              // If this time slot doesn't exist for this day, show a disabled cell
              if (!isValidSlot) {
                return (
                  <div
                    key={`cell-${timeIndex}-${dayIndex}`}
                    className="h-14"
                  >
                    <div className="w-full h-14 bg-zinc-900/30 rounded-lg border border-zinc-800/50" />
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

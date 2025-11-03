import { AvailabilityCell } from "./AvailabilityCell";
import { format, addDays } from "date-fns";
import { useAvailability } from "../hooks/useAvailability";
import { useBookings } from "../hooks/useBookings";
import { useAuth } from "../contexts/AuthContext";
import { getTimeSlotsByDate } from "../utils/timeSlots";
import { useMemo, useState, useRef, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";

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

  // No longer need to create a union of all time slots - each day will render its own slots independently

  const { isAvailable, toggleAvailability, toggleDay, loading, saving, justSaved } = useAvailability();
  const { bookings } = useBookings();
  const { currentUser } = useAuth();

  // State to track other pilots' availability for each date/time
  const [otherPilotsAvailability, setOtherPilotsAvailability] = useState<Map<string, number>>(new Map());

  // Fetch availability data for all pilots to determine if cells should be locked
  useEffect(() => {
    async function fetchAllPilotsAvailability() {
      if (!currentUser) return;

      try {
        const availabilityMap = new Map<string, number>();

        // For each day in the week
        for (const day of days) {
          const dateStr = format(day, "yyyy-MM-dd");

          // Query availability for this date
          const availabilityQuery = query(
            collection(db, "availability"),
            where("date", "==", dateStr)
          );

          const availabilitySnapshot = await getDocs(availabilityQuery);

          // Count availability per time slot (excluding current user)
          availabilitySnapshot.docs.forEach((doc) => {
            const data = doc.data();
            if (data.userId !== currentUser.uid) {
              const key = `${dateStr}-${data.timeSlot}`;
              availabilityMap.set(key, (availabilityMap.get(key) || 0) + 1);
            }
          });
        }

        setOtherPilotsAvailability(availabilityMap);
      } catch (error) {
        console.error("Error fetching pilots availability:", error);
      }
    }

    fetchAllPilotsAvailability();
  }, [days, currentUser]);

  // Function to check if a cell should be locked (cannot be toggled to unavailable)
  const isCellLocked = (day: Date, timeSlot: string): boolean => {
    if (!currentUser) return false;

    const dateStr = format(day, "yyyy-MM-dd");
    const key = `${dateStr}-${timeSlot}`;

    // Only lock if user is currently available
    if (!isAvailable(day, timeSlot)) {
      return false;
    }

    // Get time slots for this date to match bookings
    const timeSlotsForDate = getTimeSlotsByDate(day);
    const timeSlotIndex = timeSlotsForDate.indexOf(timeSlot);

    if (timeSlotIndex === -1) {
      return false;
    }

    // Check if there are any bookings at this time
    const bookingsAtThisTime = bookings.filter(booking => {
      return booking.date === dateStr && booking.timeIndex === timeSlotIndex;
    });

    if (bookingsAtThisTime.length === 0) {
      return false;
    }

    // Count how many other pilots are available (excluding current user)
    const otherAvailablePilots = otherPilotsAvailability.get(key) || 0;

    // Check if any booking would be under-staffed if this pilot signs out
    for (const booking of bookingsAtThisTime) {
      const requiredPilots = booking.numberOfPeople;

      // If removing this pilot would leave fewer pilots than required, lock the cell
      // otherAvailablePilots doesn't include current user, so we compare directly
      if (otherAvailablePilots < requiredPilots) {
        return true;
      }
    }

    return false;
  };

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
    const day = days[dayIndex];
    const timeSlots = dailyTimeSlots[dayIndex];

    // Check if all slots are available
    const allAvailable = timeSlots.every((slot) => isAvailable(day, slot));

    if (allAvailable) {
      // When signing out, filter out locked slots (where user is assigned to bookings)
      const unlockedSlots = timeSlots.filter((slot) => !isCellLocked(day, slot));

      // If all slots are locked, don't do anything
      if (unlockedSlots.length === 0) {
        console.log("Cannot sign out - all slots are locked (assigned to bookings)");
        return;
      }

      // Only toggle unlocked slots
      await toggleDay(day, unlockedSlots);
    } else {
      // When signing in, toggle all slots (no restriction)
      await toggleDay(day, timeSlots);
    }
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
          {/* Day columns - each renders header + its own time slots independently */}
          {days.map((day, dayIndex) => {
            const dayName = format(day, 'EEE').toUpperCase();
            const monthDay = format(day, 'MMM d').toUpperCase();
            const timeSlots = dailyTimeSlots[dayIndex];

            return (
              <div key={dayIndex} className="flex flex-col gap-2">
                {/* Day Header */}
                <button
                  onClick={() => handleToggleColumn(dayIndex)}
                  className="h-14 flex flex-col items-center justify-center bg-zinc-900 rounded-lg font-medium text-sm hover:bg-zinc-800 transition-colors cursor-pointer"
                  disabled={loading}
                >
                  <div className="text-xs text-zinc-400">{dayName}</div>
                  <div>{monthDay}</div>
                </button>

                {/* Time Slots for this day */}
                {loading ? (
                  // Loading skeleton
                  timeSlots.map((_, slotIndex) => (
                    <div key={`skeleton-${dayIndex}-${slotIndex}`} className="h-14">
                      <div className="w-full h-14 bg-zinc-800 rounded-lg animate-pulse" />
                    </div>
                  ))
                ) : (
                  // Actual availability cells
                  timeSlots.map((timeSlot, slotIndex) => (
                    <div key={`cell-${dayIndex}-${slotIndex}`} className="h-14">
                      <AvailabilityCell
                        timeSlot={timeSlot}
                        isAvailable={isAvailable(day, timeSlot)}
                        isLocked={isCellLocked(day, timeSlot)}
                        onToggle={() => handleToggleCell(dayIndex, timeSlot)}
                      />
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

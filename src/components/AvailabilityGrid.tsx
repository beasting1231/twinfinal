import { AvailabilityCell } from "./AvailabilityCell";
import { format, addDays } from "date-fns";
import { useAvailability } from "../hooks/useAvailability";
import { useBookings } from "../hooks/useBookings";
import { useAuth } from "../contexts/AuthContext";
import { useRole } from "../hooks/useRole";
import { getTimeSlotsByDate } from "../utils/timeSlots";
import { useMemo, useState, useRef, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";
import type { UserProfile } from "../types/index";

interface AvailabilityGridProps {
  weekStartDate: Date;
  timeSlots?: string[]; // Made optional for backwards compatibility
}

export function AvailabilityGrid({ weekStartDate }: AvailabilityGridProps) {
  // Generate the 7 days of the week starting from weekStartDate
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));
  }, [weekStartDate]);

  // Get time slots for each day based on the date
  const dailyTimeSlots = useMemo(() => {
    return days.map(day => getTimeSlotsByDate(day));
  }, [days]);

  // No longer need to create a union of all time slots - each day will render its own slots independently

  const { currentUser } = useAuth();
  const { role } = useRole();
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined);
  const [pilotsAndAdmins, setPilotsAndAdmins] = useState<UserProfile[]>([]);

  // For admins, use selectedUserId if set, otherwise currentUser
  // For non-admins, always use currentUser
  const targetUserId = role === 'admin' && selectedUserId ? selectedUserId : undefined;

  const { isAvailable, toggleAvailability, toggleDay, loading, saving, justSaved } = useAvailability(targetUserId);
  const { bookings } = useBookings();

  // State to track all pilots' availability data
  const [pilotsAvailabilityData, setPilotsAvailabilityData] = useState<{
    pilotsSignedInPerDay: Map<string, Set<string>>; // date -> Set of pilot IDs
    pilotsAvailablePerTimeSlot: Map<string, Set<string>>; // date-timeSlot -> Set of pilot IDs
  }>({
    pilotsSignedInPerDay: new Map(),
    pilotsAvailablePerTimeSlot: new Map(),
  });

  const [pilotsAvailabilityLoading, setPilotsAvailabilityLoading] = useState(true);

  // Track if initial load is complete - stays true until everything is loaded
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Track if we're changing dates to prevent premature loading state changes
  const [isChangingDate, setIsChangingDate] = useState(false);

  // Reset loading state when date/week changes
  useEffect(() => {
    setIsInitialLoading(true);
    setIsChangingDate(true);
    setPilotsAvailabilityLoading(true);
  }, [weekStartDate]);

  // Update initial loading state - only set to false when BOTH are loaded AND we're not changing dates
  useEffect(() => {
    if (!loading && !pilotsAvailabilityLoading && !isChangingDate) {
      setIsInitialLoading(false);
    }
  }, [loading, pilotsAvailabilityLoading, isChangingDate]);

  // Fetch all pilots and admins for the dropdown (admin only)
  useEffect(() => {
    if (role !== 'admin') return;

    async function fetchPilotsAndAdmins() {
      try {
        const usersQuery = query(
          collection(db, "userProfiles"),
          where("role", "in", ["pilot", "admin"])
        );
        const snapshot = await getDocs(usersQuery);
        const users = snapshot.docs.map(doc => ({
          ...doc.data(),
          uid: doc.id
        } as UserProfile));

        // Sort by display name
        users.sort((a, b) => a.displayName.localeCompare(b.displayName));

        setPilotsAndAdmins(users);
      } catch (error) {
        console.error("Error fetching pilots and admins:", error);
      }
    }

    fetchPilotsAndAdmins();
  }, [role]);

  // Fetch availability data for all pilots to determine if cells should be locked
  useEffect(() => {
    async function fetchAllPilotsAvailability() {
      if (!currentUser) {
        setPilotsAvailabilityLoading(false);
        setIsChangingDate(false);
        return;
      }

      setPilotsAvailabilityLoading(true);

      try {
        const pilotsSignedInPerDay = new Map<string, Set<string>>();
        const pilotsAvailablePerTimeSlot = new Map<string, Set<string>>();

        // Generate days for this week
        const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));

        // For each day in the week
        for (const day of weekDays) {
          const dateStr = format(day, "yyyy-MM-dd");

          // Query availability for this date
          const availabilityQuery = query(
            collection(db, "availability"),
            where("date", "==", dateStr)
          );

          const availabilitySnapshot = await getDocs(availabilityQuery);

          // Track which pilots are signed in for this day and which times they're available
          availabilitySnapshot.docs.forEach((doc) => {
            const data = doc.data();
            const pilotId = data.userId;
            const timeSlot = data.timeSlot;

            // Add pilot to the day's signed-in set
            if (!pilotsSignedInPerDay.has(dateStr)) {
              pilotsSignedInPerDay.set(dateStr, new Set());
            }
            pilotsSignedInPerDay.get(dateStr)!.add(pilotId);

            // Add pilot to this time slot's available set
            const key = `${dateStr}-${timeSlot}`;
            if (!pilotsAvailablePerTimeSlot.has(key)) {
              pilotsAvailablePerTimeSlot.set(key, new Set());
            }
            pilotsAvailablePerTimeSlot.get(key)!.add(pilotId);
          });
        }

        setPilotsAvailabilityData({
          pilotsSignedInPerDay,
          pilotsAvailablePerTimeSlot,
        });
        setPilotsAvailabilityLoading(false);
        setIsChangingDate(false);
      } catch (error) {
        console.error("Error fetching pilots availability:", error);
        setPilotsAvailabilityLoading(false);
        setIsChangingDate(false);
      }
    }

    fetchAllPilotsAvailability();
  }, [weekStartDate, currentUser]);

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

    // Step 1: Count how many pilots are signed in for this day
    const pilotsSignedInToday = pilotsAvailabilityData.pilotsSignedInPerDay.get(dateStr);
    if (!pilotsSignedInToday || pilotsSignedInToday.size === 0) {
      return false;
    }
    const totalPilotsSignedIn = pilotsSignedInToday.size;

    // Step 2: Count how many of those pilots are signed OUT for this specific time slot
    // (signed in for day but NOT available for this time)
    const pilotsAvailableAtThisTime = pilotsAvailabilityData.pilotsAvailablePerTimeSlot.get(key);
    const pilotsSignedOutForThisTime = totalPilotsSignedIn - (pilotsAvailableAtThisTime?.size || 0);

    // Step 3: Count total pax booked at this time
    const bookingsAtThisTime = bookings.filter(booking => {
      return booking.date === dateStr && booking.timeIndex === timeSlotIndex;
    });

    const totalPaxBooked = bookingsAtThisTime.reduce((sum, booking) => {
      return sum + (booking.numberOfPeople || 0);
    }, 0);

    // Step 4: Calculate available spots
    // Available spots = (pilots signed in) - (pilots signed out for this time) - (pax booked)
    const availableSpots = totalPilotsSignedIn - pilotsSignedOutForThisTime - totalPaxBooked;

    // Step 5: If available spots = 0, lock all pilots that are currently signed in for this time
    return availableSpots <= 0;
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
      {/* Admin User Selector */}
      {role === 'admin' && (
        <div className="mb-6 max-w-xs">
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
            Viewing Availability For
          </label>
          <select
            value={selectedUserId || ''}
            onChange={(e) => setSelectedUserId(e.target.value || undefined)}
            className="w-full bg-zinc-900 border-2 border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm font-medium shadow-sm hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer"
          >
            <option value="">My Availability</option>
            {pilotsAndAdmins.map(user => (
              <option key={user.uid} value={user.uid}>
                {user.displayName} {user.role === 'admin' ? '• Admin' : '• Pilot'}
              </option>
            ))}
          </select>
        </div>
      )}

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
                  disabled={isInitialLoading || saving}
                >
                  <div className="text-xs text-zinc-400">{dayName}</div>
                  <div>{monthDay}</div>
                </button>

                {/* Time Slots for this day */}
                {isInitialLoading ? (
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

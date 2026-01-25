import { AvailabilityCell } from "./AvailabilityCell";
import { format, addDays } from "date-fns";
import { useAvailability } from "../hooks/useAvailability";
import { useBookings } from "../hooks/useBookings";
import { useAuth } from "../contexts/AuthContext";
import { useRole } from "../hooks/useRole";
import { getTimeSlotsByDate } from "../utils/timeSlots";
import { useMemo, useState, useRef, useEffect } from "react";
import { collection, query, where, getDocs, doc, onSnapshot } from "firebase/firestore";
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

  // State for additional time slots per date (declared before useMemo that uses it)
  const [additionalSlotsByDate, setAdditionalSlotsByDate] = useState<Record<string, string[]>>({});

  // Helper function to convert time string to minutes for sorting
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Combined time slots for each day (default + additional), sorted by time
  const combinedDailyTimeSlots = useMemo(() => {
    return days.map((day, dayIndex) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const defaultSlots = dailyTimeSlots[dayIndex];
      const additionalSlots = additionalSlotsByDate[dateStr] || [];

      // Create entries for default slots
      const defaultEntries = defaultSlots.map((time, index) => ({
        time,
        originalIndex: index,
        isAdditional: false,
      }));

      // Create entries for additional slots
      const additionalEntries = additionalSlots.map((time, index) => ({
        time,
        originalIndex: 1000 + index,
        isAdditional: true,
      }));

      // Combine and sort by time
      const combined = [...defaultEntries, ...additionalEntries];
      combined.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

      return combined;
    });
  }, [days, dailyTimeSlots, additionalSlotsByDate]);

  // No longer need to create a union of all time slots - each day will render its own slots independently

  const { currentUser } = useAuth();
  const { role } = useRole();
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined);
  const [pilotsAndAdmins, setPilotsAndAdmins] = useState<UserProfile[]>([]);

  // For admins, use selectedUserId if set, otherwise currentUser
  // For non-admins, always use currentUser
  const targetUserId = role === 'admin' && selectedUserId ? selectedUserId : undefined;

  const { isAvailable, getAvailabilityStatus, toggleAvailability, toggleDay, loading, saving, justSaved } = useAvailability(targetUserId);
  const { bookings } = useBookings();

  // State to track all pilots' availability data (currently unused but kept for potential future use)
  const [_pilotsAvailabilityData, setPilotsAvailabilityData] = useState<{
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
  }, [weekStartDate, currentUser, justSaved]);

  // Fetch additional time slots for each day in the week
  useEffect(() => {
    const dateStrings = days.map(day => format(day, "yyyy-MM-dd"));

    // Set up listeners for each day's timeOverrides
    const unsubscribes = dateStrings.map(dateStr => {
      const docRef = doc(db, "timeOverrides", dateStr);
      return onSnapshot(docRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const additionalSlots = data.additionalSlots || [];
          setAdditionalSlotsByDate(prev => ({
            ...prev,
            [dateStr]: additionalSlots
          }));
        } else {
          setAdditionalSlotsByDate(prev => ({
            ...prev,
            [dateStr]: []
          }));
        }
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [days]);

  // Function to check if a day is more than 24 hours in the past
  const isDayOlderThan24Hours = (day: Date): boolean => {
    // Set to end of day to be generous
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    const now = new Date();
    const hoursDifference = (now.getTime() - dayEnd.getTime()) / (1000 * 60 * 60);
    return hoursDifference > 24;
  };

  // Function to check if editing is allowed for a day (admins always, others only within 24 hours)
  const canEditDay = (day: Date): boolean => {
    if (role === 'admin') return true;
    return !isDayOlderThan24Hours(day);
  };

  // Whether admin can override locks (admins can always override)
  const canAdminOverrideLock = role === 'admin';

  // Function to check if a cell should be locked (cannot be toggled to unavailable)
  // Locks cells when the user is available AND the time slot is fully or overbooked
  const isCellLocked = (day: Date, timeSlot: string): boolean => {
    const dateStr = format(day, "yyyy-MM-dd");

    // Only lock if the current user is available for this time slot
    const userIsAvailable = isAvailable(day, timeSlot);
    if (!userIsAvailable) {
      return false; // Not locked if user is not available
    }

    // Count how many pilots are available for this time slot
    const key = `${dateStr}-${timeSlot}`;
    const availablePilotsCount = _pilotsAvailabilityData.pilotsAvailablePerTimeSlot.get(key)?.size || 0;

    // Count how many booking spots are taken for this time slot
    const bookingsAtTime = bookings.filter(b => b.date === dateStr && b.timeIndex !== undefined);

    // Find the time slot index from the day's time slots
    const dayTimeSlots = getTimeSlotsByDate(day);
    const timeSlotIndex = dayTimeSlots.indexOf(timeSlot);

    if (timeSlotIndex === -1) {
      return false; // Time slot not found, don't lock
    }

    const spotsBooked = bookingsAtTime
      .filter(b => b.timeIndex === timeSlotIndex)
      .reduce((total, booking) => {
        return total + (booking.numberOfPeople || booking.span || 1);
      }, 0);

    // Calculate available spots
    const availableSpots = availablePilotsCount - spotsBooked;

    // Lock if there are 0 or fewer available spots (fully or overbooked)
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
    const day = days[dayIndex];
    // Check if editing is allowed for this day
    if (!canEditDay(day)) {
      return;
    }
    await toggleAvailability(day, timeSlot);
  };

  const handleToggleColumn = async (dayIndex: number) => {
    const day = days[dayIndex];
    const combinedSlots = combinedDailyTimeSlots[dayIndex];
    const timeSlotStrings = combinedSlots.map(slot => slot.time);

    // Check if editing is allowed for this day
    if (!canEditDay(day)) {
      return;
    }

    // Check if any slots are locked (admins can override when editing others)
    const anyLocked = timeSlotStrings.some((slot) => isCellLocked(day, slot));

    if (anyLocked && !canAdminOverrideLock) {
      // Don't allow day-level toggle if any slots are locked (unless admin override)
      return;
    }

    // Check if all slots are available
    const allAvailable = timeSlotStrings.every((slot) => isAvailable(day, slot));

    if (allAvailable) {
      // Sign out all slots (will auto-unassign from any bookings)
      await toggleDay(day, timeSlotStrings);
    } else {
      // Sign in all slots
      await toggleDay(day, timeSlotStrings);
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
      className="flex-1 overflow-auto p-4 bg-gray-50 dark:bg-zinc-950"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Admin User Selector */}
      {role === 'admin' && (
        <div className="mb-6 max-w-xs">
          <label className="block text-xs font-semibold text-gray-600 dark:text-zinc-400 uppercase tracking-wide mb-2">
            Viewing Availability For
          </label>
          <select
            value={selectedUserId || ''}
            onChange={(e) => setSelectedUserId(e.target.value || undefined)}
            className="w-full bg-white dark:bg-zinc-900 border-2 border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2.5 text-gray-900 dark:text-white text-sm font-medium shadow-sm hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer"
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
          <div className="w-24 h-8 bg-gray-800 dark:bg-zinc-700/90 rounded-md shadow-lg flex items-center justify-center gap-1.5 px-2 transition-all">
            {saving ? (
              <>
                <div className="w-3 h-3 border-2 border-gray-200 dark:border-zinc-300 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-medium text-gray-200 dark:text-zinc-200">Saving</span>
              </>
            ) : (
              <>
                <svg className="w-3 h-3 text-gray-200 dark:text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-xs font-medium text-gray-200 dark:text-zinc-200">Saved</span>
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
            const combinedSlots = combinedDailyTimeSlots[dayIndex];
            const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

            return (
              <div key={dayIndex} className="flex flex-col gap-2">
                {/* Day Header */}
                <button
                  onClick={() => handleToggleColumn(dayIndex)}
                  className={`h-14 flex flex-col items-center justify-center rounded-lg font-medium text-sm transition-colors border ${
                    !canEditDay(day)
                      ? 'bg-gray-100 dark:bg-zinc-800/50 text-gray-400 dark:text-zinc-600 cursor-not-allowed border-gray-200 dark:border-zinc-800'
                      : isToday
                      ? 'bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-900/70 border-2 border-blue-500 cursor-pointer'
                      : 'bg-white dark:bg-zinc-900 hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-900 dark:text-white border-gray-300 dark:border-zinc-700 cursor-pointer'
                  }`}
                  disabled={isInitialLoading || saving || !canEditDay(day)}
                >
                  <div className={`text-xs ${!canEditDay(day) ? 'text-gray-400 dark:text-zinc-600' : isToday ? 'text-blue-600 dark:text-blue-300' : 'text-gray-600 dark:text-zinc-400'}`}>{dayName}</div>
                  <div className={!canEditDay(day) ? '' : isToday ? 'text-blue-700 dark:text-blue-100' : ''}>{monthDay}</div>
                </button>

                {/* Time Slots for this day */}
                {isInitialLoading ? (
                  // Loading skeleton
                  combinedSlots.map((_, slotIndex) => (
                    <div key={`skeleton-${dayIndex}-${slotIndex}`} className="h-14">
                      <div className="w-full h-14 bg-gray-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
                    </div>
                  ))
                ) : (
                  // Actual availability cells
                  combinedSlots.map((slot) => (
                    <div key={`cell-${dayIndex}-${slot.originalIndex}`} className="h-14">
                      <AvailabilityCell
                        timeSlot={slot.time}
                        isAvailable={isAvailable(day, slot.time)}
                        status={getAvailabilityStatus(day, slot.time)}
                        isLocked={isCellLocked(day, slot.time)}
                        isDisabled={!canEditDay(day)}
                        canOverrideLock={canAdminOverrideLock}
                        isAdditional={slot.isAdditional}
                        onToggle={() => handleToggleCell(dayIndex, slot.time)}
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

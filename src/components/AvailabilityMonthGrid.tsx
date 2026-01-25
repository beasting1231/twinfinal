import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek } from "date-fns";
import { useAvailability } from "../hooks/useAvailability";
import { useRole } from "../hooks/useRole";
import { getTimeSlotsByDate } from "../utils/timeSlots";
import { useMemo, useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import type { UserProfile } from "../types/index";

interface AvailabilityMonthGridProps {
  monthStartDate: Date;
}

export function AvailabilityMonthGrid({ monthStartDate }: AvailabilityMonthGridProps) {
  const { role } = useRole();
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined);
  const [pilotsAndAdmins, setPilotsAndAdmins] = useState<UserProfile[]>([]);

  // For admins, use selectedUserId if set, otherwise currentUser
  const targetUserId = role === 'admin' && selectedUserId ? selectedUserId : undefined;

  const { isAvailable, loading } = useAvailability(targetUserId);

  // State for additional time slots per date
  const [additionalSlotsByDate, setAdditionalSlotsByDate] = useState<Record<string, string[]>>({});

  // Generate all days in the month (including padding days from previous/next month to fill the grid)
  const days = useMemo(() => {
    const start = startOfMonth(monthStartDate);
    const end = endOfMonth(monthStartDate);

    // Get the first day of the week containing the month start
    const calendarStart = startOfWeek(start, { weekStartsOn: 1 }); // Monday
    // Get the last day of the week containing the month end
    const calendarEnd = endOfWeek(end, { weekStartsOn: 1 });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [monthStartDate]);

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

  // Fetch additional time slots for each day in the month
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

  // Function to get the status color for a day
  const getDayStatus = (day: Date): 'red' | 'orange' | 'green' => {
    const dateStr = format(day, "yyyy-MM-dd");
    const defaultSlots = getTimeSlotsByDate(day);
    const additionalSlots = additionalSlotsByDate[dateStr] || [];
    const allSlots = [...defaultSlots, ...additionalSlots];

    if (allSlots.length === 0) return 'red'; // No slots defined

    const availableCount = allSlots.filter(slot => isAvailable(day, slot)).length;

    if (availableCount === 0) return 'red'; // Not signed in for any
    if (availableCount === allSlots.length) return 'green'; // Signed in for all
    return 'orange'; // Signed in for some
  };

  // Check if a day is in the current month
  const isCurrentMonth = (day: Date): boolean => {
    return format(day, 'MM') === format(monthStartDate, 'MM');
  };

  // Check if a day is today
  const isToday = (day: Date): boolean => {
    return format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  };

  return (
    <div className="flex-1 overflow-auto p-4 bg-gray-50 dark:bg-zinc-950">
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

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-gray-300 dark:border-zinc-700 border-t-blue-500 rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="inline-block">
          {/* Month/Year Header */}
          <div className="mb-4 text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {format(monthStartDate, 'MMMM yyyy')}
            </h2>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2 max-w-4xl">
            {/* Day of week headers */}
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div
                key={day}
                className="h-10 flex items-center justify-center font-semibold text-sm text-gray-600 dark:text-zinc-400"
              >
                {day}
              </div>
            ))}

            {/* Day cells */}
            {days.map((day, index) => {
              const status = getDayStatus(day);
              const inCurrentMonth = isCurrentMonth(day);
              const today = isToday(day);

              return (
                <div
                  key={index}
                  className={`h-20 rounded-lg border-2 flex items-center justify-center text-sm font-medium transition-colors ${
                    !inCurrentMonth
                      ? 'bg-gray-100 dark:bg-zinc-900/30 text-gray-400 dark:text-zinc-600 border-gray-200 dark:border-zinc-800'
                      : today
                      ? 'border-blue-500 dark:border-blue-400'
                      : 'border-gray-300 dark:border-zinc-700'
                  } ${
                    inCurrentMonth && status === 'red'
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      : inCurrentMonth && status === 'orange'
                      ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                      : inCurrentMonth && status === 'green'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : ''
                  }`}
                  title={`${format(day, 'MMM d')}: ${status === 'red' ? 'Not available' : status === 'orange' ? 'Partially available' : 'Fully available'}`}
                >
                  {format(day, 'd')}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-6 flex items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-red-100 dark:bg-red-900/30 border-2 border-gray-300 dark:border-zinc-700"></div>
              <span className="text-gray-700 dark:text-zinc-300">Not Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-orange-100 dark:bg-orange-900/30 border-2 border-gray-300 dark:border-zinc-700"></div>
              <span className="text-gray-700 dark:text-zinc-300">Partially Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-green-100 dark:bg-green-900/30 border-2 border-gray-300 dark:border-zinc-700"></div>
              <span className="text-gray-700 dark:text-zinc-300">Fully Available</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

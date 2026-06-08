import { useEffect, useMemo, useRef, useState } from "react";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { UserCheck, X } from "lucide-react";
import { addDoc, arrayUnion, collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase/config";
import type { DriverAssignment } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { getTimeSlotsByDate } from "../utils/timeSlots";

interface DriversCalendarProps {
  monthStartDate: Date;
}

interface DriversContextMenuState {
  isOpen: boolean;
  dateKey: string;
  position: { x: number; y: number };
}

interface DriversContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  currentDriver?: string;
  onSelectDriver: (driverName: string) => void;
  onUnassign: () => void;
  onClose: () => void;
}

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DRIVER_NAMES = ["Roger", "Pitsch", "Csaba", "Spas"];

function DriversContextMenu({
  isOpen,
  position,
  currentDriver,
  onSelectDriver,
  onUnassign,
  onClose,
}: DriversContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPositioned, setIsPositioned] = useState(false);
  const [showCustomDriver, setShowCustomDriver] = useState(false);
  const [customDriver, setCustomDriver] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setIsPositioned(false);
      setShowCustomDriver(false);
      setCustomDriver("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    let adjustedLeft = position.x - rect.width;
    let adjustedTop = position.y;

    if (adjustedLeft < 10) {
      adjustedLeft = 10;
    }

    if (rect.bottom > viewportHeight) {
      adjustedTop = viewportHeight - rect.height - 10;
    }

    menu.style.left = `${adjustedLeft}px`;
    menu.style.top = `${adjustedTop}px`;
    setIsPositioned(true);
  }, [isOpen, position, showCustomDriver]);

  useEffect(() => {
    if (showCustomDriver) {
      inputRef.current?.focus();
    }
  }, [showCustomDriver]);

  if (!isOpen) return null;

  const handleSelectCustomDriver = () => {
    const trimmedDriver = customDriver.trim();
    if (!trimmedDriver) return;
    onSelectDriver(trimmedDriver);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-40" />
      <div
        ref={menuRef}
        className={`fixed z-50 min-w-[180px] rounded-lg border border-gray-300 bg-white py-1 shadow-xl transition-opacity duration-75 dark:border-zinc-700 dark:bg-zinc-800 ${
          isPositioned ? "opacity-100" : "opacity-0"
        }`}
        style={{ left: position.x, top: position.y }}
        onTouchStart={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 dark:border-zinc-700 dark:text-zinc-400">
          Assign Driver
        </div>

        {currentDriver && (
          <button
            type="button"
            onClick={() => {
              onUnassign();
              onClose();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-gray-100 dark:text-red-400 dark:hover:bg-zinc-700"
          >
            <X className="h-4 w-4" />
            <span>Un-assign</span>
          </button>
        )}

        <div className="py-1">
          {DRIVER_NAMES.map((driverName) => {
            const isCurrent = currentDriver === driverName;

            return (
              <button
                key={driverName}
                type="button"
                onClick={() => {
                  onSelectDriver(driverName);
                  onClose();
                }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-zinc-700 ${
                  isCurrent ? "text-green-600 dark:text-green-400" : "text-gray-900 dark:text-white"
                }`}
              >
                <span>{driverName}</span>
                {isCurrent && <UserCheck className="h-4 w-4" />}
              </button>
            );
          })}
        </div>

        <div className="my-1 border-t border-gray-300 dark:border-zinc-700" />
        {showCustomDriver ? (
          <div className="space-y-2 px-3 py-2">
            <input
              ref={inputRef}
              value={customDriver}
              onChange={(event) => setCustomDriver(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleSelectCustomDriver();
                }
              }}
              placeholder="Driver name"
              className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            />
            <button
              type="button"
              onClick={handleSelectCustomDriver}
              className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Add driver
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCustomDriver(true)}
            className="w-full px-3 py-2 text-left text-sm text-gray-900 transition-colors hover:bg-gray-100 dark:text-white dark:hover:bg-zinc-700"
          >
            Other
          </button>
        )}
      </div>
    </>
  );
}

export function DriversCalendar({ monthStartDate }: DriversCalendarProps) {
  const [contextMenu, setContextMenu] = useState<DriversContextMenuState | null>(null);
  const [driverAssignments, setDriverAssignments] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currentUser, userProfile } = useAuth();
  const calendarStart = startOfWeek(startOfMonth(monthStartDate), { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(endOfMonth(monthStartDate), { weekStartsOn: 1 });
  const calendarStartKey = format(calendarStart, "yyyy-MM-dd");
  const calendarEndKey = format(calendarEnd, "yyyy-MM-dd");
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weeks = Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, weekIndex) =>
    calendarDays.slice(weekIndex * 7, weekIndex * 7 + 7)
  );
  const driversByDate = useMemo(() => {
    const groupedDrivers: Record<string, string[]> = {};

    driverAssignments
      .filter((assignment) => assignment.driver?.trim())
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.timeIndex - b.timeIndex;
      })
      .forEach((assignment) => {
        const driverName = assignment.driver?.trim();
        if (!driverName) return;

        if (!groupedDrivers[assignment.date]) {
          groupedDrivers[assignment.date] = [];
        }

        if (!groupedDrivers[assignment.date].includes(driverName)) {
          groupedDrivers[assignment.date].push(driverName);
        }
      });

    return Object.fromEntries(
      Object.entries(groupedDrivers).map(([date, drivers]) => {
        if (drivers.length <= 2) {
          return [date, drivers.join(" & ")];
        }

        return [date, `${drivers.slice(0, -1).join(", ")} & ${drivers[drivers.length - 1]}`];
      })
    );
  }, [driverAssignments]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const assignmentsQuery = query(
      collection(db, "driverAssignments"),
      where("date", ">=", calendarStartKey),
      where("date", "<=", calendarEndKey)
    );

    const unsubscribe = onSnapshot(
      assignmentsQuery,
      (snapshot) => {
        setDriverAssignments(snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as DriverAssignment[]);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching driver schedule:", err);
        setError("Unable to load driver schedule");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [calendarEndKey, calendarStartKey]);

  const createAssignmentHistoryEntry = (
    action: "created" | "edited",
    snapshotAfter: Partial<DriverAssignment>,
    details: string
  ) => ({
    action,
    timestamp: new Date(),
    userId: currentUser?.uid || "",
    userName: userProfile?.displayName || currentUser?.displayName || currentUser?.email || "Unknown",
    details,
    snapshotAfter: JSON.parse(JSON.stringify(snapshotAfter)),
  });

  const setDriverForDay = async (dateKey: string, driverName: string) => {
    const trimmedDriverName = driverName.trim();
    if (!trimmedDriverName) return;

    setSaving(true);
    setError(null);

    try {
      const dayDate = new Date(`${dateKey}T00:00:00`);
      const timeSlots = getTimeSlotsByDate(dayDate);
      const assignmentsForDay = driverAssignments.filter((assignment) => assignment.date === dateKey);

      for (let timeIndex = 0; timeIndex < timeSlots.length; timeIndex++) {
        const existingAssignment = assignmentsForDay.find((assignment) => assignment.timeIndex === timeIndex);
        const snapshotAfter = {
          ...(existingAssignment || {}),
          date: dateKey,
          timeIndex,
          driver: trimmedDriverName,
        };
        delete (snapshotAfter as Partial<DriverAssignment>).id;

        if (existingAssignment?.id) {
          await updateDoc(doc(db, "driverAssignments", existingAssignment.id), {
            driver: trimmedDriverName,
            history: arrayUnion(createAssignmentHistoryEntry("edited", snapshotAfter, `driver set to ${trimmedDriverName}`)),
          });
        } else {
          await addDoc(collection(db, "driverAssignments"), {
            date: dateKey,
            timeIndex,
            driver: trimmedDriverName,
            history: [createAssignmentHistoryEntry("created", snapshotAfter, `driver set to ${trimmedDriverName}`)],
          });
        }
      }
    } catch (err) {
      console.error("Error saving driver schedule:", err);
      setError("Unable to save driver schedule");
    } finally {
      setSaving(false);
    }
  };

  const clearDriverForDay = async (dateKey: string) => {
    setSaving(true);
    setError(null);

    try {
      const assignmentsForDay = driverAssignments.filter(
        (assignment) => assignment.date === dateKey && assignment.id && assignment.driver?.trim()
      );

      for (const assignment of assignmentsForDay) {
        const snapshotAfter = {
          ...assignment,
          driver: "",
        };
        delete (snapshotAfter as Partial<DriverAssignment>).id;

        await updateDoc(doc(db, "driverAssignments", assignment.id!), {
          driver: "",
          history: arrayUnion(createAssignmentHistoryEntry("edited", snapshotAfter, "driver cleared")),
        });
      }
    } catch (err) {
      console.error("Error clearing driver schedule:", err);
      setError("Unable to clear driver schedule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-50 p-3 dark:bg-zinc-950 sm:p-4">
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="min-w-[760px]">
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(7, minmax(92px, 1fr))" }}>
            {WEEK_DAYS.map((day) => (
              <div
                key={day}
                className="flex h-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-semibold uppercase tracking-wide text-white shadow-sm"
              >
                {day}
              </div>
            ))}

            {weeks.map((week, weekIndex) => (
              <div key={`week-${weekIndex}`} className="contents">
                {week.map((day) => {
                  const dateKey = format(day, "yyyy-MM-dd");
                  const inMonth = isSameMonth(day, monthStartDate);
                  const today = isToday(day);
                  const assignedDrivers = driversByDate[dateKey];

                  return (
                    <div
                      key={day.toISOString()}
                      className={`relative h-28 rounded-lg border p-2 transition-colors ${
                        today
                          ? "border-blue-300 bg-blue-500/10 hover:bg-blue-500/15 dark:border-blue-500/40 dark:bg-blue-500/15 dark:hover:bg-blue-500/20"
                          : assignedDrivers
                          ? "border-green-300 bg-green-500/10 hover:bg-green-500/15 dark:border-green-500/40 dark:bg-green-500/15 dark:hover:bg-green-500/20"
                          : inMonth
                          ? "border-gray-300 bg-white hover:bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                          : "border-gray-200 bg-gray-100 text-gray-400 dark:border-zinc-900 dark:bg-zinc-950 dark:text-zinc-600"
                      }`}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setContextMenu({
                          isOpen: true,
                          dateKey,
                          position: { x: event.clientX, y: event.clientY },
                        });
                      }}
                    >
                      <div className="flex justify-center">
                        <span
                          className={`flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-sm font-semibold ${
                            today
                              ? "text-blue-700 dark:text-blue-200"
                              : inMonth
                              ? "text-gray-900 dark:text-white"
                              : "text-gray-400 dark:text-zinc-600"
                          }`}
                        >
                          {format(day, "MMM d").toLowerCase()}
                        </span>
                      </div>
                      {assignedDrivers && (
                        <div className="mt-5 flex justify-center">
                          <span className="text-sm font-semibold text-white">
                            {assignedDrivers}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {(loading || saving) && (
            <div className="mt-3 text-center text-sm text-gray-500 dark:text-zinc-500">
              {saving ? "Saving driver schedule..." : "Loading driver schedule..."}
            </div>
          )}
          {error && (
            <div className="mt-3 text-center text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>
      <DriversContextMenu
        isOpen={Boolean(contextMenu?.isOpen)}
        position={contextMenu?.position || { x: 0, y: 0 }}
        currentDriver={contextMenu ? driversByDate[contextMenu.dateKey] : undefined}
        onSelectDriver={(driverName) => {
          if (!contextMenu) return;
          void setDriverForDay(contextMenu.dateKey, driverName);
        }}
        onUnassign={() => {
          if (!contextMenu) return;
          void clearDriverForDay(contextMenu.dateKey);
        }}
        onClose={() => setContextMenu(null)}
      />
    </div>
  );
}

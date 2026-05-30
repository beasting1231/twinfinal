import { useEffect, useMemo, useState } from "react";
import { eachDayOfInterval, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import type { AvailabilityStatus, UserProfile } from "../types/index";
import { isAvailabilityActive, normalizeAvailabilityStatus } from "../utils/availabilityState";

interface AvailabilityOverviewTableProps {
  monthStartDate: Date;
  onBack: () => void;
}

interface AvailabilityRecord {
  userId: string;
  date: string;
  timeSlot?: string;
  status?: AvailabilityStatus;
  signedInAt?: string;
  signedOutAt?: string;
}

interface OverviewCell {
  state: "signed-in" | "signed-out" | "never";
  timestamp?: string;
  history: OverviewHistoryEvent[];
}

interface OverviewHistoryEvent {
  type: "signed-in" | "signed-out";
  timestamp: string;
}

interface SlotHistoryEvent {
  type: OverviewHistoryEvent["type"];
  timestamp: string;
  slotKey: string;
}

const EXCLUDED_OVERVIEW_PILOTS = new Set([
  "lyndice",
  "peter test",
  "test agency",
  "basting",
]);

export function AvailabilityOverviewTable({ monthStartDate, onBack }: AvailabilityOverviewTableProps) {
  const [pilots, setPilots] = useState<UserProfile[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRecord[]>([]);
  const [pilotsLoading, setPilotsLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [openCellKey, setOpenCellKey] = useState<string | null>(null);

  const monthStart = useMemo(() => startOfMonth(monthStartDate), [monthStartDate]);
  const monthEnd = useMemo(() => endOfMonth(monthStartDate), [monthStartDate]);
  const days = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd]);

  useEffect(() => {
    setPilotsLoading(true);

    const pilotsQuery = query(
      collection(db, "userProfiles"),
      where("role", "==", "pilot")
    );

    const unsubscribe = onSnapshot(
      pilotsQuery,
      (snapshot) => {
        const pilotRows = snapshot.docs
          .map((docSnapshot) => {
            const data = docSnapshot.data();
            return {
              ...data,
              uid: docSnapshot.id,
            } as UserProfile;
          })
          .filter((user) => user.role === "pilot" && !isExcludedPilot(user.displayName))
          .sort(sortOverviewPilots);

        setPilots(pilotRows);
        setPilotsLoading(false);
      },
      (error) => {
        console.error("Error fetching pilots for availability overview:", error);
        setPilotsLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    setAvailabilityLoading(true);

    const availabilityQuery = query(
      collection(db, "availability"),
      where("date", ">=", format(monthStart, "yyyy-MM-dd")),
      where("date", "<=", format(monthEnd, "yyyy-MM-dd"))
    );

    const unsubscribe = onSnapshot(
      availabilityQuery,
      (snapshot) => {
        const records = snapshot.docs.map((docSnapshot) => docSnapshot.data() as AvailabilityRecord);
        setAvailability(records);
        setAvailabilityLoading(false);
      },
      (error) => {
        console.error("Error fetching availability overview:", error);
        setAvailabilityLoading(false);
      }
    );

    return unsubscribe;
  }, [monthStart, monthEnd]);

  useEffect(() => {
    if (!openCellKey) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest('[data-history-cell-open="true"]')) {
        setOpenCellKey(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openCellKey]);

  const cellByDateAndPilot = useMemo(() => {
    const recordsByCell = new Map<string, AvailabilityRecord[]>();

    availability.forEach((record) => {
      const key = `${record.date}-${record.userId}`;
      const records = recordsByCell.get(key) || [];
      records.push(record);
      recordsByCell.set(key, records);
    });

    const cells = new Map<string, OverviewCell>();

    recordsByCell.forEach((records, key) => {
      const hasActiveStatus = records.some((record) =>
        isAvailabilityActive(normalizeAvailabilityStatus(record.status))
      );
      const history = buildHistory(records);

      if (hasActiveStatus) {
        cells.set(key, {
          state: "signed-in",
          timestamp: latestTimestamp(history.filter((event) => event.type === "signed-in")),
          history,
        });
        return;
      }

      if (records.length === 0) {
        return;
      }

      cells.set(key, {
        state: "signed-out",
        timestamp: latestTimestamp(history.filter((event) => event.type === "signed-out")) || latestTimestamp(history),
        history,
      });
    });

    return cells;
  }, [availability]);

  const loading = pilotsLoading || availabilityLoading;

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-4 dark:bg-zinc-950">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-zinc-400">
            Availability Overview
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {format(monthStartDate, "MMMM yyyy")}
          </h2>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:border-gray-400 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
        >
          Back to Availability
        </button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-500 dark:border-zinc-700"></div>
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-gray-300 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 w-20 min-w-20 border-b border-r border-gray-300 bg-gray-100 px-2 py-3 text-left font-semibold text-gray-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                  Date
                </th>
                <th className="sticky left-20 top-0 z-20 w-16 min-w-16 border-b border-r border-gray-300 bg-gray-100 px-2 py-3 text-center font-semibold text-gray-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                  Count
                </th>
                {pilots.map((pilot) => (
                  <th
                    key={pilot.uid}
                    className="sticky top-0 z-10 w-24 min-w-24 max-w-24 border-b border-r border-gray-300 bg-gray-100 px-2 py-3 text-center font-semibold text-gray-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                    title={pilot.displayName}
                  >
                    <div className="truncate">{pilot.displayName}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const signedInCount = pilots.filter((pilot) =>
                  cellByDateAndPilot.get(`${dateStr}-${pilot.uid}`)?.state === "signed-in"
                ).length;

                return (
                  <tr key={dateStr}>
                    <th className="sticky left-0 z-10 w-20 min-w-20 border-b border-r border-gray-300 bg-white px-2 py-2 text-left font-semibold text-gray-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white">
                      {format(day, "dd/MM")}
                    </th>
                    <td className="sticky left-20 z-10 h-10 w-16 min-w-16 border-b border-r border-gray-300 bg-white px-2 py-2 text-center font-bold text-gray-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white">
                      {signedInCount}
                    </td>
                    {pilots.map((pilot) => {
                      const cellKey = `${dateStr}-${pilot.uid}`;
                      const cell = cellByDateAndPilot.get(cellKey) || { state: "never" as const, history: [] };
                      const hasHistory = cell.history.length > 0;

                      return (
                        <td
                          key={cellKey}
                          data-history-cell-open={openCellKey === cellKey ? "true" : undefined}
                          className={`relative h-10 w-24 min-w-24 max-w-24 border-b border-r border-gray-300 p-0 text-center font-semibold dark:border-zinc-800 ${getCellClassName(cell.state)}`}
                          title={getCellTitle(cell.state)}
                        >
                          <button
                            type="button"
                            disabled={!hasHistory}
                            onClick={() => setOpenCellKey(openCellKey === cellKey ? null : cellKey)}
                            className={`h-10 w-full px-2 text-sm font-bold ${hasHistory ? "cursor-pointer" : "cursor-default"}`}
                          >
                            {cell.state === "never" ? "" : formatCellDate(cell.timestamp, dateStr)}
                          </button>
                          {openCellKey === cellKey && hasHistory && (
                            <div className="absolute left-1/2 top-full z-30 mt-1 w-56 -translate-x-1/2 rounded-lg border border-gray-300 bg-white p-2 text-left shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                              <div className="mb-2 border-b border-gray-200 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:border-zinc-700 dark:text-zinc-400">
                                {pilot.displayName} · {format(day, "dd/MM")}
                              </div>
                              <div className="max-h-56 overflow-y-auto">
                                {cell.history.map((event) => (
                                  <div
                                    key={`${event.type}-${event.timestamp}`}
                                    className={`flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs font-semibold ${
                                      event.type === "signed-in"
                                        ? "bg-green-500 text-white dark:bg-green-600"
                                        : "bg-red-500 text-white dark:bg-red-600"
                                    }`}
                                  >
                                    <span>{event.type === "signed-in" ? "Signed in" : "Signed out for day"}</span>
                                    <span className="font-mono text-white/90">
                                      {formatHistoryDate(event.timestamp)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function getCellClassName(state: OverviewCell["state"]) {
  if (state === "signed-in") {
    return "bg-green-500 text-white dark:bg-green-600 dark:text-white";
  }

  if (state === "signed-out") {
    return "bg-red-500 text-white dark:bg-red-600 dark:text-white";
  }

  return "bg-gray-800 text-gray-300 dark:bg-zinc-900 dark:text-zinc-500";
}

function normalizePilotName(name: string) {
  return name.trim().toLowerCase();
}

function isExcludedPilot(name: string) {
  return EXCLUDED_OVERVIEW_PILOTS.has(normalizePilotName(name));
}

function sortOverviewPilots(a: UserProfile, b: UserProfile) {
  const aIsCarola = normalizePilotName(a.displayName) === "carola";
  const bIsCarola = normalizePilotName(b.displayName) === "carola";

  if (aIsCarola !== bIsCarola) {
    return aIsCarola ? 1 : -1;
  }

  return a.displayName.localeCompare(b.displayName);
}

function getCellTitle(state: OverviewCell["state"]) {
  if (state === "signed-in") return "Signed in";
  if (state === "signed-out") return "Signed out";
  return "Never signed in";
}

function formatCellDate(timestamp: string | undefined, fallbackDate: string) {
  if (!timestamp) {
    return format(parseISO(fallbackDate), "dd/MM");
  }

  const parsedDate = parseISO(timestamp);
  if (Number.isNaN(parsedDate.getTime())) {
    return format(parseISO(fallbackDate), "dd/MM");
  }

  return format(parsedDate, "dd/MM");
}

function buildHistory(records: AvailabilityRecord[]) {
  const eventsByMinute = new Map<string, SlotHistoryEvent>();

  records.forEach((record) => {
    const slotKey = record.timeSlot || `${record.date}-${record.userId}-${records.indexOf(record)}`;
    addSlotHistoryEvent(eventsByMinute, "signed-in", record.signedInAt, slotKey);
    addSlotHistoryEvent(eventsByMinute, "signed-out", record.signedOutAt, slotKey);
  });

  const chronologicalEvents = Array.from(eventsByMinute.values()).sort((a, b) =>
    a.timestamp === b.timestamp
      ? getEventSortOrder(a.type) - getEventSortOrder(b.type)
      : a.timestamp.localeCompare(b.timestamp)
  );

  const activeSlots = new Set<string>();
  const stateChanges: OverviewHistoryEvent[] = [];

  chronologicalEvents.forEach((event) => {
    const activeCountBefore = activeSlots.size;

    if (event.type === "signed-in") {
      activeSlots.add(event.slotKey);

      if (activeCountBefore === 0 && activeSlots.size > 0) {
        stateChanges.push({ type: "signed-in", timestamp: event.timestamp });
      }

      return;
    }

    activeSlots.delete(event.slotKey);

    if (activeCountBefore > 0 && activeSlots.size === 0) {
      stateChanges.push({ type: "signed-out", timestamp: event.timestamp });
    }
  });

  return stateChanges.reverse();
}

function addSlotHistoryEvent(
  events: Map<string, SlotHistoryEvent>,
  type: OverviewHistoryEvent["type"],
  timestamp: string | undefined,
  slotKey: string
) {
  if (!timestamp) return;

  const key = `${type}-${timestamp.slice(0, 16)}-${slotKey}`;
  const existing = events.get(key);

  if (existing) {
    if (timestamp > existing.timestamp) {
      existing.timestamp = timestamp;
    }
    return;
  }

  events.set(key, { type, timestamp, slotKey });
}

function getEventSortOrder(type: OverviewHistoryEvent["type"]) {
  return type === "signed-out" ? 0 : 1;
}

function latestTimestamp(events: OverviewHistoryEvent[]) {
  return events.reduce<string | undefined>((latest, event) => {
    if (!latest || event.timestamp > latest) {
      return event.timestamp;
    }

    return latest;
  }, undefined);
}

function formatHistoryDate(timestamp: string) {
  const parsedDate = parseISO(timestamp);
  if (Number.isNaN(parsedDate.getTime())) {
    return timestamp;
  }

  return format(parsedDate, "dd/MM HH:mm");
}

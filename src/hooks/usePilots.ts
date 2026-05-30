import { useState, useEffect, useRef, useMemo } from "react";
import { collection, query, where, getDocs, onSnapshot, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { format, differenceInDays, parseISO, startOfDay } from "date-fns";
import type { Pilot, AvailabilityStatus } from "../types/index";
import { isAvailabilityActive, normalizeAvailabilityStatus } from "../utils/availabilityState";

export interface PilotAvailability {
  pilot: Pilot;
  availableTimeSlots: Set<string>;
}

// Map from pilotUid to Map<timeSlot, status>
export type PilotAvailabilityStatusMap = Map<string, Map<string, AvailabilityStatus>>;
export type PilotSignInTimeBySlotMap = Map<string, Map<string, string>>;
export type PilotSignOutTimeBySlotMap = Map<string, Map<string, string>>;

const PILOTS_CACHE_PREFIX = 'twin_pilots_cache_';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface AvailabilityRecord {
  userId: string;
  timeSlot: string;
  status?: AvailabilityStatus;
  signedInAt?: string;
  signedOutAt?: string;
}

function parseAvailabilityTimestamp(value?: string): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isAvailabilityTimestampAtOrBefore(value: string | undefined, targetTime: number): boolean {
  const timestamp = parseAvailabilityTimestamp(value);
  return timestamp !== null && timestamp <= targetTime;
}

function getAvailabilityStatusAt(record: AvailabilityRecord, historyTimestamp?: Date | null): AvailabilityStatus {
  const currentStatus = normalizeAvailabilityStatus(record.status);

  if (!historyTimestamp) {
    return currentStatus;
  }

  const targetTime = historyTimestamp.getTime();
  const signedInTime = parseAvailabilityTimestamp(record.signedInAt);
  const signedOutTime = parseAvailabilityTimestamp(record.signedOutAt);

  if (!signedInTime || signedInTime > targetTime) {
    return "unavailable";
  }

  const signedOutAfterLatestSignIn =
    signedOutTime !== null && signedOutTime >= signedInTime;

  if (signedOutAfterLatestSignIn && signedOutTime <= targetTime) {
    return "unavailable";
  }

  if (isAvailabilityActive(currentStatus)) {
    return currentStatus;
  }

  return "available";
}

function buildAvailabilityState(records: AvailabilityRecord[], historyTimestamp?: Date | null) {
  const pilotIds = new Set<string>();
  const availabilityMap = new Map<string, Set<string>>();
  const statusMap: PilotAvailabilityStatusMap = new Map();
  const signInTimesMap = new Map<string, string>();
  const signInTimesBySlotMap: PilotSignInTimeBySlotMap = new Map();
  const signOutTimesBySlotMap: PilotSignOutTimeBySlotMap = new Map();
  const historyTime = historyTimestamp?.getTime();

  records.forEach((data) => {
    const status = getAvailabilityStatusAt(data, historyTimestamp);

    if (isAvailabilityActive(status)) {
      pilotIds.add(data.userId);
      if (!availabilityMap.has(data.userId)) {
        availabilityMap.set(data.userId, new Set());
      }
      availabilityMap.get(data.userId)!.add(data.timeSlot);
    }

    if (!statusMap.has(data.userId)) {
      statusMap.set(data.userId, new Map());
    }
    statusMap.get(data.userId)!.set(data.timeSlot, status);

    const signedInAt = data.signedInAt;
    const signedOutAt = data.signedOutAt;

    if (signedInAt && (!historyTime || isAvailabilityTimestampAtOrBefore(signedInAt, historyTime))) {
      const existingTime = signInTimesMap.get(data.userId);
      if (!existingTime || signedInAt < existingTime) {
        signInTimesMap.set(data.userId, signedInAt);
      }

      if (!signInTimesBySlotMap.has(data.userId)) {
        signInTimesBySlotMap.set(data.userId, new Map());
      }
      const existingSlotTime = signInTimesBySlotMap.get(data.userId)!.get(data.timeSlot);
      if (!existingSlotTime || signedInAt > existingSlotTime) {
        signInTimesBySlotMap.get(data.userId)!.set(data.timeSlot, signedInAt);
      }
    }

    if (signedOutAt && (!historyTime || isAvailabilityTimestampAtOrBefore(signedOutAt, historyTime))) {
      if (!signOutTimesBySlotMap.has(data.userId)) {
        signOutTimesBySlotMap.set(data.userId, new Map());
      }
      const existingSignOutTime = signOutTimesBySlotMap.get(data.userId)!.get(data.timeSlot);
      if (!existingSignOutTime || signedOutAt > existingSignOutTime) {
        signOutTimesBySlotMap.get(data.userId)!.set(data.timeSlot, signedOutAt);
      }
    }
  });

  return {
    pilotIds,
    availabilityMap,
    statusMap,
    signInTimesMap,
    signInTimesBySlotMap,
    signOutTimesBySlotMap,
  };
}

export function usePilots(selectedDate: Date, historyTimestamp?: Date | null) {
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const cacheKey = `${PILOTS_CACHE_PREFIX}${dateStr}`;
  const isHistoryMode = Boolean(historyTimestamp);

  const [rawPilots, setRawPilots] = useState<Pilot[]>(() => {
    if (isHistoryMode) return [];
    // Try to load from cache on initialization
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < CACHE_EXPIRY_MS) {
          console.log(`📦 Loaded pilots from cache for ${dateStr}`);
          return data;
        }
      }
    } catch (error) {
      console.error('Error loading pilots cache:', error);
    }
    return [];
  });
  const [pilotAvailability, setPilotAvailability] = useState<Map<string, Set<string>>>(() => {
    if (isHistoryMode) return new Map();
    // Try to load from cache on initialization
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { availability, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < CACHE_EXPIRY_MS && availability) {
          const availMap = new Map<string, Set<string>>();
          Object.entries(availability).forEach(([pilotId, slots]) => {
            availMap.set(pilotId, new Set(slots as string[]));
          });
          return availMap;
        }
      }
    } catch (error) {
      console.error('Error loading availability cache:', error);
    }
    return new Map();
  });
  const [pilotAvailabilityStatus, setPilotAvailabilityStatus] = useState<PilotAvailabilityStatusMap>(() => {
    if (isHistoryMode) return new Map();
    // Try to load from cache on initialization
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { availabilityStatus, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < CACHE_EXPIRY_MS && availabilityStatus) {
          const statusMap = new Map<string, Map<string, AvailabilityStatus>>();
          Object.entries(availabilityStatus).forEach(([pilotId, slots]) => {
            const slotMap = new Map<string, AvailabilityStatus>();
            Object.entries(slots as Record<string, AvailabilityStatus>).forEach(([timeSlot, status]) => {
              slotMap.set(timeSlot, status);
            });
            statusMap.set(pilotId, slotMap);
          });
          return statusMap;
        }
      }
    } catch (error) {
      console.error('Error loading availability status cache:', error);
    }
    return new Map();
  });
  const [pilotSignInTimes, setPilotSignInTimes] = useState<Map<string, string>>(() => {
    if (isHistoryMode) return new Map();
    // Try to load from cache on initialization
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { signInTimes, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < CACHE_EXPIRY_MS && signInTimes) {
          return new Map(Object.entries(signInTimes));
        }
      }
    } catch (error) {
      console.error('Error loading sign-in times cache:', error);
    }
    return new Map();
  });
  const [pilotSignInTimesBySlot, setPilotSignInTimesBySlot] = useState<PilotSignInTimeBySlotMap>(() => {
    if (isHistoryMode) return new Map();
    // Try to load from cache on initialization
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { signInTimesBySlot, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < CACHE_EXPIRY_MS && signInTimesBySlot) {
          const signInMap = new Map<string, Map<string, string>>();
          Object.entries(signInTimesBySlot).forEach(([pilotId, slots]) => {
            signInMap.set(pilotId, new Map(Object.entries(slots as Record<string, string>)));
          });
          return signInMap;
        }
      }
    } catch (error) {
      console.error('Error loading per-slot sign-in times cache:', error);
    }
    return new Map();
  });
  const [pilotSignOutTimesBySlot, setPilotSignOutTimesBySlot] = useState<PilotSignOutTimeBySlotMap>(() => {
    if (isHistoryMode) return new Map();
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { signOutTimesBySlot, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < CACHE_EXPIRY_MS && signOutTimesBySlot) {
          const signOutMap = new Map<string, Map<string, string>>();
          Object.entries(signOutTimesBySlot).forEach(([pilotId, slots]) => {
            signOutMap.set(pilotId, new Map(Object.entries(slots as Record<string, string>)));
          });
          return signOutMap;
        }
      }
    } catch (error) {
      console.error('Error loading per-slot sign-out times cache:', error);
    }
    return new Map();
  });
  const [customOrder, setCustomOrder] = useState<string[] | null>(() => {
    if (isHistoryMode) return null;
    // Try to load from cache on initialization
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { customPilotOrder, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < CACHE_EXPIRY_MS && customPilotOrder) {
          return customPilotOrder;
        }
      }
    } catch (error) {
      console.error('Error loading custom order cache:', error);
    }
    return null;
  });
  const [loading, setLoading] = useState(() => {
    if (isHistoryMode) return true;
    // If we have cached data for this date, set loading to false immediately
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < CACHE_EXPIRY_MS && data.length > 0) {
          return false; // Don't show loading screen if we have valid cache
        }
      }
    } catch (error) {
      console.error('Error checking pilots cache:', error);
    }
    return true;
  });
  const [error, setError] = useState<string | null>(null);
  const [availabilityRecords, setAvailabilityRecords] = useState<AvailabilityRecord[] | null>(null);
  const prevPilotsRef = useRef<Pilot[]>([]);
  const prevDateStrRef = useRef(dateStr);
  const pilotProfileCacheRef = useRef<Map<string, Pilot>>(new Map());

  // Synchronize state immediately when date changes to prevent showing stale data
  useEffect(() => {
    if (isHistoryMode) {
      return;
    }

    // Skip on initial mount
    if (prevDateStrRef.current === dateStr) {
      prevDateStrRef.current = dateStr;
      return;
    }

    prevDateStrRef.current = dateStr;

    // Immediately load cached data for the new date (or clear if no cache)
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp, availability, availabilityStatus, signInTimes, signInTimesBySlot, signOutTimesBySlot, customPilotOrder } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < CACHE_EXPIRY_MS) {
          console.log(`📦 Immediately loaded cached data for ${dateStr}`);
          setRawPilots(data);

          // Restore availability maps from cached data
          if (availability) {
            const availMap = new Map<string, Set<string>>();
            Object.entries(availability).forEach(([pilotId, slots]) => {
              availMap.set(pilotId, new Set(slots as string[]));
            });
            setPilotAvailability(availMap);
          }

          if (availabilityStatus) {
            const statusMap = new Map<string, Map<string, AvailabilityStatus>>();
            Object.entries(availabilityStatus).forEach(([pilotId, slots]) => {
              const slotMap = new Map<string, AvailabilityStatus>();
              Object.entries(slots as Record<string, AvailabilityStatus>).forEach(([timeSlot, status]) => {
                slotMap.set(timeSlot, status);
              });
              statusMap.set(pilotId, slotMap);
            });
            setPilotAvailabilityStatus(statusMap);
          }

          if (signInTimes) {
            setPilotSignInTimes(new Map(Object.entries(signInTimes)));
          }

          if (signInTimesBySlot) {
            const signInMap = new Map<string, Map<string, string>>();
            Object.entries(signInTimesBySlot).forEach(([pilotId, slots]) => {
              signInMap.set(pilotId, new Map(Object.entries(slots as Record<string, string>)));
            });
            setPilotSignInTimesBySlot(signInMap);
          } else {
            setPilotSignInTimesBySlot(new Map());
          }

          if (signOutTimesBySlot) {
            const signOutMap = new Map<string, Map<string, string>>();
            Object.entries(signOutTimesBySlot).forEach(([pilotId, slots]) => {
              signOutMap.set(pilotId, new Map(Object.entries(slots as Record<string, string>)));
            });
            setPilotSignOutTimesBySlot(signOutMap);
          } else {
            setPilotSignOutTimesBySlot(new Map());
          }

          if (customPilotOrder) {
            setCustomOrder(customPilotOrder);
          }

          // Don't show loading since we have cache
          setLoading(false);
          return;
        }
      }
    } catch (error) {
      console.error('Error loading pilots cache on date change:', error);
    }

    // No valid cache - clear stale data and show loading
    console.log(`🔄 Date changed to ${dateStr}, clearing stale data`);
    setRawPilots([]);
    setPilotAvailability(new Map());
    setPilotAvailabilityStatus(new Map());
    setPilotSignInTimes(new Map());
    setPilotSignInTimesBySlot(new Map());
    setPilotSignOutTimesBySlot(new Map());
    setAvailabilityRecords(null);
    setCustomOrder(null);
  }, [dateStr, cacheKey, isHistoryMode]);

  useEffect(() => {
    const pilotsStartTime = performance.now();
    console.log(`📡 Starting pilots subscription for ${dateStr}${isHistoryMode ? " in history mode" : ""}...`);

    // Check if we have valid cache for this date
    let hasValidCache = false;
    if (!isHistoryMode) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          const age = Date.now() - timestamp;
          if (age < CACHE_EXPIRY_MS && data.length > 0) {
            hasValidCache = true;
          }
        }
      } catch (error) {
        console.error('Error checking pilots cache:', error);
      }
    }

    // Only set loading to true if we don't have valid cache
    if (!hasValidCache) {
      setLoading(true);
    }
    setError(null);
    setAvailabilityRecords(null);

    // Fetch custom pilot order for this date (if any)
    const fetchCustomOrder = async () => {
      try {
        const orderDocRef = doc(db, "pilotOrders", dateStr);
        const orderDoc = await getDoc(orderDocRef);
        if (orderDoc.exists()) {
          const data = orderDoc.data();
          setCustomOrder(data.order || null);
        } else {
          setCustomOrder(null);
        }
      } catch (err) {
        console.error("Error fetching custom pilot order:", err);
        setCustomOrder(null);
      }
    };

    fetchCustomOrder();

    // Query availability collection for the selected date
    const availabilityQuery = query(
      collection(db, "availability"),
      where("date", "==", dateStr)
    );

    // Subscribe to real-time updates
    const unsubscribe = onSnapshot(
      availabilityQuery,
      (availabilitySnapshot) => {
        const records = availabilitySnapshot.docs.map((docSnapshot) => docSnapshot.data() as AvailabilityRecord);
        setAvailabilityRecords(records);
        const pilotsTime = performance.now() - pilotsStartTime;
        console.log(`⏱️ Availability records loaded in ${pilotsTime.toFixed(0)}ms (${records.length} records)`);
      },
      (err) => {
        console.error("Error fetching pilots:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    // Cleanup subscription on unmount or date change
    return () => unsubscribe();
  }, [selectedDate, isHistoryMode, cacheKey, dateStr]);

  useEffect(() => {
    let cancelled = false;

    const applyAvailabilityState = async () => {
      if (!availabilityRecords) {
        return;
      }

      try {
        const {
          pilotIds,
          availabilityMap,
          statusMap,
          signInTimesMap,
          signInTimesBySlotMap,
          signOutTimesBySlotMap,
        } = buildAvailabilityState(availabilityRecords, historyTimestamp);

        if (pilotIds.size === 0) {
          setRawPilots([]);
          setPilotAvailability(new Map());
          setPilotAvailabilityStatus(statusMap);
          setPilotSignInTimes(signInTimesMap);
          setPilotSignInTimesBySlot(signInTimesBySlotMap);
          setPilotSignOutTimesBySlot(signOutTimesBySlotMap);
          if (!isHistoryMode) {
            try {
              localStorage.removeItem(cacheKey);
            } catch (error) {
              console.error('Error clearing pilots cache:', error);
            }
          }
          setLoading(false);
          return;
        }

        const pilotsData = await Promise.all(Array.from(pilotIds).map(async (uid) => {
          const cachedPilot = isHistoryMode ? pilotProfileCacheRef.current.get(uid) : undefined;
          if (cachedPilot) {
            return cachedPilot;
          }

          const profileQuery = query(
            collection(db, "userProfiles"),
            where("uid", "==", uid)
          );
          const profileSnapshot = await getDocs(profileQuery);

          const pilot = profileSnapshot.empty
            ? {
                uid,
                displayName: "Unknown Pilot",
                femalePilot: false,
              }
            : (() => {
                const profileData = profileSnapshot.docs[0].data();
                return {
                  uid: profileData.uid,
                  displayName: profileData.displayName || "Unknown Pilot",
                  email: profileData.email || "",
                  femalePilot: profileData.femalePilot || false,
                  priority: profileData.priority || undefined,
                };
              })();

          if (isHistoryMode) {
            pilotProfileCacheRef.current.set(uid, pilot);
          }
          return pilot;
        }));

        if (cancelled) return;

        setRawPilots(prevPilots => {
          if (prevPilots.length === 0) {
            return pilotsData;
          }

          const prevPilotsMap = new Map(prevPilots.map(p => [p.uid, p]));
          let hasChanges = prevPilots.length !== pilotsData.length;

          if (!hasChanges) {
            for (const newPilot of pilotsData) {
              const prevPilot = prevPilotsMap.get(newPilot.uid);
              if (!prevPilot || JSON.stringify(prevPilot) !== JSON.stringify(newPilot)) {
                hasChanges = true;
                break;
              }
            }
          }

          if (!hasChanges) {
            return prevPilots;
          }

          return pilotsData.map(newPilot => {
            const prevPilot = prevPilotsMap.get(newPilot.uid);
            return prevPilot && JSON.stringify(prevPilot) === JSON.stringify(newPilot)
              ? prevPilot
              : newPilot;
          });
        });

        setPilotAvailability(availabilityMap);
        setPilotAvailabilityStatus(statusMap);
        setPilotSignInTimes(signInTimesMap);
        setPilotSignInTimesBySlot(signInTimesBySlotMap);
        setPilotSignOutTimesBySlot(signOutTimesBySlotMap);

        if (!isHistoryMode) {
          try {
            const availabilityObj: Record<string, string[]> = {};
            availabilityMap.forEach((slots, pilotId) => {
              availabilityObj[pilotId] = Array.from(slots);
            });

            const statusObj: Record<string, Record<string, AvailabilityStatus>> = {};
            statusMap.forEach((slotMap, pilotId) => {
              const slots: Record<string, AvailabilityStatus> = {};
              slotMap.forEach((status, timeSlot) => {
                slots[timeSlot] = status;
              });
              statusObj[pilotId] = slots;
            });

            const signInTimesBySlotObj: Record<string, Record<string, string>> = {};
            signInTimesBySlotMap.forEach((slotMap, pilotId) => {
              signInTimesBySlotObj[pilotId] = Object.fromEntries(slotMap);
            });

            const signOutTimesBySlotObj: Record<string, Record<string, string>> = {};
            signOutTimesBySlotMap.forEach((slotMap, pilotId) => {
              signOutTimesBySlotObj[pilotId] = Object.fromEntries(slotMap);
            });

            localStorage.setItem(cacheKey, JSON.stringify({
              data: pilotsData,
              availability: availabilityObj,
              availabilityStatus: statusObj,
              signInTimes: Object.fromEntries(signInTimesMap),
              signInTimesBySlot: signInTimesBySlotObj,
              signOutTimesBySlot: signOutTimesBySlotObj,
              customPilotOrder: customOrder,
              timestamp: Date.now(),
            }));
          } catch (error) {
            console.error('Error caching pilots data:', error);
          }
        }

        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        console.error("Error processing pilots:", err);
        setError(err.message);
        setLoading(false);
      }
    };

    applyAvailabilityState();

    return () => {
      cancelled = true;
    };
  }, [availabilityRecords, historyTimestamp, isHistoryMode, cacheKey, customOrder]);

  // Helper function to check if a pilot signed in on time (>= 30 days before the target date)
  const isOnTimeSignIn = (pilotUid: string): boolean => {
    const signedInAt = pilotSignInTimes.get(pilotUid);

    // If no signedInAt timestamp, treat as on-time (backwards compatibility for old records)
    if (!signedInAt) return true;

    const signInDate = parseISO(signedInAt);
    const targetDate = startOfDay(selectedDate);
    const signInDay = startOfDay(signInDate);

    // Calculate days between sign-in and target date
    const daysInAdvance = differenceInDays(targetDate, signInDay);

    // On-time if signed in >= 30 days before
    return daysInAdvance >= 30;
  };

  // Memoized sorted pilots - recalculates only when rawPilots, customOrder, or signInTimes change
  const pilots = useMemo(() => {
    console.log("Recalculating pilot sort order");

    // Create a copy for sorting (don't mutate rawPilots)
    let sortedPilots = [...rawPilots];

    // If custom order exists for this date, apply it (admin override takes precedence)
    if (customOrder && customOrder.length > 0) {
      console.log("Applying custom pilot order for this date");

      // Create a map for quick lookup
      const pilotMap = new Map(sortedPilots.map(p => [p.uid, p]));

      // Build sorted array based on custom order
      const customSorted: Pilot[] = [];

      // First, add pilots in the custom order
      for (const uid of customOrder) {
        const pilot = pilotMap.get(uid);
        if (pilot) {
          customSorted.push(pilot);
          pilotMap.delete(uid); // Remove from map
        }
      }

      // Then append any pilots not in the custom order (sorted by default)
      const remaining = Array.from(pilotMap.values());
      remaining.sort((a, b) => {
        const aPriority = a.priority ?? 999999;
        const bPriority = b.priority ?? 999999;
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        return a.displayName.localeCompare(b.displayName);
      });

      sortedPilots = [...customSorted, ...remaining];
    } else {
      // Split pilots into on-time (signed in >= 2 days before) and late sign-ups
      const onTimePilots: Pilot[] = [];
      const latePilots: Pilot[] = [];

      sortedPilots.forEach(pilot => {
        if (isOnTimeSignIn(pilot.uid)) {
          onTimePilots.push(pilot);
        } else {
          latePilots.push(pilot);
        }
      });

      // Sort on-time pilots by priority (lower number = higher priority = leftmost)
      onTimePilots.sort((a, b) => {
        const aPriority = a.priority ?? 999999;
        const bPriority = b.priority ?? 999999;

        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }

        return a.displayName.localeCompare(b.displayName);
      });

      // Sort late pilots by their sign-in time (earliest sign-in first)
      latePilots.sort((a, b) => {
        const aSignIn = pilotSignInTimes.get(a.uid) || '';
        const bSignIn = pilotSignInTimes.get(b.uid) || '';

        // Earlier sign-in comes first
        if (aSignIn !== bSignIn) {
          return aSignIn.localeCompare(bSignIn);
        }

        // If same sign-in time, fall back to priority
        const aPriority = a.priority ?? 999999;
        const bPriority = b.priority ?? 999999;
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }

        return a.displayName.localeCompare(b.displayName);
      });

      // On-time pilots first, then late pilots
      sortedPilots = [...onTimePilots, ...latePilots];

      if (latePilots.length > 0) {
        console.log(`Late sign-ups (moved to end): ${latePilots.map(p => p.displayName).join(', ')}`);
      }
    }

    // Differential update: reuse previous array if order hasn't changed
    const prevPilots = prevPilotsRef.current;
    if (prevPilots.length === sortedPilots.length) {
      let orderChanged = false;
      for (let i = 0; i < sortedPilots.length; i++) {
        if (sortedPilots[i].uid !== prevPilots[i]?.uid) {
          orderChanged = true;
          break;
        }
      }

      if (!orderChanged) {
        console.log("Pilot sort order unchanged - reusing previous array");
        return prevPilots;
      }
    }

    console.log("Pilot sort order changed - returning new array");
    prevPilotsRef.current = sortedPilots;
    return sortedPilots;
  }, [rawPilots, customOrder, pilotSignInTimes, selectedDate]);

  const isPilotAvailableForTimeSlot = (pilotUid: string, timeSlot: string): boolean => {
    const slots = pilotAvailability.get(pilotUid);
    return slots ? slots.has(timeSlot) : false;
  };

  const getPilotAvailabilityStatus = (pilotUid: string, timeSlot: string): AvailabilityStatus => {
    const statusForPilot = pilotAvailabilityStatus.get(pilotUid);
    if (!statusForPilot) return "unavailable";
    return statusForPilot.get(timeSlot) || "unavailable";
  };

  const getPilotSignInTimeForTimeSlot = (pilotUid: string, timeSlot: string): string | null => {
    const signInTimesForPilot = pilotSignInTimesBySlot.get(pilotUid);
    if (!signInTimesForPilot) return null;
    return signInTimesForPilot.get(timeSlot) || null;
  };

  const getPilotSignOutTimeForTimeSlot = (pilotUid: string, timeSlot: string): string | null => {
    const signOutTimesForPilot = pilotSignOutTimesBySlot.get(pilotUid);
    if (!signOutTimesForPilot) return null;
    return signOutTimesForPilot.get(timeSlot) || null;
  };

  const availabilityTimelineEvents = useMemo(() => {
    const timestamps = new Map<number, Date>();

    availabilityRecords?.forEach((record) => {
      [record.signedInAt, record.signedOutAt].forEach((timestamp) => {
        const date = parseAvailabilityTimestamp(timestamp);
        if (date === null) return;
        timestamps.set(date, new Date(date));
      });
    });

    return Array.from(timestamps.values()).sort((a, b) => a.getTime() - b.getTime());
  }, [availabilityRecords]);

  const saveCustomPilotOrder = async (newOrder: string[]) => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    try {
      const orderDocRef = doc(db, "pilotOrders", dateStr);
      await setDoc(orderDocRef, {
        date: dateStr,
        order: newOrder,
        updatedAt: new Date().toISOString(),
      });
      setCustomOrder(newOrder);
      console.log("Custom pilot order saved for", dateStr);
    } catch (err) {
      console.error("Error saving custom pilot order:", err);
      throw err;
    }
  };

  return { pilots, loading, error, isPilotAvailableForTimeSlot, getPilotAvailabilityStatus, getPilotSignInTimeForTimeSlot, getPilotSignOutTimeForTimeSlot, availabilityTimelineEvents, saveCustomPilotOrder };
}

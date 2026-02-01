import { useState, useEffect, useRef, useMemo } from "react";
import { collection, query, where, getDocs, onSnapshot, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { format, differenceInDays, parseISO, startOfDay } from "date-fns";
import type { Pilot, AvailabilityStatus } from "../types/index";

export interface PilotAvailability {
  pilot: Pilot;
  availableTimeSlots: Set<string>;
}

// Map from pilotUid to Map<timeSlot, status>
export type PilotAvailabilityStatusMap = Map<string, Map<string, AvailabilityStatus>>;

const PILOTS_CACHE_PREFIX = 'twin_pilots_cache_';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export function usePilots(selectedDate: Date) {
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const cacheKey = `${PILOTS_CACHE_PREFIX}${dateStr}`;

  const [rawPilots, setRawPilots] = useState<Pilot[]>(() => {
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
  const [customOrder, setCustomOrder] = useState<string[] | null>(() => {
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
  const prevPilotsRef = useRef<Pilot[]>([]);
  const prevDateStrRef = useRef(dateStr);

  // Synchronize state immediately when date changes to prevent showing stale data
  useEffect(() => {
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
        const { data, timestamp, availability, availabilityStatus, signInTimes, customPilotOrder } = JSON.parse(cached);
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
    setCustomOrder(null);
  }, [dateStr, cacheKey]);

  useEffect(() => {
    const pilotsStartTime = performance.now();
    console.log(`📡 Starting pilots subscription for ${dateStr}...`);

    // Check if we have valid cache for this date
    let hasValidCache = false;
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

    // Only set loading to true if we don't have valid cache
    if (!hasValidCache) {
      setLoading(true);
    }
    setError(null);

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
      async (availabilitySnapshot) => {
        try {
          // Get unique pilot IDs and their available time slots
          const pilotIds = new Set<string>();
          const availabilityMap = new Map<string, Set<string>>();
          const statusMap: PilotAvailabilityStatusMap = new Map();
          const signInTimesMap = new Map<string, string>(); // Track earliest sign-in time per pilot

          availabilitySnapshot.docs.forEach((doc) => {
            const data = doc.data();
            pilotIds.add(data.userId);

            if (!availabilityMap.has(data.userId)) {
              availabilityMap.set(data.userId, new Set());
            }
            availabilityMap.get(data.userId)!.add(data.timeSlot);

            // Track status for each timeslot (default to "available" for backwards compatibility)
            if (!statusMap.has(data.userId)) {
              statusMap.set(data.userId, new Map());
            }
            const status: AvailabilityStatus = data.status === "onRequest" ? "onRequest" : "available";
            statusMap.get(data.userId)!.set(data.timeSlot, status);

            // Track the earliest sign-in time for this pilot
            if (data.signedInAt) {
              const existingTime = signInTimesMap.get(data.userId);
              if (!existingTime || data.signedInAt < existingTime) {
                signInTimesMap.set(data.userId, data.signedInAt);
              }
            }
          });

          // If no pilots are available, return empty array
          if (pilotIds.size === 0) {
            setRawPilots([]);
            setPilotAvailability(new Map());
            setPilotAvailabilityStatus(new Map());
            setPilotSignInTimes(new Map());
            // Clear cache for this date since no pilots are available
            try {
              localStorage.removeItem(cacheKey);
            } catch (error) {
              console.error('Error clearing pilots cache:', error);
            }
            setLoading(false);
            return;
          }

          // Fetch pilot details from userProfiles
          const pilotPromises = Array.from(pilotIds).map(async (uid) => {
            const profileQuery = query(
              collection(db, "userProfiles"),
              where("uid", "==", uid)
            );
            const profileSnapshot = await getDocs(profileQuery);

            if (profileSnapshot.empty) {
              // Fallback: if no profile exists, return basic info
              return {
                uid,
                displayName: "Unknown Pilot",
                femalePilot: false,
              };
            }

            const profileData = profileSnapshot.docs[0].data();
            return {
              uid: profileData.uid,
              displayName: profileData.displayName || "Unknown Pilot",
              email: profileData.email || "",
              femalePilot: profileData.femalePilot || false,
              priority: profileData.priority || undefined,
            };
          });

          const pilotsData = await Promise.all(pilotPromises);

          // Differential update: only update if pilots actually changed
          setRawPilots(prevPilots => {
            // If this is the first load, just set all pilots
            if (prevPilots.length === 0) {
              console.log("First pilot load - setting all pilots");
              // Note: Cache is updated after availability data is set (see below)
              // so we skip caching here to avoid partial data
              return pilotsData;
            }

            // Create a map of previous pilots by UID for quick lookup
            const prevPilotsMap = new Map(prevPilots.map(p => [p.uid, p]));

            // Check if anything actually changed
            let hasChanges = false;

            // Check for added or modified pilots
            for (const newPilot of pilotsData) {
              const prevPilot = prevPilotsMap.get(newPilot.uid);
              if (!prevPilot || JSON.stringify(prevPilot) !== JSON.stringify(newPilot)) {
                hasChanges = true;
                break;
              }
            }

            // Check for deleted pilots
            if (!hasChanges && prevPilots.length !== pilotsData.length) {
              hasChanges = true;
            }

            // If nothing changed, return the same reference to prevent re-renders
            if (!hasChanges) {
              console.log("No pilot data changes detected - skipping update");
              return prevPilots;
            }

            console.log("Pilot data changes detected - updating");

            // Build new array, reusing unchanged pilot objects
            const updatedPilots = pilotsData.map(newPilot => {
              const prevPilot = prevPilotsMap.get(newPilot.uid);
              // If pilot exists and hasn't changed, reuse the old reference
              if (prevPilot && JSON.stringify(prevPilot) === JSON.stringify(newPilot)) {
                return prevPilot;
              }
              return newPilot;
            });

            // Note: Cache is updated after availability data is set (see below)
            // so we skip caching here to avoid partial data

            return updatedPilots;
          });

          setPilotAvailability(availabilityMap);
          setPilotAvailabilityStatus(statusMap);
          setPilotSignInTimes(signInTimesMap);

          // Update cache with complete data including availability
          try {
            // Convert Maps and Sets to serializable format
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

            const signInTimesObj = Object.fromEntries(signInTimesMap);

            localStorage.setItem(cacheKey, JSON.stringify({
              data: pilotsData,
              availability: availabilityObj,
              availabilityStatus: statusObj,
              signInTimes: signInTimesObj,
              customPilotOrder: customOrder,
              timestamp: Date.now(),
            }));
          } catch (error) {
            console.error('Error caching pilots data:', error);
          }

          setLoading(false);

          const pilotsTime = performance.now() - pilotsStartTime;
          console.log(`⏱️ Pilots loaded in ${pilotsTime.toFixed(0)}ms (${pilotsData.length} pilots)`);
        } catch (err: any) {
          console.error("Error processing pilots:", err);
          setError(err.message);
          setLoading(false);
        }
      },
      (err) => {
        console.error("Error fetching pilots:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    // Cleanup subscription on unmount or date change
    return () => unsubscribe();
  }, [selectedDate]);

  // Helper function to check if a pilot signed in on time (>= 2 days before the target date)
  const isOnTimeSignIn = (pilotUid: string): boolean => {
    const signedInAt = pilotSignInTimes.get(pilotUid);

    // If no signedInAt timestamp, treat as on-time (backwards compatibility for old records)
    if (!signedInAt) return true;

    const signInDate = parseISO(signedInAt);
    const targetDate = startOfDay(selectedDate);
    const signInDay = startOfDay(signInDate);

    // Calculate days between sign-in and target date
    const daysInAdvance = differenceInDays(targetDate, signInDay);

    // On-time if signed in >= 2 days before
    return daysInAdvance >= 2;
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

  return { pilots, loading, error, isPilotAvailableForTimeSlot, getPilotAvailabilityStatus, saveCustomPilotOrder };
}

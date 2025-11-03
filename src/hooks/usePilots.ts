import { useState, useEffect, useRef, useMemo } from "react";
import { collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import { format } from "date-fns";
import type { Pilot } from "../types/index";

export interface PilotAvailability {
  pilot: Pilot;
  availableTimeSlots: Set<string>;
}

export function usePilots(selectedDate: Date, bookings: any[] = []) {
  const [rawPilots, setRawPilots] = useState<Pilot[]>([]);
  const [pilotAvailability, setPilotAvailability] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevPilotsRef = useRef<Pilot[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const dateStr = format(selectedDate, "yyyy-MM-dd");

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

          availabilitySnapshot.docs.forEach((doc) => {
            const data = doc.data();
            pilotIds.add(data.userId);

            if (!availabilityMap.has(data.userId)) {
              availabilityMap.set(data.userId, new Set());
            }
            availabilityMap.get(data.userId)!.add(data.timeSlot);
          });

          // If no pilots are available, return empty array
          if (pilotIds.size === 0) {
            setRawPilots([]);
            setPilotAvailability(new Map());
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
              femalePilot: profileData.femalePilot || false,
            };
          });

          const pilotsData = await Promise.all(pilotPromises);

          // Differential update: only update if pilots actually changed
          setRawPilots(prevPilots => {
            // If this is the first load, just set all pilots
            if (prevPilots.length === 0) {
              console.log("First pilot load - setting all pilots");
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
            return pilotsData.map(newPilot => {
              const prevPilot = prevPilotsMap.get(newPilot.uid);
              // If pilot exists and hasn't changed, reuse the old reference
              if (prevPilot && JSON.stringify(prevPilot) === JSON.stringify(newPilot)) {
                return prevPilot;
              }
              return newPilot;
            });
          });

          setPilotAvailability(availabilityMap);
          setLoading(false);
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

  // Memoized sorted pilots - recalculates only when rawPilots or bookings change
  const pilots = useMemo(() => {
    console.log("Recalculating pilot sort order");

    // Count how many bookings each pilot has for this date
    const bookingCounts = new Map<string, number>();
    rawPilots.forEach(pilot => {
      const count = bookings.filter(booking =>
        booking.assignedPilots?.includes(pilot.displayName)
      ).length;
      bookingCounts.set(pilot.displayName, count);
    });

    // Create a copy for sorting (don't mutate rawPilots)
    const sortedPilots = [...rawPilots];

    // Sort pilots by:
    // 1. Number of bookings (descending - most bookings first)
    // 2. Availability count (descending - most available first)
    // 3. Alphabetically
    sortedPilots.sort((a, b) => {
      const aBookings = bookingCounts.get(a.displayName) || 0;
      const bBookings = bookingCounts.get(b.displayName) || 0;
      const aAvailability = pilotAvailability.get(a.uid)?.size || 0;
      const bAvailability = pilotAvailability.get(b.uid)?.size || 0;

      // First, sort by booking count (most bookings first on left)
      if (bBookings !== aBookings) {
        return bBookings - aBookings;
      }

      // Second, sort by availability count (most available first)
      if (bAvailability !== aAvailability) {
        return bAvailability - aAvailability;
      }

      // Finally, sort alphabetically
      return a.displayName.localeCompare(b.displayName);
    });

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
  }, [rawPilots, bookings, pilotAvailability]);

  const isPilotAvailableForTimeSlot = (pilotUid: string, timeSlot: string): boolean => {
    const slots = pilotAvailability.get(pilotUid);
    return slots ? slots.has(timeSlot) : false;
  };

  return { pilots, loading, error, isPilotAvailableForTimeSlot };
}

import { useState, useEffect } from "react";
import { collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import { format } from "date-fns";
import type { Pilot } from "../types/index";

export interface PilotAvailability {
  pilot: Pilot;
  availableTimeSlots: Set<string>;
}

export function usePilots(selectedDate: Date, bookings: any[] = []) {
  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [pilotAvailability, setPilotAvailability] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            setPilots([]);
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

          // Count how many bookings each pilot has for this date
          const bookingCounts = new Map<string, number>();
          pilotsData.forEach(pilot => {
            const count = bookings.filter(booking =>
              booking.assignedPilots?.includes(pilot.displayName)
            ).length;
            bookingCounts.set(pilot.displayName, count);
          });

          // Sort pilots by:
          // 1. Number of bookings (descending - most bookings first)
          // 2. Availability count (descending - most available first)
          // 3. Alphabetically
          pilotsData.sort((a, b) => {
            const aBookings = bookingCounts.get(a.displayName) || 0;
            const bBookings = bookingCounts.get(b.displayName) || 0;
            const aAvailability = availabilityMap.get(a.uid)?.size || 0;
            const bAvailability = availabilityMap.get(b.uid)?.size || 0;

            console.log(`Comparing ${a.displayName} (${aBookings} bookings, ${aAvailability} avail) vs ${b.displayName} (${bBookings} bookings, ${bAvailability} avail)`);

            // First, sort by booking count (most bookings first on left)
            if (bBookings !== aBookings) {
              console.log(`  → Sorted by bookings: ${bBookings > aBookings ? b.displayName : a.displayName} comes first`);
              return bBookings - aBookings;
            }

            // Second, sort by availability count (most available first)
            if (bAvailability !== aAvailability) {
              console.log(`  → Sorted by availability: ${bAvailability > aAvailability ? b.displayName : a.displayName} comes first`);
              return bAvailability - aAvailability;
            }

            // Finally, sort alphabetically
            console.log(`  → Same bookings and availability, sorting alphabetically`);
            return a.displayName.localeCompare(b.displayName);
          });

          console.log("Final sorted pilots:", pilotsData.map(p =>
            `${p.displayName} (${bookingCounts.get(p.displayName) || 0} bookings, ${availabilityMap.get(p.uid)?.size || 0} avail)`
          ));

          setPilots(pilotsData);
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
  }, [selectedDate, bookings]);

  const isPilotAvailableForTimeSlot = (pilotUid: string, timeSlot: string): boolean => {
    const slots = pilotAvailability.get(pilotUid);
    return slots ? slots.has(timeSlot) : false;
  };

  return { pilots, loading, error, isPilotAvailableForTimeSlot };
}

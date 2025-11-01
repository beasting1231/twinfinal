import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";
import { format } from "date-fns";
import type { Pilot } from "../types/index";

export interface PilotAvailability {
  pilot: Pilot;
  availableTimeSlots: Set<string>;
}

export function usePilots(selectedDate: Date) {
  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [pilotAvailability, setPilotAvailability] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAvailablePilots() {
      try {
        setLoading(true);
        setError(null);

        const dateStr = format(selectedDate, "yyyy-MM-dd");

        // Query availability collection for the selected date
        const availabilityQuery = query(
          collection(db, "availability"),
          where("date", "==", dateStr)
        );

        const availabilitySnapshot = await getDocs(availabilityQuery);

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

        // Sort pilots alphabetically by displayName
        pilotsData.sort((a, b) => a.displayName.localeCompare(b.displayName));

        setPilots(pilotsData);
        setPilotAvailability(availabilityMap);
        setLoading(false);
      } catch (err: any) {
        console.error("Error fetching pilots:", err);
        setError(err.message);
        setLoading(false);
      }
    }

    fetchAvailablePilots();
  }, [selectedDate]);

  const isPilotAvailableForTimeSlot = (pilotUid: string, timeSlot: string): boolean => {
    const slots = pilotAvailability.get(pilotUid);
    return slots ? slots.has(timeSlot) : false;
  };

  return { pilots, loading, error, isPilotAvailableForTimeSlot };
}

import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import type { Pilot } from "../types/index";

// Hook to get ALL pilots from userProfiles (regardless of availability)
export function useAllPilots() {
  const [allPilots, setAllPilots] = useState<Pilot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to all userProfiles
    const unsubscribe = onSnapshot(
      collection(db, "userProfiles"),
      (snapshot) => {
        const pilotsData = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            return {
              uid: data.uid,
              displayName: data.displayName || "Unknown Pilot",
              email: data.email || "",
              femalePilot: data.femalePilot || false,
              priority: data.priority || undefined,
            };
          })
          .sort((a, b) => {
            // Sort by display name
            return a.displayName.localeCompare(b.displayName);
          });

        setAllPilots(pilotsData);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching all pilots:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { allPilots, loading };
}

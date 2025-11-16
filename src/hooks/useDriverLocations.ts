import { useState, useEffect } from "react";
import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import type { DriverLocation } from "../types";

/**
 * Hook for admins to view all driver locations in real-time
 */
export function useDriverLocations() {
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("Setting up driver locations listener...");

    const unsubscribe = onSnapshot(
      collection(db, "driverLocations"),
      (snapshot) => {
        console.log("Driver locations update received:", snapshot.size, "documents");
        const locations: DriverLocation[] = [];

        snapshot.docs.forEach((doc) => {
          const data = doc.data();

          // Convert Firestore Timestamp to Date
          const timestamp = data.timestamp instanceof Timestamp
            ? data.timestamp.toDate()
            : new Date(data.timestamp);

          // Only include locations that are less than 2 minutes old
          const isRecent = Date.now() - timestamp.getTime() < 2 * 60 * 1000;

          console.log(`Driver ${data.displayName}: recent=${isRecent}, age=${Math.floor((Date.now() - timestamp.getTime()) / 1000)}s`);

          if (isRecent) {
            locations.push({
              id: doc.id,
              displayName: data.displayName || "Unknown Driver",
              latitude: data.latitude,
              longitude: data.longitude,
              timestamp,
              accuracy: data.accuracy,
            });
          }
        });

        console.log("Updating state with", locations.length, "active drivers");
        setDriverLocations(locations);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Error fetching driver locations:", err);
        setError("Failed to load driver locations");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { driverLocations, loading, error };
}

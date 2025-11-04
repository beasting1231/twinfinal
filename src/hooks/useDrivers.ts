import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";

export interface DriverData {
  name: string;
  count: number;
}

export function useDrivers() {
  const [drivers, setDrivers] = useState<DriverData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Count occurrences from both bookings and driverAssignments
    const driverCounts = new Map<string, number>();
    let bookingsLoaded = false;
    let assignmentsLoaded = false;

    const updateDrivers = () => {
      if (!bookingsLoaded || !assignmentsLoaded) return;

      // Convert to array and sort by count (descending)
      const sortedDrivers = Array.from(driverCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      setDrivers(sortedDrivers);
      setLoading(false);
    };

    // Subscribe to bookings
    const unsubscribeBookings = onSnapshot(
      collection(db, "bookings"),
      (snapshot) => {
        snapshot.docs.forEach((doc) => {
          const data = doc.data();

          if (data.driver) {
            driverCounts.set(data.driver, (driverCounts.get(data.driver) || 0) + 1);
          }
          if (data.driver2) {
            driverCounts.set(data.driver2, (driverCounts.get(data.driver2) || 0) + 1);
          }
        });

        bookingsLoaded = true;
        updateDrivers();
      },
      (error) => {
        console.error("Error fetching drivers from bookings:", error);
        bookingsLoaded = true;
        updateDrivers();
      }
    );

    // Subscribe to driverAssignments
    const unsubscribeAssignments = onSnapshot(
      collection(db, "driverAssignments"),
      (snapshot) => {
        snapshot.docs.forEach((doc) => {
          const data = doc.data();

          if (data.driver) {
            driverCounts.set(data.driver, (driverCounts.get(data.driver) || 0) + 1);
          }
          if (data.driver2) {
            driverCounts.set(data.driver2, (driverCounts.get(data.driver2) || 0) + 1);
          }
        });

        assignmentsLoaded = true;
        updateDrivers();
      },
      (error) => {
        console.error("Error fetching drivers from assignments:", error);
        assignmentsLoaded = true;
        updateDrivers();
      }
    );

    return () => {
      unsubscribeBookings();
      unsubscribeAssignments();
    };
  }, []);

  return { drivers, loading };
}

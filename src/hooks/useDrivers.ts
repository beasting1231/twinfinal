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
    const unsubscribe = onSnapshot(
      collection(db, "bookings"),
      (snapshot) => {
        // Count occurrences of each driver
        const driverCounts = new Map<string, number>();

        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const driver = data.driver;

          if (driver) {
            driverCounts.set(driver, (driverCounts.get(driver) || 0) + 1);
          }
        });

        // Convert to array and sort by count (descending)
        const sortedDrivers = Array.from(driverCounts.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);

        setDrivers(sortedDrivers);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching drivers:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { drivers, loading };
}

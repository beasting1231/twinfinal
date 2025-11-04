import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";

export interface VehicleData {
  name: string;
  count: number;
}

export function useVehicles() {
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "bookings"),
      (snapshot) => {
        // Count occurrences of each vehicle
        const vehicleCounts = new Map<string, number>();

        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const vehicle = data.vehicle;

          if (vehicle) {
            vehicleCounts.set(vehicle, (vehicleCounts.get(vehicle) || 0) + 1);
          }
        });

        // Convert to array and sort by count (descending)
        const sortedVehicles = Array.from(vehicleCounts.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);

        setVehicles(sortedVehicles);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching vehicles:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { vehicles, loading };
}

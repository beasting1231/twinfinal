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
    // Count occurrences from both bookings and driverAssignments
    const vehicleCounts = new Map<string, number>();
    let bookingsLoaded = false;
    let assignmentsLoaded = false;

    const updateVehicles = () => {
      if (!bookingsLoaded || !assignmentsLoaded) return;

      // Convert to array and sort by count (descending)
      const sortedVehicles = Array.from(vehicleCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      setVehicles(sortedVehicles);
      setLoading(false);
    };

    // Subscribe to bookings
    const unsubscribeBookings = onSnapshot(
      collection(db, "bookings"),
      (snapshot) => {
        snapshot.docs.forEach((doc) => {
          const data = doc.data();

          if (data.vehicle) {
            vehicleCounts.set(data.vehicle, (vehicleCounts.get(data.vehicle) || 0) + 1);
          }
          if (data.vehicle2) {
            vehicleCounts.set(data.vehicle2, (vehicleCounts.get(data.vehicle2) || 0) + 1);
          }
        });

        bookingsLoaded = true;
        updateVehicles();
      },
      (error) => {
        console.error("Error fetching vehicles from bookings:", error);
        bookingsLoaded = true;
        updateVehicles();
      }
    );

    // Subscribe to driverAssignments
    const unsubscribeAssignments = onSnapshot(
      collection(db, "driverAssignments"),
      (snapshot) => {
        snapshot.docs.forEach((doc) => {
          const data = doc.data();

          if (data.vehicle) {
            vehicleCounts.set(data.vehicle, (vehicleCounts.get(data.vehicle) || 0) + 1);
          }
          if (data.vehicle2) {
            vehicleCounts.set(data.vehicle2, (vehicleCounts.get(data.vehicle2) || 0) + 1);
          }
        });

        assignmentsLoaded = true;
        updateVehicles();
      },
      (error) => {
        console.error("Error fetching vehicles from assignments:", error);
        assignmentsLoaded = true;
        updateVehicles();
      }
    );

    return () => {
      unsubscribeBookings();
      unsubscribeAssignments();
    };
  }, []);

  return { vehicles, loading };
}

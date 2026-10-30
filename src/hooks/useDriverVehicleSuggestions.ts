import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";
import { createSuggestionList, namesByUse } from "../utils/suggestionList";

// Driver and vehicle names for the driver popup, in display order.
const driverVehicleList = createSuggestionList({
  path: ["driverVehicleSuggestions", "list"],
  fields: ["drivers", "vehicles"] as const,
  async buildFromHistory() {
    const [bookings, assignments] = await Promise.all([
      getDocs(collection(db, "bookings")),
      getDocs(collection(db, "driverAssignments")),
    ]);
    const rows = [...bookings.docs, ...assignments.docs].map((entry) => entry.data());
    return {
      drivers: namesByUse(rows.flatMap((row) => [row.driver, row.driver2])),
      vehicles: namesByUse(rows.flatMap((row) => [row.vehicle, row.vehicle2])),
    };
  },
});

export const useDriverVehicleSuggestions = driverVehicleList.useList;
export const recordDriverVehicleUse = (names: { driver?: string | null; vehicle?: string | null }) =>
  driverVehicleList.record({ drivers: names.driver, vehicles: names.vehicle });

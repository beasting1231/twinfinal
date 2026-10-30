import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";
import { createSuggestionList, namesByUse } from "../utils/suggestionList";

// Booking source names for the booking source box, in display order.
const bookingSourceList = createSuggestionList({
  path: ["bookingSourceSuggestions", "list"],
  fields: ["sources"] as const,
  async buildFromHistory() {
    const bookings = await getDocs(collection(db, "bookings"));
    return { sources: namesByUse(bookings.docs.map((entry) => entry.data().bookingSource)) };
  },
});

export function useBookingSources(enabled = true) {
  const { sources, loading } = bookingSourceList.useList(enabled);
  return { bookingSources: sources, loading };
}

export const recordBookingSource = (source?: string | null) => bookingSourceList.record({ sources: source });

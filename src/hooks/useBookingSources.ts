import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";

export interface BookingSourceData {
  name: string;
  count: number;
}

export function useBookingSources() {
  const [bookingSources, setBookingSources] = useState<BookingSourceData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "bookings"),
      (snapshot) => {
        // Count occurrences of each booking source
        const sourceCounts = new Map<string, number>();

        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const source = data.bookingSource;

          if (source) {
            sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
          }
        });

        // Convert to array and sort by count (descending)
        const sortedSources = Array.from(sourceCounts.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);

        setBookingSources(sortedSources);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching booking sources:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { bookingSources, loading };
}

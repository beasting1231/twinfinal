import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import type { BookingRequest } from "../types/index";

export function useBookingRequests() {
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to pending booking requests
    const q = query(
      collection(db, "bookingRequests"),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const requests = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
          } as BookingRequest;
        });

        // Sort by creation date (newest first) in JavaScript
        requests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        setBookingRequests(requests);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching booking requests:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { bookingRequests, loading };
}

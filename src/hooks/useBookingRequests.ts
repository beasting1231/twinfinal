import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import type { BookingRequest } from "../types/index";

export function useBookingRequests() {
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to pending, waitlist, and deleted booking requests
    const q = query(
      collection(db, "bookingRequests"),
      where("status", "in", ["pending", "waitlist", "deleted"])
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

  const updateBookingRequest = async (id: string, updates: Partial<BookingRequest>) => {
    try {
      const requestRef = doc(db, "bookingRequests", id);
      await updateDoc(requestRef, updates);
    } catch (error) {
      console.error("Error updating booking request:", error);
      throw error;
    }
  };

  const deleteBookingRequest = async (id: string) => {
    try {
      const requestRef = doc(db, "bookingRequests", id);
      await updateDoc(requestRef, { status: "deleted" });
    } catch (error) {
      console.error("Error deleting booking request:", error);
      throw error;
    }
  };

  return { bookingRequests, loading, updateBookingRequest, deleteBookingRequest };
}

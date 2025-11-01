import { useState, useEffect } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config";
import type { Booking, UnavailablePilot } from "../types/index";

export function useBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [unavailablePilots, setUnavailablePilots] = useState<UnavailablePilot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to bookings collection
    const unsubscribeBookings = onSnapshot(
      collection(db, "bookings"),
      (snapshot) => {
        const bookingsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Booking[];
        setBookings(bookingsData);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching bookings:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    // Subscribe to unavailable pilots collection
    const unsubscribeUnavailable = onSnapshot(
      collection(db, "unavailablePilots"),
      (snapshot) => {
        const unavailableData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as UnavailablePilot[];
        setUnavailablePilots(unavailableData);
      },
      (err) => {
        console.error("Error fetching unavailable pilots:", err);
        setError(err.message);
      }
    );

    // Cleanup subscriptions on unmount
    return () => {
      unsubscribeBookings();
      unsubscribeUnavailable();
    };
  }, []);

  // Add a new booking
  const addBooking = async (booking: Omit<Booking, "id">) => {
    try {
      await addDoc(collection(db, "bookings"), booking);
    } catch (err: any) {
      console.error("Error adding booking:", err);
      setError(err.message);
    }
  };

  // Update an existing booking
  const updateBooking = async (id: string, booking: Partial<Booking>) => {
    try {
      await updateDoc(doc(db, "bookings", id), booking);
    } catch (err: any) {
      console.error("Error updating booking:", err);
      setError(err.message);
    }
  };

  // Delete a booking
  const deleteBooking = async (id: string) => {
    try {
      await deleteDoc(doc(db, "bookings", id));
    } catch (err: any) {
      console.error("Error deleting booking:", err);
      setError(err.message);
    }
  };

  // Add an unavailable pilot slot
  const addUnavailablePilot = async (unavailable: Omit<UnavailablePilot, "id">) => {
    try {
      await addDoc(collection(db, "unavailablePilots"), unavailable);
    } catch (err: any) {
      console.error("Error adding unavailable pilot:", err);
      setError(err.message);
    }
  };

  // Remove an unavailable pilot slot
  const removeUnavailablePilot = async (id: string) => {
    try {
      await deleteDoc(doc(db, "unavailablePilots", id));
    } catch (err: any) {
      console.error("Error removing unavailable pilot:", err);
      setError(err.message);
    }
  };

  return {
    bookings,
    unavailablePilots,
    loading,
    error,
    addBooking,
    updateBooking,
    deleteBooking,
    addUnavailablePilot,
    removeUnavailablePilot,
  };
}

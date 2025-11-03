import { useState, useEffect, useRef } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config";
import type { Booking } from "../types/index";
import { useEditing } from "../contexts/EditingContext";

export function useBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isEditing, incrementPendingUpdates } = useEditing();
  const pendingUpdateRef = useRef<Booking[] | null>(null);

  useEffect(() => {
    // Subscribe to bookings collection
    const unsubscribeBookings = onSnapshot(
      collection(db, "bookings"),
      (snapshot) => {
        const bookingsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Booking[];

        // If user is editing, queue the update instead of applying it
        if (isEditing) {
          console.log("Update queued - user is editing");
          pendingUpdateRef.current = bookingsData;
          incrementPendingUpdates();
        } else {
          setBookings(bookingsData);
          pendingUpdateRef.current = null;
        }

        setLoading(false);
      },
      (err) => {
        console.error("Error fetching bookings:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    // Cleanup subscriptions on unmount
    return () => {
      unsubscribeBookings();
    };
  }, [isEditing, incrementPendingUpdates]);

  // Apply pending updates when editing stops
  useEffect(() => {
    if (!isEditing && pendingUpdateRef.current) {
      console.log("Applying queued updates");
      setBookings(pendingUpdateRef.current);
      pendingUpdateRef.current = null;
    }
  }, [isEditing]);

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
      // Filter out undefined values from the update object (Firebase doesn't accept undefined)
      const sanitizedBooking: any = {};
      for (const [key, value] of Object.entries(booking)) {
        if (value !== undefined) {
          // Special handling for assignedPilots array to ensure no undefined values
          if (key === 'assignedPilots' && Array.isArray(value)) {
            sanitizedBooking[key] = value.map(pilot => pilot === undefined ? "" : pilot);
          } else {
            sanitizedBooking[key] = value;
          }
        }
      }
      await updateDoc(doc(db, "bookings", id), sanitizedBooking);
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

  return {
    bookings,
    loading,
    error,
    addBooking,
    updateBooking,
    deleteBooking,
  };
}

import { useState, useEffect, useRef } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, deleteField } from "firebase/firestore";
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
          // Differential update: only update bookings that actually changed
          setBookings(prevBookings => {
            // If this is the first load, just set all bookings
            if (prevBookings.length === 0) {
              return bookingsData;
            }

            // Create a map of previous bookings by ID for quick lookup
            const prevBookingsMap = new Map(prevBookings.map(b => [b.id, b]));

            // Check if anything actually changed
            let hasChanges = false;

            // Check for added or modified bookings
            for (const newBooking of bookingsData) {
              const prevBooking = prevBookingsMap.get(newBooking.id!);
              if (!prevBooking || JSON.stringify(prevBooking) !== JSON.stringify(newBooking)) {
                hasChanges = true;
                break;
              }
            }

            // Check for deleted bookings
            if (!hasChanges && prevBookings.length !== bookingsData.length) {
              hasChanges = true;
            }

            // If nothing changed, return the same reference to prevent re-renders
            if (!hasChanges) {
              console.log("No booking changes detected - skipping update");
              return prevBookings;
            }

            console.log("Booking changes detected - updating");

            // Build new array, reusing unchanged booking objects
            return bookingsData.map(newBooking => {
              const prevBooking = prevBookingsMap.get(newBooking.id!);
              // If booking exists and hasn't changed, reuse the old reference
              if (prevBooking && JSON.stringify(prevBooking) === JSON.stringify(newBooking)) {
                return prevBooking;
              }
              return newBooking;
            });
          });
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
          }
          // Convert empty strings to deleteField() to remove the field from Firestore
          else if (value === "") {
            sanitizedBooking[key] = deleteField();
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

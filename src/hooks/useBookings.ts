import { useState, useEffect, useRef } from "react";
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteField, serverTimestamp, arrayUnion } from "firebase/firestore";
import { db } from "../firebase/config";
import type { Booking, BookingHistoryEntry } from "../types/index";
import { useEditing } from "../contexts/EditingContext";
import { useAuth } from "../contexts/AuthContext";
import { getTimeSlotsByDate } from "../utils/timeSlots";

export function useBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isEditing, incrementPendingUpdates } = useEditing();
  const { currentUser } = useAuth();
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
      // Build details for the created history entry
      let createdDetails: string | undefined;
      if (booking.date) {
        const date = new Date(booking.date + 'T00:00:00');
        const timeSlots = getTimeSlotsByDate(date);
        const timeString = timeSlots[booking.timeIndex] || '';
        createdDetails = `for ${booking.date}${timeString ? ` at ${timeString}` : ''}`;
      }

      // Create history entry for booking creation (use regular Date since serverTimestamp() can't be used in arrays)
      const historyEntry: BookingHistoryEntry = {
        action: "created",
        timestamp: new Date(),
        userId: currentUser?.uid || "",
        userName: currentUser?.displayName || currentUser?.email || "Unknown",
        details: createdDetails,
      };

      // Add createdBy field with current user's UID and createdAt timestamp
      const bookingWithCreator = {
        ...booking,
        createdBy: currentUser?.uid || "",
        createdByName: currentUser?.displayName || currentUser?.email || "",
        createdAt: serverTimestamp(),
        history: [historyEntry],
      };
      await addDoc(collection(db, "bookings"), bookingWithCreator);
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

      // Check if this is a move operation (timeIndex or date changed)
      const isMove = booking.hasOwnProperty('timeIndex') || booking.hasOwnProperty('date');

      // Check if this is a status change
      const isStatusChange = booking.hasOwnProperty('bookingStatus');

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

      // If booking was moved, update createdAt to current time (makes it the "newest" booking)
      if (isMove) {
        sanitizedBooking.createdAt = serverTimestamp();
      }

      // Check if this is a restore operation (status changing FROM deleted to something else)
      // We need to check if the current booking status is "deleted" and we're changing it
      const isRestore = isStatusChange && booking.bookingStatus !== 'deleted';

      // Build history entry details with actual values
      let historyAction: "edited" | "moved" | "status_changed" | "restored" = "edited";
      let historyDetails: string | undefined;

      // Helper to format field changes with values
      const formatFieldChange = (key: string, value: any): string => {
        switch (key) {
          case 'numberOfPeople':
            return `${value} people`;
          case 'assignedPilots':
            if (Array.isArray(value)) {
              const pilots = value.filter((p: string) => p && p !== "");
              if (pilots.length === 0) return 'pilots cleared';
              return `pilots: ${pilots.join(', ')}`;
            }
            return 'pilots changed';
          case 'customerName':
            return `name: ${value}`;
          case 'bookingStatus':
            return `status: ${value}`;
          case 'pickupLocation':
            return `location: ${value || 'cleared'}`;
          case 'bookingSource':
            return `source: ${value}`;
          case 'phoneNumber':
            return `phone: ${value || 'cleared'}`;
          case 'email':
            return `email: ${value || 'cleared'}`;
          case 'notes':
            return value ? 'notes updated' : 'notes cleared';
          case 'commission':
            return `commission: ${value ?? 'cleared'}`;
          case 'commissionStatus':
            return `commission ${value}`;
          case 'femalePilotsRequired':
            return `${value} lady pilots required`;
          case 'flightType':
            return `flight: ${value}`;
          case 'pilotPayments':
            return 'payment details updated';
          case 'span':
            return `span: ${value}`;
          case 'driver':
          case 'driver2':
            return value ? `driver: ${value}` : 'driver cleared';
          case 'vehicle':
          case 'vehicle2':
            return value ? `vehicle: ${value}` : 'vehicle cleared';
          default:
            return `${key}: ${value}`;
        }
      };

      if (isRestore && (isMove || booking.bookingStatus === 'pending')) {
        // This is a restore operation
        historyAction = "restored";
        // Show the date and time it was restored to
        const restoreDetails: string[] = [];
        if (booking.date) {
          restoreDetails.push(`to ${booking.date}`);
        }
        if (booking.hasOwnProperty('timeIndex') && booking.date) {
          const date = new Date(booking.date + 'T00:00:00');
          const timeSlots = getTimeSlotsByDate(date);
          const timeString = timeSlots[booking.timeIndex as number] || '';
          if (timeString) {
            restoreDetails.push(`at ${timeString}`);
          }
        }
        historyDetails = restoreDetails.length > 0 ? restoreDetails.join(' ') : undefined;
      } else if (isMove) {
        historyAction = "moved";
        // Try to get more details about what changed
        const changes: string[] = [];
        if (booking.hasOwnProperty('date')) {
          changes.push(`to ${booking.date}`);
        }
        if (booking.hasOwnProperty('timeIndex') && booking.date) {
          // Convert timeIndex to actual time string
          const date = new Date(booking.date + 'T00:00:00');
          const timeSlots = getTimeSlotsByDate(date);
          const timeString = timeSlots[booking.timeIndex as number] || `slot ${booking.timeIndex}`;
          changes.push(`at ${timeString}`);
        }
        historyDetails = changes.join(' ');
      } else if (isStatusChange && Object.keys(booking).length === 1) {
        // Only status changed (nothing else)
        historyAction = "status_changed";
        historyDetails = `to ${booking.bookingStatus}`;
      } else {
        // Regular edit - list what fields changed with their values
        // Exclude internal fields like 'span', 'history', 'createdAt', 'pilotIndex'
        const excludeFields = ['history', 'createdAt', 'span', 'pilotIndex'];
        const changedFields = Object.keys(booking).filter(k => !excludeFields.includes(k));
        if (changedFields.length > 0) {
          const changes = changedFields.slice(0, 4).map(key => formatFieldChange(key, booking[key as keyof Booking]));
          historyDetails = changes.join(', ');
          if (changedFields.length > 4) {
            historyDetails += ` +${changedFields.length - 4} more`;
          }
        }
      }

      // Create history entry (use regular Date since serverTimestamp() can't be used in arrayUnion)
      const historyEntry: BookingHistoryEntry = {
        action: historyAction,
        timestamp: new Date(),
        userId: currentUser?.uid || "",
        userName: currentUser?.displayName || currentUser?.email || "Unknown",
        details: historyDetails,
      };

      // Use arrayUnion to append to history array
      sanitizedBooking.history = arrayUnion(historyEntry);

      await updateDoc(doc(db, "bookings", id), sanitizedBooking);
    } catch (err: any) {
      console.error("Error updating booking:", err);
      setError(err.message);
    }
  };

  // Delete a booking (soft delete - marks as deleted)
  const deleteBooking = async (id: string) => {
    try {
      // Create history entry for deletion (use regular Date since serverTimestamp() can't be used in arrayUnion)
      const historyEntry: BookingHistoryEntry = {
        action: "deleted",
        timestamp: new Date(),
        userId: currentUser?.uid || "",
        userName: currentUser?.displayName || currentUser?.email || "Unknown",
      };

      await updateDoc(doc(db, "bookings", id), {
        bookingStatus: "deleted",
        assignedPilots: [], // Unassign all pilots when deleting
        deletedBy: currentUser?.uid || "",
        deletedByName: currentUser?.displayName || currentUser?.email || "",
        deletedAt: serverTimestamp(),
        history: arrayUnion(historyEntry),
      });
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

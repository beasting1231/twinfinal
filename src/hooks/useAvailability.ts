import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../contexts/AuthContext";
import { format, parse } from "date-fns";
import { getTimeSlotsByDate } from "../utils/timeSlots";

interface AvailabilityData {
  id?: string;
  userId: string;
  date: string; // ISO date string
  timeSlot: string;
}

export function useAvailability(targetUserId?: string) {
  const { currentUser } = useAuth();
  const [availabilityMap, setAvailabilityMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Use targetUserId if provided (for admins viewing other users), otherwise use currentUser
  const userId = targetUserId || currentUser?.uid;

  // Helper function to unassign pilot from bookings when they sign out
  const unassignPilotFromBookings = async (dateStr: string, timeSlot: string, pilotUserId: string) => {
    try {
      // Get pilot's display name from userProfiles
      const userProfileDoc = await getDoc(doc(db, "userProfiles", pilotUserId));
      if (!userProfileDoc.exists()) {
        console.log("User profile not found");
        return;
      }

      const pilotDisplayName = userProfileDoc.data()?.displayName;
      if (!pilotDisplayName) {
        console.log("Display name not found in user profile");
        return;
      }

      // Parse the date and get time slots for that date
      const date = parse(dateStr, "yyyy-MM-dd", new Date());
      const timeSlots = getTimeSlotsByDate(date);
      const timeIndex = timeSlots.indexOf(timeSlot);

      if (timeIndex === -1) {
        console.log(`Time slot ${timeSlot} not found for date ${dateStr}`);
        return;
      }

      // Query all bookings for this date
      const bookingsQuery = query(
        collection(db, "bookings"),
        where("date", "==", dateStr)
      );

      const bookingsSnapshot = await getDocs(bookingsQuery);

      // Find bookings at this time index where pilot is assigned
      const updatePromises = bookingsSnapshot.docs.map(async (bookingDoc) => {
        const bookingData = bookingDoc.data();

        // Check if this booking is at the right time index and has the pilot assigned
        if (bookingData.timeIndex === timeIndex && bookingData.assignedPilots) {
          const assignedIndex = bookingData.assignedPilots.findIndex(
            (p: string) => p === pilotDisplayName
          );

          if (assignedIndex !== -1) {
            // Create updated pilots array with pilot removed
            const updatedPilots = [...bookingData.assignedPilots];
            updatedPilots[assignedIndex] = "";

            // Remove pilot's payment details if they exist
            const updates: any = {
              assignedPilots: updatedPilots
            };

            if (bookingData.pilotPayments && Array.isArray(bookingData.pilotPayments)) {
              // Filter out the payment for this pilot
              const updatedPayments = bookingData.pilotPayments.filter(
                (payment: any) => payment.pilotName !== pilotDisplayName
              );
              updates.pilotPayments = updatedPayments;
            }

            // Update the booking
            await updateDoc(doc(db, "bookings", bookingDoc.id), updates);
            console.log(`Unassigned ${pilotDisplayName} from booking ${bookingDoc.id} and removed payment details`);
          }
        }
      });

      await Promise.all(updatePromises);
    } catch (error) {
      console.error("Error unassigning pilot from bookings:", error);
    }
  };

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    // Subscribe to availability for the specified user
    const q = query(
      collection(db, "availability"),
      where("userId", "==", userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMap = new Map<string, string>();
      snapshot.docs.forEach((doc) => {
        const data = doc.data() as AvailabilityData;
        const key = `${data.date}-${data.timeSlot}`;
        newMap.set(key, doc.id);
      });
      setAvailabilityMap(newMap);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  const isAvailable = (date: Date, timeSlot: string): boolean => {
    const dateStr = format(date, "yyyy-MM-dd");
    const key = `${dateStr}-${timeSlot}`;
    return availabilityMap.has(key);
  };

  const toggleAvailability = async (date: Date, timeSlot: string) => {
    if (!userId) return;

    try {
      setSaving(true);
      setJustSaved(false);

      const dateStr = format(date, "yyyy-MM-dd");
      const key = `${dateStr}-${timeSlot}`;

      if (availabilityMap.has(key)) {
        // Delete - user is marking as unavailable (red)
        const q = query(
          collection(db, "availability"),
          where("userId", "==", userId),
          where("date", "==", dateStr),
          where("timeSlot", "==", timeSlot)
        );
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
        await Promise.all(deletePromises);

        // Unassign pilot from any bookings at this time
        await unassignPilotFromBookings(dateStr, timeSlot, userId);
      } else {
        // Add - user is marking as available (green)
        await addDoc(collection(db, "availability"), {
          userId: userId,
          date: dateStr,
          timeSlot: timeSlot,
        });
      }

      setSaving(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (error) {
      console.error("Error toggling availability:", error);
      setSaving(false);
    }
  };

  const toggleDay = async (date: Date, timeSlots: string[]) => {
    if (!userId) {
      console.log("No user ID");
      return;
    }

    try {
      setSaving(true);
      setJustSaved(false);

      const dateStr = format(date, "yyyy-MM-dd");
      console.log("Toggle day:", dateStr, "Slots:", timeSlots);

      // Check if all time slots for this day are available
      const allAvailable = timeSlots.every((slot) => {
        const key = `${dateStr}-${slot}`;
        return availabilityMap.has(key);
      });

      console.log("All available?", allAvailable);

      if (allAvailable) {
        // Delete only the specified slots (not all slots for the day)
        const deletePromises = timeSlots.map(async (slot) => {
          const q = query(
            collection(db, "availability"),
            where("userId", "==", userId),
            where("date", "==", dateStr),
            where("timeSlot", "==", slot)
          );
          const snapshot = await getDocs(q);
          await Promise.all(snapshot.docs.map((doc) => deleteDoc(doc.ref)));

          // Unassign pilot from any bookings at this time
          await unassignPilotFromBookings(dateStr, slot, userId);
        });
        await Promise.all(deletePromises);
      } else {
        // Add all slots for this day
        const addPromises = timeSlots.map((slot) => {
          const key = `${dateStr}-${slot}`;
          if (!availabilityMap.has(key)) {
            return addDoc(collection(db, "availability"), {
              userId: userId,
              date: dateStr,
              timeSlot: slot,
            });
          }
          return Promise.resolve();
        });
        await Promise.all(addPromises);
      }

      setSaving(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (error) {
      console.error("Error toggling day:", error);
      setSaving(false);
    }
  };

  return {
    isAvailable,
    toggleAvailability,
    toggleDay,
    loading,
    saving,
    justSaved,
  };
}

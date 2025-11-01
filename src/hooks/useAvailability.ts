import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../contexts/AuthContext";
import { format } from "date-fns";

interface AvailabilityData {
  id?: string;
  userId: string;
  date: string; // ISO date string
  timeSlot: string;
}

export function useAvailability() {
  const { currentUser } = useAuth();
  const [availabilityMap, setAvailabilityMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    // Subscribe to availability for current user
    const q = query(
      collection(db, "availability"),
      where("userId", "==", currentUser.uid)
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
  }, [currentUser]);

  const isAvailable = (date: Date, timeSlot: string): boolean => {
    const dateStr = format(date, "yyyy-MM-dd");
    const key = `${dateStr}-${timeSlot}`;
    return availabilityMap.has(key);
  };

  const toggleAvailability = async (date: Date, timeSlot: string) => {
    if (!currentUser) return;

    try {
      setSaving(true);
      setJustSaved(false);

      const dateStr = format(date, "yyyy-MM-dd");
      const key = `${dateStr}-${timeSlot}`;

      if (availabilityMap.has(key)) {
        // Delete - user is marking as unavailable (red)
        const q = query(
          collection(db, "availability"),
          where("userId", "==", currentUser.uid),
          where("date", "==", dateStr),
          where("timeSlot", "==", timeSlot)
        );
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
      } else {
        // Add - user is marking as available (green)
        await addDoc(collection(db, "availability"), {
          userId: currentUser.uid,
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
    if (!currentUser) {
      console.log("No current user");
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
        // Delete all slots for this day
        const q = query(
          collection(db, "availability"),
          where("userId", "==", currentUser.uid),
          where("date", "==", dateStr)
        );
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
      } else {
        // Add all slots for this day
        const addPromises = timeSlots.map((slot) => {
          const key = `${dateStr}-${slot}`;
          if (!availabilityMap.has(key)) {
            return addDoc(collection(db, "availability"), {
              userId: currentUser.uid,
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

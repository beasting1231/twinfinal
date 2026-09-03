import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../contexts/AuthContext";
import { format } from "date-fns";
import type { AvailabilityStatus } from "../types/index";
import { normalizeAvailabilityStatus, isAvailabilityActive, setAvailabilityStatus, unassignPilotFromBookings } from "../utils/availabilityState";

interface AvailabilityData {
  id?: string;
  userId: string;
  date: string; // ISO date string
  timeSlot: string;
  status?: AvailabilityStatus; // "available" (default), "onRequest", or "unavailable"
  signedInAt?: string;
  signedOutAt?: string;
}

export function useAvailability(targetUserId?: string) {
  const { currentUser } = useAuth();
  const [statusMap, setStatusMap] = useState<Map<string, AvailabilityStatus>>(new Map()); // key -> status
  const [loading, setLoading] = useState(true);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Use targetUserId if provided (for admins viewing other users), otherwise use currentUser
  const userId = targetUserId || currentUser?.uid;

  useEffect(() => {
    if (!userId) {
      setStatusMap(new Map());
      setLoadedUserId(null);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    setStatusMap(new Map());
    setLoadedUserId(null);
    setError(null);
    setLoading(true);

    // Subscribe to availability for the specified user
    const q = query(
      collection(db, "availability"),
      where("userId", "==", userId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!active) return;

        const newStatusMap = new Map<string, AvailabilityStatus>();
        snapshot.docs.forEach((doc) => {
          const data = doc.data() as AvailabilityData;
          const key = `${data.date}-${data.timeSlot}`;
          newStatusMap.set(key, normalizeAvailabilityStatus(data.status));
        });
        setStatusMap(newStatusMap);
        setLoadedUserId(userId);
        setLoading(false);
      },
      (snapshotError) => {
        if (!active) return;

        console.error("Error loading availability:", snapshotError);
        setStatusMap(new Map());
        setLoadedUserId(null);
        setError("Availability could not be loaded. Please try again.");
        setLoading(false);
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  const isLoadingSelectedUser = Boolean(userId) && !error && (loading || loadedUserId !== userId);

  const isAvailable = (date: Date, timeSlot: string): boolean => {
    const dateStr = format(date, "yyyy-MM-dd");
    const key = `${dateStr}-${timeSlot}`;
    return isAvailabilityActive(statusMap.get(key));
  };

  const getAvailabilityStatus = (date: Date, timeSlot: string): AvailabilityStatus => {
    const dateStr = format(date, "yyyy-MM-dd");
    const key = `${dateStr}-${timeSlot}`;
    return statusMap.get(key) || "unavailable";
  };

  const setOnRequest = async (date: Date, timeSlot: string) => {
    if (!userId) return;

    try {
      setSaving(true);
      setJustSaved(false);

      const dateStr = format(date, "yyyy-MM-dd");

      await setAvailabilityStatus({
        db,
        userId,
        date: dateStr,
        timeSlot,
        status: "onRequest",
      });

      setSaving(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (error) {
      console.error("Error setting on request:", error);
      setSaving(false);
    }
  };

  const toggleAvailability = async (date: Date, timeSlot: string) => {
    if (!userId) return;

    try {
      setSaving(true);
      setJustSaved(false);

      const dateStr = format(date, "yyyy-MM-dd");
      const key = `${dateStr}-${timeSlot}`;

      const currentStatus = statusMap.get(key) || "unavailable";

      if (isAvailabilityActive(currentStatus)) {
        await setAvailabilityStatus({
          db,
          userId,
          date: dateStr,
          timeSlot,
          status: "unavailable",
        });

        await unassignPilotFromBookings(db, dateStr, timeSlot, userId);
      } else {
        await setAvailabilityStatus({
          db,
          userId,
          date: dateStr,
          timeSlot,
          status: "available",
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
        return isAvailabilityActive(statusMap.get(key));
      });

      console.log("All available?", allAvailable);

      if (allAvailable) {
        const signOutPromises = timeSlots.map(async (slot) => {
          await setAvailabilityStatus({
            db,
            userId,
            date: dateStr,
            timeSlot: slot,
            status: "unavailable",
          });

          await unassignPilotFromBookings(db, dateStr, slot, userId);
        });
        await Promise.all(signOutPromises);
      } else {
        const signInPromises = timeSlots.map((slot) =>
          setAvailabilityStatus({
            db,
            userId,
            date: dateStr,
            timeSlot: slot,
            status: "available",
          })
        );
        await Promise.all(signInPromises);
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
    getAvailabilityStatus,
    setOnRequest,
    toggleAvailability,
    toggleDay,
    loading: isLoadingSelectedUser,
    error,
    saving,
    justSaved,
  };
}

import { useState, useEffect } from "react";
import { arrayUnion, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import type { AssignmentHistoryEntry, DriverAssignment } from "../types/index";
import { useAuth } from "../contexts/AuthContext";

function createDriverAssignmentSnapshot(assignment: Partial<DriverAssignment>) {
  const snapshot: Record<string, any> = {};

  for (const key of ["date", "timeIndex", "driver", "vehicle", "driver2", "vehicle2", "secondDriverColumnVisible", "secondDriverPilots"] as Array<keyof DriverAssignment>) {
    const value = assignment[key];
    if (value !== undefined) {
      snapshot[key] = value;
    }
  }

  return JSON.parse(JSON.stringify(snapshot));
}

export function useDriverAssignments(date?: string) {
  const [driverAssignments, setDriverAssignments] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentUser, userProfile } = useAuth();

  const createHistoryEntry = (
    action: AssignmentHistoryEntry["action"],
    snapshotAfter: Partial<DriverAssignment> | null,
    details?: string
  ): AssignmentHistoryEntry => ({
    action,
    timestamp: new Date(),
    userId: currentUser?.uid || "",
    userName: userProfile?.displayName || currentUser?.displayName || currentUser?.email || "Unknown",
    ...(details ? { details } : {}),
    snapshotAfter: snapshotAfter ? createDriverAssignmentSnapshot(snapshotAfter) : null,
  });

  useEffect(() => {
    // If no date provided, subscribe to all driver assignments
    // If date provided, only subscribe to assignments for that date
    const assignmentsQuery = date
      ? query(collection(db, "driverAssignments"), where("date", "==", date))
      : collection(db, "driverAssignments");

    const unsubscribe = onSnapshot(
      assignmentsQuery,
      (snapshot) => {
        const assignmentsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as DriverAssignment[];

        setDriverAssignments(assignmentsData);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching driver assignments:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [date]);

  // Add a new driver assignment
  const addDriverAssignment = async (assignment: Omit<DriverAssignment, "id">) => {
    try {
      await addDoc(collection(db, "driverAssignments"), {
        ...assignment,
        history: [createHistoryEntry("created", assignment)],
      });
    } catch (err: any) {
      console.error("Error adding driver assignment:", err);
      setError(err.message);
      throw err;
    }
  };

  // Update an existing driver assignment
  const updateDriverAssignment = async (id: string, assignment: Partial<DriverAssignment>) => {
    try {
      const existingAssignment = driverAssignments.find((driverAssignment) => driverAssignment.id === id);
      const snapshotAfter = {
        ...(existingAssignment || {}),
        ...assignment,
      };
      delete (snapshotAfter as Partial<DriverAssignment>).id;

      await updateDoc(doc(db, "driverAssignments", id), {
        ...assignment,
        history: arrayUnion(createHistoryEntry("edited", snapshotAfter)),
      });
    } catch (err: any) {
      console.error("Error updating driver assignment:", err);
      setError(err.message);
      throw err;
    }
  };

  // Delete a driver assignment
  const deleteDriverAssignment = async (id: string) => {
    try {
      await deleteDoc(doc(db, "driverAssignments", id));
    } catch (err: any) {
      console.error("Error deleting driver assignment:", err);
      setError(err.message);
      throw err;
    }
  };

  // Find assignment by date and timeIndex
  const findAssignment = (date: string, timeIndex: number) => {
    return driverAssignments.find(
      (a) => a.date === date && a.timeIndex === timeIndex
    );
  };

  return {
    driverAssignments,
    loading,
    error,
    addDriverAssignment,
    updateDriverAssignment,
    deleteDriverAssignment,
    findAssignment,
  };
}

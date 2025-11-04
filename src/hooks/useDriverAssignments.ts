import { useState, useEffect } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import type { DriverAssignment } from "../types/index";

export function useDriverAssignments(date?: string) {
  const [driverAssignments, setDriverAssignments] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      await addDoc(collection(db, "driverAssignments"), assignment);
    } catch (err: any) {
      console.error("Error adding driver assignment:", err);
      setError(err.message);
      throw err;
    }
  };

  // Update an existing driver assignment
  const updateDriverAssignment = async (id: string, assignment: Partial<DriverAssignment>) => {
    try {
      await updateDoc(doc(db, "driverAssignments", id), assignment);
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

import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase/config";
import type { DeskAssignment } from "../types";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function getDeskAssignmentId(date: string, timeIndex: number) {
  return `${date}_${timeIndex}`;
}

export function useDeskAssignments(date?: string, enabled = true) {
  const [deskAssignments, setDeskAssignments] = useState<DeskAssignment[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDeskAssignments([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);

    const assignmentsQuery = date
      ? query(collection(db, "deskAssignments"), where("date", "==", date))
      : collection(db, "deskAssignments");

    const unsubscribe = onSnapshot(
      assignmentsQuery,
      (snapshot) => {
        const assignmentsData = snapshot.docs.map((assignmentDoc) => ({
          id: assignmentDoc.id,
          ...assignmentDoc.data(),
        })) as DeskAssignment[];

        setDeskAssignments(assignmentsData);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching desk assignments:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [date, enabled]);

  const addDeskAssignment = async (assignment: Omit<DeskAssignment, "id">) => {
    try {
      await addDoc(collection(db, "deskAssignments"), assignment);
    } catch (err: unknown) {
      console.error("Error adding desk assignment:", err);
      setError(getErrorMessage(err));
      throw err;
    }
  };

  const updateDeskAssignment = async (id: string, assignment: Partial<DeskAssignment>) => {
    try {
      await updateDoc(doc(db, "deskAssignments", id), assignment);
    } catch (err: unknown) {
      console.error("Error updating desk assignment:", err);
      setError(getErrorMessage(err));
      throw err;
    }
  };

  const saveDeskAssignment = async (assignment: Omit<DeskAssignment, "id">) => {
    try {
      const assignmentId = getDeskAssignmentId(assignment.date, assignment.timeIndex);
      await setDoc(doc(db, "deskAssignments", assignmentId), assignment, { merge: true });
    } catch (err: unknown) {
      console.error("Error saving desk assignment:", err);
      setError(getErrorMessage(err));
      throw err;
    }
  };

  const deleteDeskAssignment = async (id: string) => {
    try {
      await deleteDoc(doc(db, "deskAssignments", id));
    } catch (err: unknown) {
      console.error("Error deleting desk assignment:", err);
      setError(getErrorMessage(err));
      throw err;
    }
  };

  const findDeskAssignment = (assignmentDate: string, timeIndex: number) => {
    const matchingAssignments = deskAssignments.filter(
      (assignment) => assignment.date === assignmentDate && assignment.timeIndex === timeIndex
    );

    return matchingAssignments.find((assignment) => assignment.desk?.trim()) || matchingAssignments[0];
  };

  return {
    deskAssignments,
    loading,
    error,
    addDeskAssignment,
    updateDeskAssignment,
    saveDeskAssignment,
    deleteDeskAssignment,
    findDeskAssignment,
  };
}

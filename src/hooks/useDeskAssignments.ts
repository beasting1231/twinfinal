import { useEffect, useState } from "react";
import { addDoc, arrayUnion, collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase/config";
import type { AssignmentHistoryEntry, DeskAssignment } from "../types";
import { useAuth } from "../contexts/AuthContext";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function getDeskAssignmentId(date: string, timeIndex: number) {
  return `${date}_${timeIndex}`;
}

function createDeskAssignmentSnapshot(assignment: Partial<DeskAssignment>) {
  const snapshot: Record<string, any> = {};

  for (const key of ["date", "timeIndex", "desk"] as Array<keyof DeskAssignment>) {
    const value = assignment[key];
    if (value !== undefined) {
      snapshot[key] = value;
    }
  }

  return JSON.parse(JSON.stringify(snapshot));
}

export function useDeskAssignments(date?: string, enabled = true) {
  const [deskAssignments, setDeskAssignments] = useState<DeskAssignment[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const { currentUser, userProfile } = useAuth();

  const createHistoryEntry = (
    action: AssignmentHistoryEntry["action"],
    snapshotAfter: Partial<DeskAssignment> | null,
    details?: string
  ): AssignmentHistoryEntry => ({
    action,
    timestamp: new Date(),
    userId: currentUser?.uid || "",
    userName: userProfile?.displayName || currentUser?.displayName || currentUser?.email || "Unknown",
    ...(details ? { details } : {}),
    snapshotAfter: snapshotAfter ? createDeskAssignmentSnapshot(snapshotAfter) : null,
  });

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
      await addDoc(collection(db, "deskAssignments"), {
        ...assignment,
        history: [createHistoryEntry("created", assignment)],
      });
    } catch (err: unknown) {
      console.error("Error adding desk assignment:", err);
      setError(getErrorMessage(err));
      throw err;
    }
  };

  const updateDeskAssignment = async (id: string, assignment: Partial<DeskAssignment>) => {
    try {
      const existingAssignment = deskAssignments.find((deskAssignment) => deskAssignment.id === id);
      const snapshotAfter = {
        ...(existingAssignment || {}),
        ...assignment,
      };
      delete (snapshotAfter as Partial<DeskAssignment>).id;

      await updateDoc(doc(db, "deskAssignments", id), {
        ...assignment,
        history: arrayUnion(createHistoryEntry("edited", snapshotAfter)),
      });
    } catch (err: unknown) {
      console.error("Error updating desk assignment:", err);
      setError(getErrorMessage(err));
      throw err;
    }
  };

  const saveDeskAssignment = async (assignment: Omit<DeskAssignment, "id">) => {
    try {
      const assignmentId = getDeskAssignmentId(assignment.date, assignment.timeIndex);
      const existingAssignment = deskAssignments.find((deskAssignment) => deskAssignment.id === assignmentId);
      await setDoc(doc(db, "deskAssignments", assignmentId), {
        ...assignment,
        history: arrayUnion(createHistoryEntry(existingAssignment ? "edited" : "created", assignment)),
      }, { merge: true });
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

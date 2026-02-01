import { useState, useEffect } from "react";
import { db } from "../firebase/config";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { format } from "date-fns";

interface TimeSlotNotes {
  [timeIndex: number]: {
    note: string;
    updatedAt?: any;
    updatedBy?: string;
  };
}

export function useTimeSlotNotes(selectedDate: Date) {
  const [notes, setNotes] = useState<{ [timeIndex: number]: string }>({});
  const [loading, setLoading] = useState(true);

  const dateString = format(selectedDate, "yyyy-MM-dd");

  useEffect(() => {
    setLoading(true);

    const notesRef = doc(db, "timeSlotNotes", dateString);

    const unsubscribe = onSnapshot(
      notesRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as TimeSlotNotes;
          const notesMap: { [timeIndex: number]: string } = {};

          // Convert the Firestore data to a simple map of timeIndex -> note string
          Object.entries(data).forEach(([key, value]) => {
            const timeIndex = parseInt(key);
            if (!isNaN(timeIndex) && value && typeof value === 'object') {
              notesMap[timeIndex] = value.note || "";
            }
          });

          setNotes(notesMap);
        } else {
          setNotes({});
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching time slot notes:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [dateString]);

  const updateNote = async (timeIndex: number, newNote: string, updatedBy?: string) => {
    try {
      const notesRef = doc(db, "timeSlotNotes", dateString);

      // Update just the specific time slot's note
      await setDoc(notesRef, {
        [timeIndex]: {
          note: newNote,
          updatedAt: new Date(),
          updatedBy: updatedBy || "unknown"
        }
      }, { merge: true });
    } catch (error) {
      console.error("Error updating time slot note:", error);
      throw error;
    }
  };

  return {
    notes,
    loading,
    updateNote,
    getNote: (timeIndex: number) => notes[timeIndex] || ""
  };
}

import { useState, useEffect } from "react";
import { db } from "../firebase/config";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { format } from "date-fns";

interface DailyNote {
  note: string;
  updatedAt?: any;
  updatedBy?: string;
}

export function useDailyNotes(selectedDate: Date) {
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const dateString = format(selectedDate, "yyyy-MM-dd");

  useEffect(() => {
    setLoading(true);

    const notesRef = doc(db, "dailyNotes", dateString);

    const unsubscribe = onSnapshot(
      notesRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as DailyNote;
          setNote(data.note || "");
        } else {
          setNote("");
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching daily note:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [dateString]);

  const updateNote = async (newNote: string, updatedBy?: string) => {
    try {
      const notesRef = doc(db, "dailyNotes", dateString);
      await setDoc(notesRef, {
        note: newNote,
        updatedAt: new Date(),
        updatedBy: updatedBy || "unknown"
      });
    } catch (error) {
      console.error("Error updating note:", error);
      throw error;
    }
  };

  return {
    note,
    loading,
    updateNote
  };
}

import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";

export function useBookingSourceColors() {
  const [sourceColors, setSourceColors] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to booking sources collection
    const unsubscribe = onSnapshot(
      collection(db, "bookingSources"),
      (snapshot) => {
        const colors = new Map<string, string>();
        snapshot.docs.forEach((doc) => {
          colors.set(doc.id, doc.data().color || "#1e3a8a");
        });
        setSourceColors(colors);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching booking source colors:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const getSourceColor = (sourceName: string): string => {
    return sourceColors.get(sourceName) || "#1e3a8a"; // Default blue
  };

  return { sourceColors, getSourceColor, loading };
}

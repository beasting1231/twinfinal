import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { Button } from "./ui/button";
import { GripVertical } from "lucide-react";
import type { UserProfile } from "../types";

export function Priority() {
  const [orderedPilots, setOrderedPilots] = useState<UserProfile[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch all user profiles
  useEffect(() => {
    const fetchPilots = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "userProfiles"));
        const pilots = querySnapshot.docs.map(doc => doc.data() as UserProfile);

        // Sort by priority (lower number = higher priority)
        const sorted = pilots.sort((a, b) => {
          const priorityA = a.priority ?? 999999;
          const priorityB = b.priority ?? 999999;
          return priorityA - priorityB;
        });

        setOrderedPilots(sorted);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching pilots:", error);
        setLoading(false);
      }
    };

    fetchPilots();
  }, []);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === index) return;

    const newOrder = [...orderedPilots];
    const draggedItem = newOrder[draggedIndex];

    // Remove from old position
    newOrder.splice(draggedIndex, 1);

    // Insert at new position
    newOrder.splice(index, 0, draggedItem);

    setOrderedPilots(newOrder);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Update priority for each pilot
      const updates = orderedPilots.map((pilot, index) => {
        if (pilot.uid) {
          const pilotRef = doc(db, "userProfiles", pilot.uid);
          return updateDoc(pilotRef, { priority: index + 1 });
        }
        return Promise.resolve();
      });

      await Promise.all(updates);
      alert("Priority order saved successfully!");
    } catch (error) {
      console.error("Error saving priority order:", error);
      alert("Failed to save priority order");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-4 border-zinc-700 border-t-white rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 p-6 overflow-hidden">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Pilot Priority</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Drag and drop to reorder pilots. 1 = highest priority.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isSaving ? "Saving..." : "Save Priority Order"}
        </Button>
      </div>

      {/* Priority List */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto space-y-2">
          {orderedPilots.map((pilot, index) => (
            <div
              key={pilot.uid}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`
                bg-zinc-900 border border-zinc-800 rounded-lg p-4
                cursor-move transition-all
                hover:bg-zinc-800 hover:border-zinc-700
                ${draggedIndex === index ? "opacity-50" : ""}
              `}
            >
              <div className="flex items-center gap-4">
                <GripVertical className="w-5 h-5 text-zinc-500" />
                <div className="flex items-center justify-center w-10 h-10 bg-zinc-800 rounded-full">
                  <span className="text-lg font-bold text-white">{index + 1}</span>
                </div>
                <div className="flex-1">
                  <div className="text-white font-medium">{pilot.displayName}</div>
                  <div className="text-sm text-zinc-400">{pilot.email}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

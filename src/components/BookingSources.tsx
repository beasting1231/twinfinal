import { useState, useEffect, useMemo } from "react";
import { collection, query, getDocs, doc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import { Search, Palette } from "lucide-react";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";

interface BookingSource {
  name: string;
  color: string;
  count: number;
}

export function BookingSources() {
  const [bookingSources, setBookingSources] = useState<BookingSource[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingSource, setEditingSource] = useState<BookingSource | null>(null);
  const [editColor, setEditColor] = useState("");

  // Fetch booking sources and calculate counts
  useEffect(() => {
    setLoading(true);

    // Subscribe to bookings to calculate counts in real-time
    const bookingsQuery = query(collection(db, "bookings"));
    const unsubscribeBookings = onSnapshot(bookingsQuery, async (bookingsSnapshot) => {
      // Count bookings by source
      const sourceCounts = new Map<string, number>();
      bookingsSnapshot.docs.forEach((doc) => {
        const booking = doc.data();
        const source = booking.bookingSource || "Unknown";
        sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
      });

      // Fetch booking source colors from bookingSources collection
      const sourcesQuery = query(collection(db, "bookingSources"));
      const sourcesSnapshot = await getDocs(sourcesQuery);
      const sourceColors = new Map<string, string>();
      sourcesSnapshot.docs.forEach((doc) => {
        sourceColors.set(doc.id, doc.data().color || "#1e3a8a");
      });

      // Combine counts and colors
      const sources: BookingSource[] = Array.from(sourceCounts.entries()).map(([name, count]) => ({
        name,
        color: sourceColors.get(name) || "#1e3a8a", // Default blue color
        count,
      }));

      // Sort by count (most to least)
      sources.sort((a, b) => b.count - a.count);

      setBookingSources(sources);
      setLoading(false);
    });

    return () => {
      unsubscribeBookings();
    };
  }, []);

  // Filter sources by search term
  const filteredSources = useMemo(() => {
    if (!searchTerm) return bookingSources;
    return bookingSources.filter((source) =>
      source.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [bookingSources, searchTerm]);

  // Open edit dialog
  const handleEditSource = (source: BookingSource) => {
    setEditingSource(source);
    setEditColor(source.color);
  };

  // Save color change
  const handleSaveColor = async () => {
    if (!editingSource) return;

    try {
      // Update or create booking source document
      const sourceRef = doc(db, "bookingSources", editingSource.name);
      await setDoc(sourceRef, {
        color: editColor,
      }, { merge: true });

      // Update local state
      setBookingSources((prev) =>
        prev.map((s) =>
          s.name === editingSource.name ? { ...s, color: editColor } : s
        )
      );

      setEditingSource(null);
    } catch (error) {
      console.error("Error updating booking source color:", error);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-zinc-950 p-4 overflow-hidden">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Booking Sources</h1>
        <p className="text-gray-600 dark:text-zinc-400 text-sm">
          Manage and track your booking sources
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500 text-gray-400 dark:text-zinc-500" />
        <Input
          type="text"
          placeholder="Search booking sources..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500"
        />
      </div>

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-4 border-gray-300 dark:border-zinc-700 border-t-white border-t-gray-900 dark:border-t-white rounded-full animate-spin"></div>
          </div>
        ) : filteredSources.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-zinc-500">
            <p>{searchTerm ? "No booking sources found" : "No booking sources yet"}</p>
          </div>
        ) : (
          filteredSources.map((source) => (
            <div
              key={source.name}
              onClick={() => handleEditSource(source)}
              className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-4 flex-1">
                {/* Color indicator */}
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: source.color }}
                >
                  <Palette className="w-6 h-6 text-white" />
                </div>

                {/* Source info */}
                <div className="flex-1">
                  <div className="text-gray-900 dark:text-white font-medium text-lg">{source.name}</div>
                  <div className="text-gray-600 dark:text-zinc-400 text-sm">
                    {source.count} {source.count === 1 ? "booking" : "bookings"}
                  </div>
                </div>
              </div>

              {/* Count badge */}
              <div className="bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white px-3 py-1 rounded-full font-medium">
                {source.count}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Color Dialog */}
      {editingSource && (
        <Dialog open={!!editingSource} onOpenChange={() => setEditingSource(null)}>
          <DialogContent className="w-[90vw] max-w-md bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-gray-900 dark:text-white">Edit Booking Source Color</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 dark:text-zinc-400 mb-2 block">
                  Booking Source
                </label>
                <div className="text-gray-900 dark:text-white font-medium text-lg">{editingSource.name}</div>
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-zinc-400 mb-2 block">
                  Color
                </label>
                <div className="flex gap-3">
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="w-20 h-20 rounded-lg cursor-pointer border-2 border-gray-300 dark:border-zinc-700"
                  />
                  <div className="flex-1">
                    <Input
                      type="text"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      placeholder="#1e3a8a"
                      className="bg-white dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white mb-2"
                    />
                    <div
                      className="w-full h-10 rounded-lg border-2 border-gray-300 dark:border-zinc-700"
                      style={{ backgroundColor: editColor }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  onClick={() => setEditingSource(null)}
                  variant="outline"
                  className="border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveColor}
                  className="bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-zinc-200"
                >
                  Save
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

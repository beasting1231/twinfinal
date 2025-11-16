import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { ChevronDown } from "lucide-react";
import type { Pilot } from "../types/index";

interface AddPilotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pilots: Pilot[];
  timeSlot: string;
  onAddPilot: (pilotUid: string) => void;
}

export function AddPilotModal({
  open,
  onOpenChange,
  pilots,
  timeSlot,
  onAddPilot,
}: AddPilotModalProps) {
  const [selectedPilot, setSelectedPilot] = useState<Pilot | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredPilots, setFilteredPilots] = useState(pilots);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredPilots(pilots);
    } else {
      const searchTerm = searchQuery.toLowerCase();
      const filtered = pilots.filter((pilot) =>
        pilot.displayName.toLowerCase().includes(searchTerm) ||
        pilot.email?.toLowerCase().includes(searchTerm)
      );
      setFilteredPilots(filtered);
    }
  }, [searchQuery, pilots]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setIsDropdownOpen(true);
  };

  const handleSelectPilot = (pilot: Pilot) => {
    setSelectedPilot(pilot);
    setSearchQuery("");
    setIsDropdownOpen(false);
  };

  const handleInputClick = () => {
    if (!isDropdownOpen) {
      setSearchQuery("");
      setIsDropdownOpen(true);
    }
  };

  const handleDropdownToggle = () => {
    if (!isDropdownOpen) {
      setSearchQuery("");
    }
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleSave = () => {
    if (!selectedPilot) {
      alert("Please select a pilot");
      return;
    }

    onAddPilot(selectedPilot.uid);
    setSelectedPilot(null);
    setSearchQuery("");
    onOpenChange(false);
  };

  const handleCancel = () => {
    setSelectedPilot(null);
    setSearchQuery("");
    onOpenChange(false);
  };

  // Reset when modal closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedPilot(null);
      setSearchQuery("");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="bg-white dark:bg-zinc-950 border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white max-w-md overflow-visible"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">Add Pilot to {timeSlot}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-visible">
          <div className="space-y-2 relative overflow-visible">
            <Label htmlFor="pilot-select" className="text-gray-900 dark:text-white">
              Pilot
            </Label>
            <div className="relative">
              <Input
                id="pilot-select"
                value={selectedPilot ? selectedPilot.displayName : searchQuery}
                onChange={handleInputChange}
                onClick={handleInputClick}
                className="pr-8"
                placeholder="Type to search or select..."
                autoComplete="off"
              />
              <button
                type="button"
                onClick={handleDropdownToggle}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isDropdownOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {filteredPilots.length > 0 ? (
                    <div className="py-1">
                      {filteredPilots.map((pilot) => (
                        <button
                          key={pilot.uid}
                          type="button"
                          onClick={() => handleSelectPilot(pilot)}
                          className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-900 dark:text-white flex items-center justify-between group transition-colors"
                        >
                          <span>
                            {pilot.displayName} {pilot.femalePilot ? "👩" : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-3 text-gray-500 dark:text-zinc-500 text-sm">
                      No pilots found
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            onClick={handleSave}
            className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-zinc-200"
          >
            Save
          </Button>
          <Button
            variant="outline"
            onClick={handleCancel}
            className="flex-1 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

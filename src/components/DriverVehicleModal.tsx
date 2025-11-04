import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { ChevronDown } from "lucide-react";
import { useDrivers } from "../hooks/useDrivers";
import { useVehicles } from "../hooks/useVehicles";
import type { Booking } from "../types";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";

interface DriverVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  driverColumn?: 1 | 2;
}

interface AutocompleteFieldProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  id: string;
  suggestions: { name: string; count: number }[];
  placeholder: string;
}

function AutocompleteField({
  value,
  onChange,
  label,
  id,
  suggestions,
  placeholder,
}: AutocompleteFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredSuggestions, setFilteredSuggestions] = useState(suggestions);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredSuggestions(suggestions);
    } else {
      const searchTerm = searchQuery.toLowerCase();
      const filtered = suggestions.filter((item) =>
        item.name.toLowerCase().includes(searchTerm)
      );
      setFilteredSuggestions(filtered);
    }
  }, [searchQuery, suggestions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setSearchQuery(newValue);
    setIsOpen(true);
  };

  const handleSelectItem = (itemName: string) => {
    onChange(itemName);
    setSearchQuery("");
    setIsOpen(false);
  };

  const handleInputFocus = () => {
    setSearchQuery("");
    setIsOpen(true);
  };

  const handleDropdownToggle = () => {
    if (!isOpen) {
      setSearchQuery("");
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="space-y-2 relative">
      <Label htmlFor={id} className="text-white">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          className="pr-8"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={handleDropdownToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
            {filteredSuggestions.length > 0 ? (
              <div className="py-1">
                {filteredSuggestions.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => handleSelectItem(item.name)}
                    className="w-full px-4 py-2 text-left hover:bg-zinc-800 text-white flex items-center justify-between group transition-colors"
                  >
                    <span>{item.name}</span>
                    <span className="text-xs text-zinc-500 group-hover:text-zinc-400">
                      {item.count} {item.count === 1 ? "time" : "times"}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-3 text-zinc-500 text-sm">
                {searchQuery.trim() ? (
                  <>
                    No matches found. Type to create{" "}
                    <span className="text-white font-medium">"{searchQuery}"</span>
                  </>
                ) : (
                  `No ${label.toLowerCase()} yet`
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function DriverVehicleModal({
  isOpen,
  onClose,
  booking,
  driverColumn = 1,
}: DriverVehicleModalProps) {
  const { drivers } = useDrivers();
  const { vehicles } = useVehicles();
  const [driver, setDriver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Initialize fields when booking changes
  useEffect(() => {
    if (booking) {
      if (driverColumn === 2) {
        setDriver(booking.driver2 || "");
        setVehicle(booking.vehicle2 || "");
      } else {
        setDriver(booking.driver || "");
        setVehicle(booking.vehicle || "");
      }
    }
  }, [booking, driverColumn]);

  const handleSave = async () => {
    if (!booking?.id) return;

    setIsSaving(true);
    try {
      const bookingRef = doc(db, "bookings", booking.id);
      if (driverColumn === 2) {
        await updateDoc(bookingRef, {
          driver2: driver.trim() || null,
          vehicle2: vehicle.trim() || null,
        });
      } else {
        await updateDoc(bookingRef, {
          driver: driver.trim() || null,
          vehicle: vehicle.trim() || null,
        });
      }
      onClose();
    } catch (error) {
      console.error("Error updating driver/vehicle:", error);
      alert("Failed to update driver and vehicle information");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (driverColumn === 2) {
      setDriver(booking?.driver2 || "");
      setVehicle(booking?.vehicle2 || "");
    } else {
      setDriver(booking?.driver || "");
      setVehicle(booking?.vehicle || "");
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>{driverColumn === 2 ? 'Driver 2' : 'Driver'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <AutocompleteField
            value={driver}
            onChange={setDriver}
            label="Driver"
            id="driver"
            suggestions={drivers}
            placeholder="Type to search or create new..."
          />

          <AutocompleteField
            value={vehicle}
            onChange={setVehicle}
            label="Vehicle"
            id="vehicle"
            suggestions={vehicles}
            placeholder="Type to search or create new..."
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 bg-white text-black hover:bg-zinc-200"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSaving}
            className="flex-1 border-zinc-700 text-white hover:bg-zinc-800"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

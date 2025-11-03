import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import type { Pilot, Booking } from "../types/index";
import { useEditing } from "../contexts/EditingContext";
import { BookingSourceAutocomplete } from "./BookingSourceAutocomplete";

interface NewBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date;
  pilotIndex: number;
  timeIndex: number;
  timeSlot: string;
  pilots: Pilot[];
  bookings: Booking[];
  isPilotAvailableForTimeSlot: (pilotUid: string, timeSlot: string) => boolean;
  onSubmit: (booking: {
    date: string;
    pilotIndex: number;
    timeIndex: number;
    customerName: string;
    numberOfPeople: number;
    pickupLocation: string;
    bookingSource: string;
    phoneNumber?: string;
    email?: string;
    notes?: string;
    assignedPilots: string[];
    bookingStatus: "confirmed" | "pending" | "cancelled";
    span: number;
  }) => void;
}

export function NewBookingModal({
  open,
  onOpenChange,
  selectedDate,
  pilotIndex,
  timeIndex,
  timeSlot,
  pilots,
  bookings,
  isPilotAvailableForTimeSlot,
  onSubmit,
}: NewBookingModalProps) {
  // Modal component for creating new bookings
  const [customerName, setCustomerName] = useState("");
  const [numberOfPeople, setNumberOfPeople] = useState("");
  const [pickupLocation, setPickupLocation] = useState("HW");
  const [bookingSource, setBookingSource] = useState("twin");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [commission, setCommission] = useState("");
  const [femalePilotsRequired, setFemalePilotsRequired] = useState(0);
  const [showAdditionalOptions, setShowAdditionalOptions] = useState(false);

  const { startEditing, stopEditing } = useEditing();

  // Pause real-time updates when modal is open
  useEffect(() => {
    if (open) {
      startEditing();
    } else {
      stopEditing();
    }
  }, [open, startEditing, stopEditing]);

  // Get pilots already assigned at this time
  const assignedPilotsAtThisTime = useMemo(() => {
    const bookingsAtThisTime = bookings.filter(b => b.timeIndex === timeIndex);
    const assigned = new Set<string>();
    bookingsAtThisTime.forEach(booking => {
      booking.assignedPilots.forEach(pilot => {
        if (pilot && pilot !== "") assigned.add(pilot);
      });
    });
    return assigned;
  }, [bookings, timeIndex]);

  // Calculate occupied pilot positions at this time
  const occupiedPilotIndices = useMemo(() => {
    const bookingsAtThisTime = bookings.filter(b =>
      b.timeIndex === timeIndex &&
      b.date === format(selectedDate, "yyyy-MM-dd")
    );
    const occupied = new Set<number>();
    bookingsAtThisTime.forEach(booking => {
      // Mark all positions occupied by this booking based on its span
      const bookingSpan = booking.numberOfPeople || booking.span || 1;
      for (let i = 0; i < bookingSpan; i++) {
        occupied.add(booking.pilotIndex + i);
      }
    });
    return occupied;
  }, [bookings, timeIndex, selectedDate]);

  // Calculate available slots at this time based on actually available pilots
  const availableSlots = useMemo(() => {
    // Count pilots who are actually available at this time slot
    const actuallyAvailablePilots = pilots.filter((pilot, index) =>
      !assignedPilotsAtThisTime.has(pilot.displayName) &&
      isPilotAvailableForTimeSlot(pilot.uid, timeSlot) &&
      !occupiedPilotIndices.has(index)
    ).length;

    return actuallyAvailablePilots;
  }, [pilots, assignedPilotsAtThisTime, isPilotAvailableForTimeSlot, timeSlot, occupiedPilotIndices]);

  // Calculate available female pilots at this time
  const availableFemalePilots = useMemo(() => {
    const availableFemalePilotsList = pilots.filter((pilot, index) =>
      pilot.femalePilot &&
      !assignedPilotsAtThisTime.has(pilot.displayName) &&
      isPilotAvailableForTimeSlot(pilot.uid, timeSlot) &&
      !occupiedPilotIndices.has(index)
    );
    return availableFemalePilotsList.length;
  }, [pilots, assignedPilotsAtThisTime, isPilotAvailableForTimeSlot, timeSlot, occupiedPilotIndices]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!customerName.trim() || !numberOfPeople || !pickupLocation.trim() || !bookingSource.trim()) {
      alert("Please fill in all required fields");
      return;
    }

    const numPeople = parseInt(numberOfPeople);
    if (isNaN(numPeople) || numPeople < 1) {
      alert("Number of people must be a valid positive number");
      return;
    }

    // Calculate span based on number of passengers
    const span = numPeople;

    // Find the leftmost available pilot position
    // Get indices of all available pilots at this time
    const availablePilotIndices = pilots
      .map((pilot, index) => ({
        index,
        pilot,
        isAvailable: !assignedPilotsAtThisTime.has(pilot.displayName) &&
                     isPilotAvailableForTimeSlot(pilot.uid, timeSlot) &&
                     !occupiedPilotIndices.has(index)
      }))
      .filter(p => p.isAvailable)
      .map(p => p.index);

    // Use the smallest index (leftmost position)
    const startingPilotIndex = availablePilotIndices.length > 0
      ? Math.min(...availablePilotIndices)
      : pilotIndex;

    // Build booking object, only including optional fields if they have values
    const bookingData: any = {
      date: format(selectedDate, "yyyy-MM-dd"),
      pilotIndex: startingPilotIndex,
      timeIndex,
      customerName: customerName.trim(),
      numberOfPeople: numPeople,
      pickupLocation: pickupLocation.trim(),
      bookingSource: bookingSource.trim(),
      assignedPilots: [], // Pilots will be assigned via the schedule grid
      bookingStatus: "unconfirmed",
      span,
    };

    // Only add optional fields if they have values
    if (phoneNumber.trim()) {
      bookingData.phoneNumber = phoneNumber.trim();
    }
    if (email.trim()) {
      bookingData.email = email.trim();
    }
    if (notes.trim()) {
      bookingData.notes = notes.trim();
    }
    if (commission.trim()) {
      const commissionNum = parseFloat(commission);
      if (!isNaN(commissionNum)) {
        bookingData.commission = commissionNum;
      }
    }
    if (femalePilotsRequired > 0) {
      bookingData.femalePilotsRequired = femalePilotsRequired;
    }

    onSubmit(bookingData);

    // Reset form
    setCustomerName("");
    setNumberOfPeople("");
    setPickupLocation("HW");
    setBookingSource("twin");
    setPhoneNumber("");
    setEmail("");
    setNotes("");
    setCommission("");
    setFemalePilotsRequired(0);
    setShowAdditionalOptions(false);
    onOpenChange(false);
  };

  const handleCancel = () => {
    // Reset form
    setCustomerName("");
    setNumberOfPeople("");
    setPickupLocation("HW");
    setBookingSource("twin");
    setPhoneNumber("");
    setEmail("");
    setNotes("");
    setCommission("");
    setFemalePilotsRequired(0);
    setShowAdditionalOptions(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[500px] rounded-2xl">
        <form onSubmit={handleSubmit} className="space-y-4 overflow-x-hidden px-1">
          {/* Customer Name */}
          <div className="space-y-2">
            <Label htmlFor="customerName" className="text-white">
              Customer Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="customerName"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />
          </div>

          {/* Number of People */}
          <div className="space-y-2">
            <Label htmlFor="numberOfPeople" className="text-white">
              Number of People <span className="text-red-500">*</span>
            </Label>
            <div className="overflow-x-auto">
              <div className="flex gap-2 pb-2">
                {Array.from({ length: 30 }, (_, i) => i + 1).map((num) => {
                  const isDisabled = num > availableSlots;
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => !isDisabled && setNumberOfPeople(num.toString())}
                      disabled={isDisabled}
                      className={`flex-shrink-0 w-12 h-12 rounded-lg font-medium transition-colors ${
                        numberOfPeople === num.toString()
                          ? "bg-white text-black"
                          : isDisabled
                          ? "bg-zinc-900 text-zinc-600 cursor-not-allowed"
                          : "bg-zinc-800 text-white hover:bg-zinc-700"
                      }`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Pickup Location */}
          <div className="space-y-2">
            <Label htmlFor="pickupLocation" className="text-white">
              Pickup Location <span className="text-red-500">*</span>
            </Label>
            <Input
              id="pickupLocation"
              value={pickupLocation}
              onChange={(e) => setPickupLocation(e.target.value)}
              required
            />
          </div>

          {/* Booking Source */}
          <BookingSourceAutocomplete
            value={bookingSource}
            onChange={setBookingSource}
            required
          />

          {/* Phone Number (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="phoneNumber" className="text-white">
              Phone Number
            </Label>
            <Input
              id="phoneNumber"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>

          {/* Email (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-white">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Additional Options - Collapsible */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowAdditionalOptions(!showAdditionalOptions)}
              className="flex items-center justify-between w-full text-white hover:text-zinc-300 transition-colors"
            >
              <span className="text-sm font-medium">Additional Options</span>
              {showAdditionalOptions ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showAdditionalOptions && (
              <div className="space-y-4 pt-2 border-t border-zinc-800">
                {/* Commission (Optional) */}
                <div className="space-y-2">
                  <Label htmlFor="commission" className="text-white">
                    Commission (per person)
                  </Label>
                  <Input
                    id="commission"
                    type="number"
                    step="0.01"
                    value={commission}
                    onChange={(e) => setCommission(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                {/* Lady Pilots Required */}
                <div className="space-y-2">
                  <Label className="text-white">
                    Lady Pilots Required
                    {availableFemalePilots > 0 && (
                      <span className="text-xs text-zinc-400 ml-2">
                        ({availableFemalePilots} available)
                      </span>
                    )}
                  </Label>
                  <div className="overflow-x-auto">
                    <div className="flex gap-2 pb-2">
                      {Array.from({ length: Math.min(parseInt(numberOfPeople) || 0, availableFemalePilots) + 1 }, (_, i) => i).map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setFemalePilotsRequired(num)}
                          className={`flex-shrink-0 w-12 h-12 rounded-lg font-medium transition-colors ${
                            femalePilotsRequired === num
                              ? "bg-white text-black"
                              : "bg-zinc-800 text-white hover:bg-zinc-700"
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Additional Notes (Optional) */}
                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-white">
                    Additional Notes
                  </Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button type="submit" className="flex-1 bg-white text-black hover:bg-zinc-200">
              Create Booking
            </Button>
            <Button type="button" variant="outline" onClick={handleCancel} className="flex-1 border-zinc-700 text-white hover:bg-zinc-800">
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

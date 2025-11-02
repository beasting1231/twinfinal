import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { format } from "date-fns";
import type { Pilot, Booking } from "../types/index";

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
  const [bookingStatus, setBookingStatus] = useState<"confirmed" | "pending" | "cancelled">("confirmed");
  const [selectedPilots, setSelectedPilots] = useState<string[]>([]);

  // Get pilots already assigned at this time
  const assignedPilotsAtThisTime = useMemo(() => {
    const bookingsAtThisTime = bookings.filter(b => b.timeIndex === timeIndex);
    const assigned = new Set<string>();
    bookingsAtThisTime.forEach(booking => {
      booking.assignedPilots.forEach(pilot => assigned.add(pilot));
    });
    return assigned;
  }, [bookings, timeIndex]);

  // Calculate available slots at this time based on actually available pilots
  const availableSlots = useMemo(() => {
    // Count pilots who are actually available at this time slot
    const actuallyAvailablePilots = pilots.filter((pilot) =>
      !assignedPilotsAtThisTime.has(pilot.displayName) &&
      isPilotAvailableForTimeSlot(pilot.uid, timeSlot)
    ).length;

    return actuallyAvailablePilots;
  }, [pilots, assignedPilotsAtThisTime, isPilotAvailableForTimeSlot, timeSlot]);

  // Get actually available pilots (not assigned and available for this time slot)
  const availablePilots = useMemo(() => {
    return pilots.filter((pilot) =>
      !assignedPilotsAtThisTime.has(pilot.displayName) &&
      isPilotAvailableForTimeSlot(pilot.uid, timeSlot)
    );
  }, [pilots, assignedPilotsAtThisTime, isPilotAvailableForTimeSlot, timeSlot]);

  // Calculate flight counts for each pilot for the selected day
  const pilotFlightCounts = useMemo(() => {
    const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
    const bookingsForDay = bookings.filter(b => b.date === selectedDateStr);

    const counts: Record<string, number> = {};
    bookingsForDay.forEach(booking => {
      booking.assignedPilots.forEach(pilotName => {
        counts[pilotName] = (counts[pilotName] || 0) + 1;
      });
    });
    return counts;
  }, [bookings, selectedDate]);

  const handleNumberOfPeopleChange = (value: string) => {
    setNumberOfPeople(value);
    // Clear selected pilots when changing number of people
    setSelectedPilots([]);
  };

  const handlePilotToggle = (pilotName: string) => {
    const numPeople = parseInt(numberOfPeople);
    if (isNaN(numPeople)) return;

    if (selectedPilots.includes(pilotName)) {
      setSelectedPilots(selectedPilots.filter(p => p !== pilotName));
    } else {
      // Only add if we haven't reached the number of people
      if (selectedPilots.length < numPeople) {
        setSelectedPilots([...selectedPilots, pilotName]);
      }
    }
  };

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

    // Validate against available slots
    if (numPeople > availableSlots) {
      alert(`Cannot book ${numPeople} ${numPeople === 1 ? 'passenger' : 'passengers'}. Only ${availableSlots} ${availableSlots === 1 ? 'slot is' : 'slots are'} available at this time.`);
      return;
    }

    // Validate that pilots are selected
    if (selectedPilots.length === 0) {
      alert("Please select at least one pilot");
      return;
    }

    // Calculate span based on selected pilots
    const span = selectedPilots.length;

    // Build booking object, only including optional fields if they have values
    const bookingData: any = {
      date: format(selectedDate, "yyyy-MM-dd"),
      pilotIndex,
      timeIndex,
      customerName: customerName.trim(),
      numberOfPeople: numPeople,
      pickupLocation: pickupLocation.trim(),
      bookingSource: bookingSource.trim(),
      assignedPilots: selectedPilots,
      bookingStatus,
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

    onSubmit(bookingData);

    // Reset form
    setCustomerName("");
    setNumberOfPeople("");
    setPickupLocation("HW");
    setBookingSource("twin");
    setPhoneNumber("");
    setEmail("");
    setNotes("");
    setBookingStatus("confirmed");
    setSelectedPilots([]);
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
    setBookingStatus("confirmed");
    setSelectedPilots([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[500px]">
        <DialogHeader>
          <DialogTitle>New Booking</DialogTitle>
          <DialogDescription>
            Create a new booking for {timeSlot}. Fill in the required fields marked with an asterisk.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-x-hidden">
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
                      onClick={() => !isDisabled && handleNumberOfPeopleChange(num.toString())}
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

          {/* Pilot Selection */}
          {numberOfPeople && parseInt(numberOfPeople) > 0 && (
            <div className="space-y-2">
              <Label className="text-white">
                Select Pilots <span className="text-red-500">*</span>
              </Label>
              <p className="text-xs text-zinc-500">
                Select {numberOfPeople} {parseInt(numberOfPeople) === 1 ? "pilot" : "pilots"} for this booking ({selectedPilots.length} selected)
              </p>
              <div className="grid grid-cols-2 gap-2">
                {availablePilots.map((pilot) => {
                    const isSelected = selectedPilots.includes(pilot.displayName);
                    const isDisabled = !isSelected && selectedPilots.length >= parseInt(numberOfPeople);
                    // Calculate flight count including current selection
                    const baseCount = pilotFlightCounts[pilot.displayName] || 0;
                    const adjustedCount = isSelected ? baseCount + 1 : baseCount;
                    return (
                      <button
                        key={pilot.uid}
                        type="button"
                        onClick={() => handlePilotToggle(pilot.displayName)}
                        disabled={isDisabled}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors text-left relative ${
                          isSelected
                            ? "bg-white text-black"
                            : isDisabled
                            ? "bg-zinc-900 text-zinc-600 cursor-not-allowed"
                            : "bg-zinc-800 text-white hover:bg-zinc-700"
                        }`}
                      >
                        {pilot.displayName}
                        {adjustedCount > 0 && (
                          <span className="absolute top-1 right-1 bg-blue-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                            {adjustedCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

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
          <div className="space-y-2">
            <Label htmlFor="bookingSource" className="text-white">
              Booking Source <span className="text-red-500">*</span>
            </Label>
            <Input
              id="bookingSource"
              value={bookingSource}
              onChange={(e) => setBookingSource(e.target.value)}
              required
            />
          </div>

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

          {/* Booking Status */}
          <div className="space-y-2">
            <Label htmlFor="bookingStatus" className="text-white">
              Booking Status
            </Label>
            <Select value={bookingStatus} onValueChange={(value: "confirmed" | "pending" | "cancelled") => setBookingStatus(value)}>
              <SelectTrigger id="bookingStatus">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
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

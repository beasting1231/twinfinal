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
  initialData?: {
    customerName?: string;
    numberOfPeople?: number;
    phoneNumber?: string;
    email?: string;
    notes?: string;
  };
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
  initialData,
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
  const [commissionStatus, setCommissionStatus] = useState<"paid" | "unpaid">("unpaid");
  const [femalePilotsRequired, setFemalePilotsRequired] = useState(0);
  const [flightType, setFlightType] = useState<"sensational" | "classic" | "early bird">("sensational");
  const [showAdditionalOptions, setShowAdditionalOptions] = useState(false);

  // Initialize form with initialData if provided
  useEffect(() => {
    if (open && initialData) {
      if (initialData.customerName) setCustomerName(initialData.customerName);
      if (initialData.numberOfPeople) setNumberOfPeople(String(initialData.numberOfPeople));
      if (initialData.phoneNumber) setPhoneNumber(initialData.phoneNumber);
      if (initialData.email) setEmail(initialData.email);
      if (initialData.notes) setNotes(initialData.notes);
    }
  }, [open, initialData]);

  const { startEditing, stopEditing } = useEditing();

  // Pause real-time updates when modal is open
  useEffect(() => {
    if (open) {
      startEditing();
    } else {
      stopEditing();
    }
  }, [open, startEditing, stopEditing]);

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
  // Use the same logic as BookingDetailsModal: total available pilots - total passengers booked
  const availableSlots = useMemo(() => {
    const dateString = format(selectedDate, "yyyy-MM-dd");

    // Count total pilots available at this time slot
    const totalAvailablePilots = pilots.filter((pilot) =>
      isPilotAvailableForTimeSlot(pilot.uid, timeSlot)
    ).length;

    // Get bookings at this specific time and date
    const bookingsAtThisTime = bookings.filter(
      b => b.timeIndex === timeIndex && b.date === dateString
    );

    // Count total passengers booked at this time (sum of numberOfPeople)
    const totalPassengersBooked = bookingsAtThisTime.reduce((sum, b) => {
      return sum + (b.numberOfPeople || 0);
    }, 0);

    // Available slots = total available pilots - total passengers already booked
    const available = totalAvailablePilots - totalPassengersBooked;

    return Math.max(0, available);
  }, [pilots, bookings, timeIndex, selectedDate, isPilotAvailableForTimeSlot, timeSlot]);

  // Calculate available female pilots at this time
  const availableFemalePilots = useMemo(() => {
    const dateString = format(selectedDate, "yyyy-MM-dd");

    // Get available female pilots at this time
    const availableFemalePilotsList = pilots.filter((pilot) =>
      pilot.femalePilot &&
      isPilotAvailableForTimeSlot(pilot.uid, timeSlot)
    );

    // Get bookings at this specific time and date
    const bookingsAtThisTime = bookings.filter(
      b => b.timeIndex === timeIndex && b.date === dateString
    );

    // Count how many female pilots are already assigned
    const assignedFemalePilots = new Set<string>();
    bookingsAtThisTime.forEach(b => {
      b.assignedPilots.forEach(pilotName => {
        const pilot = pilots.find(p => p.displayName === pilotName);
        if (pilot?.femalePilot) {
          assignedFemalePilots.add(pilotName);
        }
      });
    });

    return Math.max(0, availableFemalePilotsList.length - assignedFemalePilots.size);
  }, [pilots, bookings, timeIndex, selectedDate, isPilotAvailableForTimeSlot, timeSlot]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!numberOfPeople || !bookingSource.trim()) {
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
        isAvailable: isPilotAvailableForTimeSlot(pilot.uid, timeSlot) &&
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
      numberOfPeople: numPeople,
      bookingSource: bookingSource.trim(),
      assignedPilots: [], // Pilots will be assigned via the schedule grid
      bookingStatus: "unconfirmed",
      span,
    };

    // Only add optional fields if they have values
    if (customerName.trim()) {
      bookingData.customerName = customerName.trim();
    }
    if (pickupLocation.trim()) {
      bookingData.pickupLocation = pickupLocation.trim();
    }
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
        bookingData.commissionStatus = commissionStatus;
      }
    }
    if (femalePilotsRequired > 0) {
      bookingData.femalePilotsRequired = femalePilotsRequired;
    }
    if (flightType !== "sensational") {
      bookingData.flightType = flightType;
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
    setFlightType("sensational");
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
    setFlightType("sensational");
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
              Customer Name
            </Label>
            <Input
              id="customerName"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
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
              Pickup Location
            </Label>
            <Input
              id="pickupLocation"
              value={pickupLocation}
              onChange={(e) => setPickupLocation(e.target.value)}
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

                {/* Commission Status */}
                <div className="space-y-2">
                  <Label htmlFor="commissionStatus" className="text-white">
                    Commission Status
                  </Label>
                  <select
                    id="commissionStatus"
                    value={commissionStatus}
                    onChange={(e) => setCommissionStatus(e.target.value as "paid" | "unpaid")}
                    className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white ring-offset-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                  </select>
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

                {/* Flight Type */}
                <div className="space-y-2">
                  <Label className="text-white">
                    Flight Type
                  </Label>
                  <div className="flex gap-2">
                    {(["sensational", "classic", "early bird"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFlightType(type)}
                        className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors capitalize ${
                          flightType === type
                            ? "bg-white text-black"
                            : "bg-zinc-800 text-white hover:bg-zinc-700"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
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

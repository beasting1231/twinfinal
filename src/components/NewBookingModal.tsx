import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { format } from "date-fns";
import type { Pilot } from "../types/index";

interface NewBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date;
  pilotIndex: number;
  timeIndex: number;
  timeSlot: string;
  pilots: Pilot[];
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
  const [span, setSpan] = useState(1);

  // Automatically set span based on number of people
  const handleNumberOfPeopleChange = (value: string) => {
    setNumberOfPeople(value);
    const numPeople = parseInt(value);
    if (!isNaN(numPeople) && numPeople > 0) {
      // Calculate max available span
      const maxAvailable = Math.min(pilots.length - pilotIndex, pilots.length);
      // Set span to number of people, but not exceeding available pilots
      setSpan(Math.min(numPeople, maxAvailable));
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

    // Get assigned pilots based on span
    const assignedPilots: string[] = [];
    for (let i = 0; i < span; i++) {
      if (pilots[pilotIndex + i]) {
        assignedPilots.push(pilots[pilotIndex + i].displayName);
      }
    }

    // Build booking object, only including optional fields if they have values
    const bookingData: any = {
      date: format(selectedDate, "yyyy-MM-dd"),
      pilotIndex,
      timeIndex,
      customerName: customerName.trim(),
      numberOfPeople: numPeople,
      pickupLocation: pickupLocation.trim(),
      bookingSource: bookingSource.trim(),
      assignedPilots,
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
    setSpan(1);
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
    setSpan(1);
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

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Input
              id="numberOfPeople"
              type="number"
              min="1"
              value={numberOfPeople}
              onChange={(e) => handleNumberOfPeopleChange(e.target.value)}
              required
            />
            <p className="text-xs text-zinc-500">
              Will reserve {span} {span === 1 ? "pilot" : "pilots"} for this booking
            </p>
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

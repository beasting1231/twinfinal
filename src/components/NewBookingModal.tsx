import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ChevronDown, ChevronUp, Calendar } from "lucide-react";
import { format, parse } from "date-fns";
import type { Pilot, Booking } from "../types/index";
import { useEditing } from "../contexts/EditingContext";
import { useAuth } from "../contexts/AuthContext";
import { useRole } from "../hooks/useRole";
import { BookingSourceAutocomplete } from "./BookingSourceAutocomplete";
import { MeetingPointAutocomplete } from "./MeetingPointAutocomplete";
import { getTimeSlotsByDate } from "../utils/timeSlots";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";

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
  mode?: "booking" | "waitlist";
  onSubmitWaitlist?: (request: {
    customerName: string;
    email: string;
    phone?: string;
    date: string;
    time: string;
    timeIndex: number;
    availableTimes: string[];
    availableTimeIndices: number[];
    numberOfPeople: number;
    meetingPoint?: string;
    flightType?: "sensational" | "classic" | "early bird";
    notes?: string;
    bookingSource?: string;
    commission?: number;
    commissionStatus?: "paid" | "unpaid";
    status: "waitlist";
    createdAt: Date;
  }) => void;
  initialData?: {
    customerName?: string;
    numberOfPeople?: number;
    phoneNumber?: string;
    email?: string;
    notes?: string;
    flightType?: "sensational" | "classic" | "early bird";
    bookingSource?: string;
    commission?: number;
    commissionStatus?: "paid" | "unpaid";
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
  mode = "booking",
  onSubmitWaitlist,
  initialData,
}: NewBookingModalProps) {
  // Modal component for creating new bookings
  const [customerName, setCustomerName] = useState("");
  const [numberOfPeople, setNumberOfPeople] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [bookingSource, setBookingSource] = useState("twin");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [commission, setCommission] = useState("");
  const [commissionStatus, setCommissionStatus] = useState<"paid" | "unpaid">("unpaid");
  const [femalePilotsRequired, setFemalePilotsRequired] = useState(0);
  const [flightType, setFlightType] = useState<"sensational" | "classic" | "early bird">("sensational");
  const [showAdditionalOptions, setShowAdditionalOptions] = useState(false);
  const [initialAvailableSlots, setInitialAvailableSlots] = useState<number | null>(null);
  const [availabilityError, setAvailabilityError] = useState(false);

  // Modal-specific date and time selection
  const [selectedModalDate, setSelectedModalDate] = useState<string>("");
  const [selectedModalTimeIndex, setSelectedModalTimeIndex] = useState<number>(timeIndex);
  const [selectedWaitlistTimeIndices, setSelectedWaitlistTimeIndices] = useState<number[]>([]);
  const [timeOverrides, setTimeOverrides] = useState<Record<number, string>>({});
  const [additionalSlots, setAdditionalSlots] = useState<string[]>([]);

  // Initialize modal date and time when modal opens
  useEffect(() => {
    if (open) {
      setSelectedModalDate(format(selectedDate, "yyyy-MM-dd"));
      setSelectedModalTimeIndex(timeIndex);
      setSelectedWaitlistTimeIndices([timeIndex]);
      setAvailabilityError(false);
    }
  }, [open, selectedDate, timeIndex]);

  // Fetch time overrides and additional slots for the selected modal date
  useEffect(() => {
    if (!selectedModalDate) {
      setTimeOverrides({});
      setAdditionalSlots([]);
      return;
    }

    const timeOverridesRef = doc(db, "timeOverrides", selectedModalDate);
    const unsubscribe = onSnapshot(
      timeOverridesRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          setTimeOverrides(data.overrides || {});
          setAdditionalSlots(data.additionalSlots || []);
        } else {
          setTimeOverrides({});
          setAdditionalSlots([]);
        }
      },
      (error) => {
        console.error("Error fetching modal time overrides:", error);
        setTimeOverrides({});
        setAdditionalSlots([]);
      }
    );

    return () => unsubscribe();
  }, [selectedModalDate]);

  // Get time slots for the selected modal date
  const modalTimeSlots = useMemo(() => {
    if (!selectedModalDate) return [];
    try {
      const date = parse(selectedModalDate, "yyyy-MM-dd", new Date());
      return getTimeSlotsByDate(date);
    } catch {
      return [];
    }
  }, [selectedModalDate]);

  // Helper function to convert time string to minutes for sorting
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  // Build display slots with mapping to actual timeIndex and availability lookup time
  const displaySlotOptions = useMemo(() => {
    const baseSlots = modalTimeSlots.map((slot, index) => ({
      displayTime: timeOverrides[index] || slot,
      availabilityLookupTime: slot,
      actualTimeIndex: index,
    }));

    const extraSlots = additionalSlots.map((slot, index) => ({
      displayTime: slot,
      availabilityLookupTime: slot,
      actualTimeIndex: 1000 + index,
    }));

    const allSlots = [...baseSlots, ...extraSlots];
    allSlots.sort((a, b) => timeToMinutes(a.displayTime) - timeToMinutes(b.displayTime));
    return allSlots;
  }, [modalTimeSlots, timeOverrides, additionalSlots]);

  // Keep selected time valid when date/slot structure changes
  useEffect(() => {
    if (mode !== "booking") return;
    if (displaySlotOptions.length === 0) return;
    const selectedExists = displaySlotOptions.some(
      (slot) => slot.actualTimeIndex === selectedModalTimeIndex
    );
    if (!selectedExists) {
      setSelectedModalTimeIndex(displaySlotOptions[0].actualTimeIndex);
    }
  }, [displaySlotOptions, selectedModalTimeIndex]);

  useEffect(() => {
    if (mode !== "waitlist") return;
    if (displaySlotOptions.length === 0) return;

    setSelectedWaitlistTimeIndices((previous) => {
      const validTimeIndices = new Set(displaySlotOptions.map((slot) => slot.actualTimeIndex));
      const filtered = previous.filter((index) => validTimeIndices.has(index));
      if (filtered.length > 0) {
        return filtered;
      }
      return [displaySlotOptions[0].actualTimeIndex];
    });
  }, [mode, displaySlotOptions]);

  const selectedSlotOption = useMemo(() => {
    return displaySlotOptions.find((slot) => slot.actualTimeIndex === selectedModalTimeIndex);
  }, [displaySlotOptions, selectedModalTimeIndex]);

  // Get the current availability lookup time string
  const currentTimeSlot = useMemo(() => {
    return selectedSlotOption?.availabilityLookupTime || timeSlot;
  }, [selectedSlotOption, timeSlot]);

  const { startEditing, stopEditing } = useEditing();
  const { currentUser, userProfile } = useAuth();
  const { role } = useRole();

  // Determine the default booking source based on role
  // Admins default to "twin", non-admins use their display name
  const defaultBookingSource = role === 'admin'
    ? "twin"
    : (userProfile?.displayName || currentUser?.displayName || "");

  // Exclude deleted bookings from capacity calculations
  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => booking.bookingStatus !== "deleted");
  }, [bookings]);

  // Calculate availability for all time slots
  const timeSlotAvailability = useMemo(() => {
    if (!selectedModalDate) return [];

    return displaySlotOptions.map((slotOption) => {
      // Count total pilots available at this time slot
      const totalAvailablePilots = pilots.filter((pilot) =>
        isPilotAvailableForTimeSlot(pilot.uid, slotOption.availabilityLookupTime)
      ).length;

      // Get bookings at this specific time and date
      const bookingsAtThisTime = filteredBookings.filter(
        (b) => b.timeIndex === slotOption.actualTimeIndex && b.date === selectedModalDate
      );

      // Count total passengers booked at this time
      const totalPassengersBooked = bookingsAtThisTime.reduce((sum, b) => {
        return sum + (b.numberOfPeople || 0);
      }, 0);

      // Available slots = total available pilots - total passengers already booked
      const available = Math.max(0, totalAvailablePilots - totalPassengersBooked);

      return {
        timeSlot: slotOption.displayTime,
        actualTimeIndex: slotOption.actualTimeIndex,
        availableSpots: available,
      };
    });
  }, [displaySlotOptions, pilots, filteredBookings, selectedModalDate, isPilotAvailableForTimeSlot]);

  // Initialize form with initialData if provided, or reset to defaults
  useEffect(() => {
    if (open) {
      if (initialData) {
        // Set from initialData, using defaults for missing fields
        setCustomerName(initialData.customerName || "");
        setNumberOfPeople(initialData.numberOfPeople ? String(initialData.numberOfPeople) : "");
        setPhoneNumber(initialData.phoneNumber || "");
        setEmail(initialData.email || "");
        setNotes(initialData.notes || "");
        setFlightType(initialData.flightType || "sensational");
        // For non-admins, always use their display name regardless of initialData
        setBookingSource(role === 'admin' ? (initialData.bookingSource || "twin") : defaultBookingSource);
        // Keep defaults for fields not in initialData
        setPickupLocation("");
        // Set commission from initialData if provided
        setCommission(initialData.commission !== undefined ? String(initialData.commission) : "");
        setCommissionStatus(initialData.commissionStatus || "unpaid");
        setFemalePilotsRequired(0);
        // Auto-expand additional options if commission is set
        setShowAdditionalOptions(initialData.commission !== undefined && initialData.commission > 0);
      } else {
        // Reset to defaults when opening without initialData
        setCustomerName("");
        setNumberOfPeople("");
        setPickupLocation("");
        setBookingSource(defaultBookingSource);
        setPhoneNumber("");
        setEmail("");
        setNotes("");
        setCommission("");
        setCommissionStatus("unpaid");
        setFemalePilotsRequired(0);
        setFlightType("sensational");
        setShowAdditionalOptions(false);
      }
    }
  }, [open, initialData, role, defaultBookingSource]);

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
    const bookingsAtThisTime = filteredBookings.filter(b =>
      b.timeIndex === selectedModalTimeIndex &&
      b.date === selectedModalDate
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
  }, [filteredBookings, selectedModalTimeIndex, selectedModalDate]);

  // Calculate available slots at this time based on actually available pilots
  // Use the same logic as BookingDetailsModal: total available pilots - total passengers booked
  const availableSlots = useMemo(() => {
    // Count total pilots available at this time slot
    const totalAvailablePilots = pilots.filter((pilot) =>
      isPilotAvailableForTimeSlot(pilot.uid, currentTimeSlot)
    ).length;

    // Get bookings at this specific time and date
    const bookingsAtThisTime = filteredBookings.filter(
      b => b.timeIndex === selectedModalTimeIndex && b.date === selectedModalDate
    );

    // Count total passengers booked at this time (sum of numberOfPeople)
    const totalPassengersBooked = bookingsAtThisTime.reduce((sum, b) => {
      return sum + (b.numberOfPeople || 0);
    }, 0);

    // Available slots = total available pilots - total passengers already booked
    const available = totalAvailablePilots - totalPassengersBooked;

    return Math.max(0, available);
  }, [pilots, filteredBookings, selectedModalTimeIndex, selectedModalDate, isPilotAvailableForTimeSlot, currentTimeSlot]);

  // Calculate available female pilots at this time
  const availableFemalePilots = useMemo(() => {
    // Get available female pilots at this time
    const availableFemalePilotsList = pilots.filter((pilot) =>
      pilot.femalePilot &&
      isPilotAvailableForTimeSlot(pilot.uid, currentTimeSlot)
    );

    // Get bookings at this specific time and date
    const bookingsAtThisTime = filteredBookings.filter(
      b => b.timeIndex === selectedModalTimeIndex && b.date === selectedModalDate
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
  }, [pilots, filteredBookings, selectedModalTimeIndex, selectedModalDate, isPilotAvailableForTimeSlot, currentTimeSlot]);

  // Track initial available slots and monitor for changes
  useEffect(() => {
    if (open && initialAvailableSlots === null) {
      setInitialAvailableSlots(availableSlots);
    }
  }, [open, availableSlots, initialAvailableSlots]);

  // Monitor availability changes while booking
  useEffect(() => {
    if (open && numberOfPeople && initialAvailableSlots !== null) {
      const requestedSpots = parseInt(numberOfPeople);
      if (!isNaN(requestedSpots) && availableSlots < requestedSpots) {
        setAvailabilityError(true);
        // Only reset numberOfPeople for non-admin users
        if (role !== 'admin') {
          setNumberOfPeople(""); // Reset to force re-selection
        }
      } else {
        setAvailabilityError(false);
      }
    }
  }, [open, numberOfPeople, availableSlots, initialAvailableSlots, role]);

  // Reset initial availability when modal closes
  useEffect(() => {
    if (!open) {
      setInitialAvailableSlots(null);
    }
  }, [open]);

  const resetForm = () => {
    setCustomerName("");
    setNumberOfPeople("");
    setPickupLocation("");
    setBookingSource(defaultBookingSource);
    setPhoneNumber("");
    setEmail("");
    setNotes("");
    setCommission("");
    setFemalePilotsRequired(0);
    setFlightType("sensational");
    setShowAdditionalOptions(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!numberOfPeople || (mode === "booking" && !bookingSource.trim())) {
      alert("Please fill in all required fields");
      return;
    }

    const numPeople = parseInt(numberOfPeople);
    if (isNaN(numPeople) || numPeople < 1) {
      alert("Number of people must be a valid positive number");
      return;
    }

    if (mode === "waitlist") {
      if (!onSubmitWaitlist) {
        alert("Waitlist submission is not configured");
        return;
      }

      const selectedSlots = displaySlotOptions
        .filter((slot) => selectedWaitlistTimeIndices.includes(slot.actualTimeIndex))
        .sort((a, b) => timeToMinutes(a.displayTime) - timeToMinutes(b.displayTime));

      if (selectedSlots.length === 0) {
        alert("Please select at least one available time");
        return;
      }

      const waitlistData: {
        customerName: string;
        email: string;
        phone?: string;
        date: string;
        time: string;
        timeIndex: number;
        availableTimes: string[];
        availableTimeIndices: number[];
        numberOfPeople: number;
        meetingPoint?: string;
        flightType?: "sensational" | "classic" | "early bird";
        notes?: string;
        bookingSource?: string;
        commission?: number;
        commissionStatus?: "paid" | "unpaid";
        status: "waitlist";
        createdAt: Date;
      } = {
        customerName: customerName.trim() || "Unknown",
        email: email.trim(),
        phone: phoneNumber.trim() || undefined,
        date: selectedModalDate,
        time: selectedSlots.map((slot) => slot.displayTime).join(", "),
        timeIndex: selectedSlots[0].actualTimeIndex,
        availableTimes: selectedSlots.map((slot) => slot.displayTime),
        availableTimeIndices: selectedSlots.map((slot) => slot.actualTimeIndex),
        numberOfPeople: numPeople,
        notes: notes.trim() || undefined,
        status: "waitlist",
        createdAt: new Date(),
      };

      onSubmitWaitlist(waitlistData);
      resetForm();
      onOpenChange(false);
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
        isAvailable: isPilotAvailableForTimeSlot(pilot.uid, currentTimeSlot) &&
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
      date: selectedModalDate,
      pilotIndex: startingPilotIndex,
      timeIndex: selectedModalTimeIndex,
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
    resetForm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    // Reset form
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[90vw] max-w-[500px] rounded-2xl bg-white dark:bg-zinc-950 border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <form onSubmit={handleSubmit} className="space-y-4 overflow-x-hidden px-1">
          {/* Availability Error Message */}
          {mode === "booking" && availabilityError && (
            <div className={`p-3 rounded-lg border text-sm ${
              role === 'admin'
                ? 'bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-800 text-orange-900 dark:text-orange-200'
                : 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
            }`}>
              {role === 'admin' ? (
                <>
                  <strong>Overbooking Warning:</strong> You are booking more spots than currently available. The grid will expand to accommodate this booking.
                </>
              ) : (
                <>
                  Oops! These spots are no longer available. Availability has changed while you were creating the booking. Please select a different date/time or number of people.
                </>
              )}
            </div>
          )}

          {/* Date and Time Selection */}
          {mode === "booking" ? (
          <div className="grid grid-cols-2 gap-3 pb-2 border-b border-gray-300 dark:border-zinc-800">
            {/* Date Picker */}
            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-white">Date</Label>
              <div className="relative">
                <div
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 z-10 cursor-pointer"
                  onClick={() => {
                    const dateInput = document.getElementById('modal-date') as HTMLInputElement;
                    dateInput?.showPicker?.();
                  }}
                >
                  <Calendar className="w-4 h-4 text-gray-900 dark:text-white" />
                </div>
                <Input
                  id="modal-date"
                  type="date"
                  value={selectedModalDate}
                  onChange={(e) => {
                    setSelectedModalDate(e.target.value);
                    setInitialAvailableSlots(null); // Reset availability tracking
                  }}
                  className="pl-10 !h-10 !py-0 !text-sm flex items-center max-h-10 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-date-and-time-value]:!text-sm [&::-webkit-date-and-time-value]:leading-10 dark:[color-scheme:dark] [color-scheme:light]"
                  style={{
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    appearance: 'none',
                    fontSize: '14px',
                    lineHeight: '2.5rem'
                  } as React.CSSProperties}
                />
              </div>
            </div>

            {/* Time Dropdown */}
            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-white">Time</Label>
              <Select
                value={selectedModalTimeIndex.toString()}
                onValueChange={(value) => {
                  setSelectedModalTimeIndex(parseInt(value));
                  setInitialAvailableSlots(null); // Reset availability tracking
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="min-w-[280px]">
                  {timeSlotAvailability.map((slot) => {
                    const availableCount = slot.availableSpots;
                    const isDisabled = availableCount === 0;

                    return (
                      <SelectItem
                        key={slot.actualTimeIndex}
                        value={slot.actualTimeIndex.toString()}
                        disabled={isDisabled}
                        className={isDisabled ? "opacity-50 cursor-not-allowed" : ""}
                      >
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span className="flex-shrink-0">{slot.timeSlot}</span>
                          <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                            availableCount === 0
                              ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'
                              : 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400'
                          }`}>
                            {availableCount} available
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          ) : (
          <div className="space-y-3 pb-2 border-b border-gray-300 dark:border-zinc-800">
            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-white">
                Available Times <span className="text-red-500">*</span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {displaySlotOptions.map((slot) => {
                  const isSelected = selectedWaitlistTimeIndices.includes(slot.actualTimeIndex);
                  return (
                    <button
                      key={slot.actualTimeIndex}
                      type="button"
                      onClick={() => {
                        setSelectedWaitlistTimeIndices((previous) => (
                          previous.includes(slot.actualTimeIndex)
                            ? previous.filter((index) => index !== slot.actualTimeIndex)
                            : [...previous, slot.actualTimeIndex]
                        ));
                      }}
                      className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                        isSelected
                          ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                          : "bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {slot.displayTime}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          )}

          {/* Customer Name */}
          <div className="space-y-2">
            <Label htmlFor="customerName" className="text-gray-900 dark:text-white">
              Customer Name
            </Label>
            <Input
              id="customerName"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              autoComplete="off"
            />
          </div>

          {/* Number of People */}
          <div className="space-y-2">
            <Label htmlFor="numberOfPeople" className="text-gray-900 dark:text-white">
              Number of People <span className="text-red-500">*</span>
            </Label>
            <div className="overflow-x-auto">
              <div className="flex gap-2 pb-2">
                {Array.from({ length: 30 }, (_, i) => i + 1).map((num) => {
                  // Admins can overbook, regular users cannot
                  const isDisabled = mode === "booking" && role !== 'admin' && num > availableSlots;
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => !isDisabled && setNumberOfPeople(num.toString())}
                      disabled={isDisabled}
                      className={`flex-shrink-0 w-12 h-12 rounded-lg font-medium transition-colors ${
                        numberOfPeople === num.toString()
                          ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                          : isDisabled
                          ? "bg-gray-200 dark:bg-zinc-900 text-gray-400 dark:text-zinc-600 cursor-not-allowed"
                          : "bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {mode === "booking" && (
            <>
              {/* Meeting Point */}
              <MeetingPointAutocomplete
                value={pickupLocation}
                onChange={setPickupLocation}
              />

              {/* Booking Source */}
              {role === 'admin' ? (
                <BookingSourceAutocomplete
                  value={bookingSource}
                  onChange={setBookingSource}
                  required
                />
              ) : (
                <div className="space-y-2">
                  <Label className="text-gray-900 dark:text-white">
                    Booking Source <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={bookingSource}
                    readOnly
                    className="bg-gray-100 dark:bg-zinc-800 cursor-not-allowed"
                  />
                </div>
              )}
            </>
          )}

          {/* Phone Number (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="phoneNumber" className="text-gray-900 dark:text-white">
              Phone Number
            </Label>
            <Input
              id="phoneNumber"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              autoComplete="off"
            />
          </div>

          {/* Email (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-gray-900 dark:text-white">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </div>

          {mode === "booking" ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowAdditionalOptions(!showAdditionalOptions)}
                className="flex items-center justify-between w-full text-gray-900 dark:text-white hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
              >
                <span className="text-sm font-medium">Additional Options</span>
                {showAdditionalOptions ? (
                  <ChevronUp className="w-4 h-4 text-gray-600 dark:text-zinc-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-600 dark:text-zinc-400" />
                )}
              </button>

              {showAdditionalOptions && (
                <div className="space-y-4 pt-2 border-t border-gray-300 dark:border-zinc-800">
                  {/* Commission (Optional) */}
                  <div className="space-y-2">
                    <Label htmlFor="commission" className="text-gray-900 dark:text-white">
                      Commission (per person)
                    </Label>
                    <Input
                      id="commission"
                      type="number"
                      step="0.01"
                      value={commission}
                      onChange={(e) => setCommission(e.target.value)}
                      placeholder="0.00"
                      autoComplete="off"
                    />
                  </div>

                  {/* Commission Status */}
                  <div className="space-y-2">
                    <Label htmlFor="commissionStatus" className="text-gray-900 dark:text-white">
                      Commission Status
                    </Label>
                    <select
                      id="commissionStatus"
                      value={commissionStatus}
                      onChange={(e) => setCommissionStatus(e.target.value as "paid" | "unpaid")}
                      className="flex h-10 w-full rounded-md border border-gray-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-gray-900 dark:text-white ring-offset-white dark:ring-offset-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white focus-visible:ring-offset-2"
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>

                  {/* Lady Pilots Required */}
                  <div className="space-y-2">
                    <Label className="text-gray-900 dark:text-white">
                      Lady Pilots Required
                      {availableFemalePilots > 0 && (
                        <span className="text-xs text-gray-600 dark:text-zinc-400 ml-2">
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
                                ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                                : "bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700"
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
                    <Label className="text-gray-900 dark:text-white">
                      Flight Type
                    </Label>
                    <div className="flex gap-2">
                      {([
                        { type: "sensational", price: "CHF 180" },
                        { type: "classic", price: "CHF 170" },
                        { type: "early bird", price: "CHF 180" }
                      ] as const).map(({ type, price }) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFlightType(type)}
                          className={`flex-1 px-3 py-3 rounded-lg font-medium transition-colors ${
                            flightType === type
                              ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                              : "bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700"
                          }`}
                        >
                          <div className="capitalize text-sm">{type}</div>
                          <div className="text-xs mt-1 opacity-80">{price}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Additional Notes (Optional) */}
                  <div className="space-y-2">
                    <Label htmlFor="notes" className="text-gray-900 dark:text-white">
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
          ) : (
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-gray-900 dark:text-white">
                Notes
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button type="submit" className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-zinc-200">
              {mode === "waitlist" ? "Add to Waiting List" : "Create Booking"}
            </Button>
            <Button type="button" variant="outline" onClick={handleCancel} className="flex-1 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800">
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

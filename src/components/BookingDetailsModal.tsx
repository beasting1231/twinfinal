import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import type { Booking, Pilot, PilotPayment, ReceiptFile, UnavailablePilot } from "../types/index";
import { useAuth } from "../contexts/AuthContext";
import { Camera, Upload, Eye, Trash2, Calendar, Clock, MapPin, Users, Phone, Mail, FileText, User, PhoneCall, Send } from "lucide-react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";

interface BookingDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking | null;
  bookings: Booking[];
  pilots: Pilot[];
  isPilotAvailableForTimeSlot: (pilotUid: string, timeSlot: string) => boolean;
  unavailablePilots?: UnavailablePilot[];
  timeSlots: string[];
  onUpdate?: (id: string, booking: Partial<Booking>) => void;
  onDelete?: (id: string) => void;
}

export function BookingDetailsModal({
  open,
  onOpenChange,
  booking,
  bookings,
  pilots,
  isPilotAvailableForTimeSlot,
  timeSlots,
  onUpdate,
  onDelete,
}: BookingDetailsModalProps) {
  const { currentUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editedBooking, setEditedBooking] = useState<Booking | null>(null);
  const [pilotPayments, setPilotPayments] = useState<PilotPayment[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editedDateAvailability, setEditedDateAvailability] = useState<Map<string, Set<string>>>(new Map());

  // Get pilots already assigned at this time (excluding the current booking)
  // Use editedBooking when in edit mode to recalculate for new time/date
  const assignedPilotsAtThisTime = useMemo(() => {
    if (!booking) return new Set<string>();

    const targetTimeIndex = editedBooking?.timeIndex ?? booking.timeIndex;
    const targetDate = editedBooking?.date ?? booking.date;

    const bookingsAtThisTime = bookings.filter(
      b => b.timeIndex === targetTimeIndex && b.date === targetDate && b.id !== booking.id
    );
    const assigned = new Set<string>();
    bookingsAtThisTime.forEach(b => {
      b.assignedPilots.forEach(pilot => {
        if (pilot && pilot !== "") assigned.add(pilot);
      });
    });
    return assigned;
  }, [booking, editedBooking, bookings]);

  // Create an availability check function that uses edited date data when in edit mode
  const checkPilotAvailability = (pilotUid: string, timeSlot: string): boolean => {
    if (isEditing && editedBooking?.date !== booking?.date) {
      // Use fetched availability for edited date
      const slots = editedDateAvailability.get(pilotUid);
      return slots ? slots.has(timeSlot) : false;
    }
    // Use parent's availability check for current date
    return isPilotAvailableForTimeSlot(pilotUid, timeSlot);
  };

  // Calculate available slots for ALL time slots (for dropdown display)
  const availableSlotsPerTime = useMemo(() => {
    if (!booking || !editedBooking) return {};

    const targetDate = editedBooking.date;
    const slotsMap: Record<number, number> = {};

    timeSlots.forEach((timeSlot, timeIndex) => {
      // Get bookings at this specific time (excluding current booking)
      const bookingsAtThisTime = bookings.filter(
        b => b.timeIndex === timeIndex && b.date === targetDate && b.id !== booking.id
      );
      const assignedAtThisTime = new Set<string>();
      bookingsAtThisTime.forEach(b => {
        b.assignedPilots.forEach(pilot => {
          if (pilot && pilot !== "") assignedAtThisTime.add(pilot);
        });
      });

      // Count pilots available at this time slot
      const availablePilots = pilots.filter((pilot) =>
        !assignedAtThisTime.has(pilot.displayName) &&
        checkPilotAvailability(pilot.uid, timeSlot)
      ).length;

      slotsMap[timeIndex] = availablePilots;
    });

    return slotsMap;
  }, [booking, editedBooking, pilots, bookings, timeSlots, isEditing, editedDateAvailability, isPilotAvailableForTimeSlot]);

  // Calculate available slots at this time based on actually available pilots (excluding the current booking)
  // Use editedBooking when in edit mode to recalculate for new time/date
  const availableSlots = useMemo(() => {
    if (!booking) return 0;

    const targetTimeIndex = editedBooking?.timeIndex ?? booking.timeIndex;
    return availableSlotsPerTime[targetTimeIndex] ?? 0;
  }, [booking, editedBooking, availableSlotsPerTime]);

  // Calculate flight counts for each pilot for the booking's day
  // Use editedBooking when in edit mode to recalculate for new date
  const pilotFlightCounts = useMemo(() => {
    if (!booking) return {};

    const targetDate = editedBooking?.date ?? booking.date;
    const bookingsForDay = bookings.filter(b => b.date === targetDate);

    const counts: Record<string, number> = {};
    bookingsForDay.forEach(b => {
      b.assignedPilots.forEach(pilotName => {
        if (pilotName && pilotName !== "") {
          counts[pilotName] = (counts[pilotName] || 0) + 1;
        }
      });
    });
    return counts;
  }, [booking, editedBooking, bookings]);

  useEffect(() => {
    if (booking) {
      setEditedBooking(booking);
    }
  }, [booking]);

  useEffect(() => {
    if (!open) {
      setIsEditing(false);
    }
  }, [open]);

  // Fetch pilot availability for the edited date
  useEffect(() => {
    if (!editedBooking || !isEditing) return;

    async function fetchAvailabilityForEditedDate() {
      if (!editedBooking) return; // Additional null check for TypeScript

      try {
        const dateStr = editedBooking.date;

        // Query availability collection for the edited date
        const availabilityQuery = query(
          collection(db, "availability"),
          where("date", "==", dateStr)
        );

        const availabilitySnapshot = await getDocs(availabilityQuery);

        // Build availability map
        const availabilityMap = new Map<string, Set<string>>();
        availabilitySnapshot.docs.forEach((doc) => {
          const data = doc.data();
          if (!availabilityMap.has(data.userId)) {
            availabilityMap.set(data.userId, new Set());
          }
          availabilityMap.get(data.userId)!.add(data.timeSlot);
        });

        setEditedDateAvailability(availabilityMap);
      } catch (err) {
        console.error("Error fetching availability for edited date:", err);
      }
    }

    fetchAvailabilityForEditedDate();
  }, [editedBooking?.date, isEditing]);

  // Initialize pilot payments when booking changes
  useEffect(() => {
    if (booking) {
      // If booking has existing payment data, use it
      if (booking.pilotPayments) {
        setPilotPayments(booking.pilotPayments);
      } else {
        // Initialize empty payment data for each assigned pilot (excluding empty positions)
        const initialPayments: PilotPayment[] = booking.assignedPilots
          .filter(pilotName => pilotName && pilotName !== "")
          .map(pilotName => ({
            pilotName,
            amount: "",
            paymentMethod: "direkt" as const,
            receiptFiles: []
          }));
        setPilotPayments(initialPayments);
      }
    }
  }, [booking]);

  // Sort pilot payments to show current user's section first
  const sortedPilotPayments = useMemo(() => {
    if (!currentUser?.displayName) return pilotPayments;

    const currentUserPayment = pilotPayments.find(p => p.pilotName === currentUser.displayName);
    const otherPayments = pilotPayments.filter(p => p.pilotName !== currentUser.displayName);

    return currentUserPayment ? [currentUserPayment, ...otherPayments] : pilotPayments;
  }, [pilotPayments, currentUser?.displayName]);

  if (!booking || !editedBooking) return null;

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    if (booking.id && onUpdate) {
      // Validate against available slots only if pilots are being assigned
      if (editedBooking.assignedPilots.length > 0 && editedBooking.numberOfPeople > availableSlots) {
        alert(`Cannot book ${editedBooking.numberOfPeople} ${editedBooking.numberOfPeople === 1 ? 'passenger' : 'passengers'}. Only ${availableSlots} ${availableSlots === 1 ? 'slot is' : 'slots are'} available at this time.`);
        return;
      }

      // Build update object with only changed fields
      const updates: any = {};

      if (editedBooking.date !== booking.date) {
        updates.date = editedBooking.date;
      }
      if (editedBooking.timeIndex !== booking.timeIndex) {
        updates.timeIndex = editedBooking.timeIndex;
      }
      if (editedBooking.pilotIndex !== booking.pilotIndex) {
        updates.pilotIndex = editedBooking.pilotIndex;
      }
      if (editedBooking.customerName !== booking.customerName) {
        updates.customerName = editedBooking.customerName;
      }
      if (editedBooking.numberOfPeople !== booking.numberOfPeople) {
        updates.numberOfPeople = editedBooking.numberOfPeople;
      }
      if (editedBooking.pickupLocation !== booking.pickupLocation) {
        updates.pickupLocation = editedBooking.pickupLocation;
      }
      if (editedBooking.bookingSource !== booking.bookingSource) {
        updates.bookingSource = editedBooking.bookingSource;
      }
      if (editedBooking.phoneNumber !== booking.phoneNumber) {
        // Only include if not empty
        if (editedBooking.phoneNumber?.trim()) {
          updates.phoneNumber = editedBooking.phoneNumber.trim();
        }
      }
      if (editedBooking.email !== booking.email) {
        // Only include if not empty
        if (editedBooking.email?.trim()) {
          updates.email = editedBooking.email.trim();
        }
      }
      if (editedBooking.notes !== booking.notes) {
        // Only include if not empty
        if (editedBooking.notes?.trim()) {
          updates.notes = editedBooking.notes.trim();
        }
      }
      if (editedBooking.bookingStatus !== booking.bookingStatus) {
        updates.bookingStatus = editedBooking.bookingStatus;
      }
      if (editedBooking.span !== booking.span) {
        updates.span = editedBooking.span;
      }
      // Check if assignedPilots array has changed
      if (JSON.stringify(editedBooking.assignedPilots) !== JSON.stringify(booking.assignedPilots)) {
        updates.assignedPilots = editedBooking.assignedPilots;
      }

      onUpdate(booking.id, updates);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditedBooking(booking);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (booking.id && onDelete) {
      if (confirm("Are you sure you want to delete this booking?")) {
        onDelete(booking.id);
        onOpenChange(false);
      }
    }
  };

  const handlePaymentUpdate = (pilotName: string, field: keyof PilotPayment, value: any) => {
    setPilotPayments(prev =>
      prev.map(payment =>
        payment.pilotName === pilotName
          ? { ...payment, [field]: value }
          : payment
      )
    );
  };

  const handleImageUpload = (pilotName: string, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const receiptFile: ReceiptFile = {
        data: base64String,
        filename: file.name
      };
      setPilotPayments(prev =>
        prev.map(payment =>
          payment.pilotName === pilotName
            ? { ...payment, receiptFiles: [...(payment.receiptFiles || []), receiptFile] }
            : payment
        )
      );
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveReceipt = (pilotName: string, index: number) => {
    setPilotPayments(prev =>
      prev.map(payment =>
        payment.pilotName === pilotName
          ? { ...payment, receiptFiles: payment.receiptFiles?.filter((_, i) => i !== index) }
          : payment
      )
    );
  };

  const handleSavePayments = async () => {
    if (booking.id && onUpdate) {
      try {
        console.log("Saving payment details:", pilotPayments);

        // Convert to Firestore-compatible format using deep clone
        // This ensures all nested objects are plain JavaScript objects
        const firestoreCompatiblePayments = JSON.parse(JSON.stringify(pilotPayments.map(payment => ({
          pilotName: payment.pilotName,
          amount: typeof payment.amount === 'string'
            ? (payment.amount === '' || payment.amount === '-' ? 0 : parseFloat(payment.amount))
            : payment.amount,
          paymentMethod: payment.paymentMethod,
          receiptFiles: payment.receiptFiles || []
        }))));

        await onUpdate(booking.id, { pilotPayments: firestoreCompatiblePayments });
        onOpenChange(false);
      } catch (error) {
        console.error("Error saving payment details:", error);
        alert("Failed to save payment details. Please try again.");
      }
    } else {
      console.error("Cannot save: booking.id or onUpdate is missing", { bookingId: booking?.id, hasOnUpdate: !!onUpdate });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[600px] overflow-x-hidden allow-select">
        <DialogHeader>
          <DialogTitle>Booking Details</DialogTitle>
          <DialogDescription>
            View and manage booking information
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full overflow-x-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Booking Details</TabsTrigger>
            <TabsTrigger value="payment">Payment</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 overflow-x-hidden">
            {!isEditing ? (
              // DISPLAY MODE - Beautiful card layout
              <div className="space-y-3">
                {/* Status Badge */}
                <div className="flex items-center justify-between mb-4">
                  <div className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${
                    editedBooking.bookingStatus === 'confirmed'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : editedBooking.bookingStatus === 'pending'
                      ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {editedBooking.bookingStatus.charAt(0).toUpperCase() + editedBooking.bookingStatus.slice(1)}
                  </div>
                </div>

                {/* Customer Info Card */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-zinc-500 mb-1">Customer</div>
                      <div className="text-lg font-semibold text-white break-words">{editedBooking.customerName}</div>
                    </div>
                  </div>
                </div>

                {/* Date & Time Card */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-zinc-500 mb-2">
                      <Calendar className="w-4 h-4" />
                      <span className="text-xs">Date</span>
                    </div>
                    <div className="text-white font-medium">
                      {new Date(editedBooking.date + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                  </div>
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-zinc-500 mb-2">
                      <Clock className="w-4 h-4" />
                      <span className="text-xs">Time</span>
                    </div>
                    <div className="text-white font-medium">{timeSlots[editedBooking.timeIndex]}</div>
                  </div>
                </div>

                {/* Location & People */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-zinc-500 mb-2">
                      <MapPin className="w-4 h-4" />
                      <span className="text-xs">Location</span>
                    </div>
                    <div className="text-white font-medium break-words">{editedBooking.pickupLocation}</div>
                  </div>
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-zinc-500 mb-2">
                      <Users className="w-4 h-4" />
                      <span className="text-xs">Passengers</span>
                    </div>
                    <div className="text-white font-medium">{editedBooking.numberOfPeople}</div>
                  </div>
                </div>

                {/* Source */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-zinc-500 mb-2">
                    <FileText className="w-4 h-4" />
                    <span className="text-xs">Booking Source</span>
                  </div>
                  <div className="text-white font-medium">{editedBooking.bookingSource}</div>
                </div>

                {/* Contact Info */}
                {(editedBooking.phoneNumber || editedBooking.email) && (
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-3">
                    {editedBooking.phoneNumber && (
                      <div className="flex items-center gap-3">
                        <Phone className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-zinc-500 mb-0.5">Phone</div>
                          <div className="text-white break-words">
                            {editedBooking.phoneNumber}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <a
                            href={`https://wa.me/${editedBooking.phoneNumber.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg bg-[#25D366] hover:bg-[#20BA5A] text-white transition-colors"
                            title="WhatsApp"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                            </svg>
                          </a>
                          <a
                            href={`tel:${editedBooking.phoneNumber}`}
                            className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                            title="Call"
                          >
                            <PhoneCall className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    )}
                    {editedBooking.email && (
                      <div className="flex items-center gap-3">
                        <Mail className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-zinc-500 mb-0.5">Email</div>
                          <div className="text-white break-words">
                            {editedBooking.email}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <a
                            href={`mailto:${editedBooking.email}`}
                            className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                            title="Send Email"
                          >
                            <Send className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Assigned Pilots */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <div className="text-xs text-zinc-500 mb-3">Assigned Pilots</div>
                  <div className="flex gap-2 flex-wrap">
                    {booking.assignedPilots.filter(pilot => pilot && pilot !== "").map((pilot, index) => (
                      <div key={index} className="bg-zinc-800 text-white px-3 py-2 rounded-lg text-sm font-medium border border-zinc-700">
                        {pilot}
                      </div>
                    ))}
                    {booking.assignedPilots.filter(pilot => pilot && pilot !== "").length === 0 && (
                      <div className="text-zinc-500 text-sm">No pilots assigned</div>
                    )}
                  </div>
                </div>

                {/* Additional Notes */}
                {editedBooking.notes && (
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <div className="text-xs text-zinc-500 mb-2">Notes</div>
                    <div className="text-white text-sm leading-relaxed whitespace-pre-wrap break-words">{editedBooking.notes}</div>
                  </div>
                )}
              </div>
            ) : (
              // EDIT MODE - Form layout
              <div className="space-y-4">
                {/* Customer Name */}
                <div className="space-y-2">
                  <Label className="text-white">Customer Name</Label>
                  <Input
                    value={editedBooking.customerName}
                    onChange={(e) => setEditedBooking({ ...editedBooking, customerName: e.target.value })}
                  />
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <Label className="text-white">Date</Label>
                  <Input
                    type="date"
                    value={editedBooking.date}
                    onChange={(e) => {
                      // Clear assigned pilots when changing date as availability may differ
                      setEditedBooking({
                        ...editedBooking,
                        date: e.target.value,
                        assignedPilots: []
                      });
                    }}
                  />
                </div>

                {/* Time Slot */}
                <div className="space-y-2">
                  <Label className="text-white">Time Slot</Label>
                  <Select
                    value={editedBooking.timeIndex.toString()}
                    onValueChange={(value) => {
                      // Clear assigned pilots and reset position when changing time
                      setEditedBooking({
                        ...editedBooking,
                        timeIndex: parseInt(value),
                        pilotIndex: 0,
                        assignedPilots: []
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots.map((slot, index) => {
                        const availableCount = availableSlotsPerTime[index] ?? 0;
                        const requiredPilots = editedBooking.numberOfPeople;
                        const isDisabled = availableCount < requiredPilots;
                        return (
                          <SelectItem
                            key={index}
                            value={index.toString()}
                            disabled={isDisabled}
                            className={isDisabled ? "opacity-50 cursor-not-allowed" : ""}
                          >
                            <div className="flex items-center justify-between gap-4 w-full">
                              <span>{slot}</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                availableCount < requiredPilots
                                  ? 'bg-red-900/50 text-red-400'
                                  : availableCount <= requiredPilots + 1
                                  ? 'bg-yellow-900/50 text-yellow-400'
                                  : 'bg-green-900/50 text-green-400'
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

                {/* Available Slots Warning */}
                {availableSlots < editedBooking.numberOfPeople && (
                  <div className="bg-red-950 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
                    <p className="text-sm font-medium">
                      Insufficient pilots available at this time
                    </p>
                    <p className="text-xs mt-1">
                      This booking requires {editedBooking.numberOfPeople} {editedBooking.numberOfPeople === 1 ? 'pilot' : 'pilots'}, but only {availableSlots} {availableSlots === 1 ? 'is' : 'are'} available. Please select a different date or time slot.
                    </p>
                  </div>
                )}

                {/* Available Slots Info */}
                {availableSlots >= editedBooking.numberOfPeople && (
                  <div className="bg-blue-950 border border-blue-700 text-blue-200 px-4 py-3 rounded-lg">
                    <p className="text-sm">
                      {availableSlots} {availableSlots === 1 ? 'pilot is' : 'pilots are'} available at this time ({editedBooking.numberOfPeople} required)
                    </p>
                  </div>
                )}

                {/* Number of People */}
                <div className="space-y-2">
                  <Label className="text-white">Number of People</Label>
                  <div className="overflow-x-auto">
                    <div className="flex gap-2 pb-2">
                      {Array.from({ length: 30 }, (_, i) => i + 1).map((num) => {
                        const isDisabled = num > availableSlots;
                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() => {
                              if (!isDisabled) {
                                // Clear assigned pilots and update span when changing number of people
                                setEditedBooking({
                                  ...editedBooking,
                                  numberOfPeople: num,
                                  assignedPilots: [],
                                  span: num
                                });
                              }
                            }}
                            disabled={isDisabled}
                            className={`flex-shrink-0 w-12 h-12 rounded-lg font-medium transition-colors ${
                              editedBooking.numberOfPeople === num
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
                  <Label className="text-white">Pickup Location</Label>
                  <Input
                    value={editedBooking.pickupLocation}
                    onChange={(e) => setEditedBooking({ ...editedBooking, pickupLocation: e.target.value })}
                  />
                </div>

                {/* Booking Source */}
                <div className="space-y-2">
                  <Label className="text-white">Booking Source</Label>
                  <Input
                    value={editedBooking.bookingSource}
                    onChange={(e) => setEditedBooking({ ...editedBooking, bookingSource: e.target.value })}
                  />
                </div>

                {/* Phone Number */}
                <div className="space-y-2">
                  <Label className="text-white">Phone Number</Label>
                  <Input
                    type="tel"
                    value={editedBooking.phoneNumber || ""}
                    onChange={(e) => setEditedBooking({ ...editedBooking, phoneNumber: e.target.value })}
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label className="text-white">Email</Label>
                  <Input
                    type="email"
                    value={editedBooking.email || ""}
                    onChange={(e) => setEditedBooking({ ...editedBooking, email: e.target.value })}
                  />
                </div>

                {/* Assigned Pilots */}
                <div className="space-y-2">
                  <Label className="text-white">Assigned Pilots</Label>
                  <p className="text-xs text-zinc-500">
                    Select {editedBooking.numberOfPeople} {editedBooking.numberOfPeople === 1 ? "pilot" : "pilots"} ({editedBooking.assignedPilots.length} selected)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {pilots
                      .filter((pilot) => {
                        const timeSlot = timeSlots[editedBooking.timeIndex];
                        return !assignedPilotsAtThisTime.has(pilot.displayName) &&
                               checkPilotAvailability(pilot.uid, timeSlot);
                      })
                      .map((pilot) => {
                        const isSelected = editedBooking.assignedPilots.includes(pilot.displayName);
                        const isDisabled = !isSelected && editedBooking.assignedPilots.length >= editedBooking.numberOfPeople;
                        // Calculate flight count including current edits
                        const baseCount = pilotFlightCounts[pilot.displayName] || 0;
                        const wasOriginallyAssigned = booking.assignedPilots.includes(pilot.displayName);
                        let adjustedCount = baseCount;
                        if (isSelected && !wasOriginallyAssigned) {
                          // Newly added in this edit
                          adjustedCount = baseCount + 1;
                        } else if (!isSelected && wasOriginallyAssigned) {
                          // Was assigned but now removed in this edit
                          adjustedCount = baseCount - 1;
                        }
                        return (
                          <button
                            key={pilot.uid}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setEditedBooking({
                                  ...editedBooking,
                                  assignedPilots: editedBooking.assignedPilots.filter(p => p !== pilot.displayName)
                                });
                              } else if (!isDisabled) {
                                setEditedBooking({
                                  ...editedBooking,
                                  assignedPilots: [...editedBooking.assignedPilots, pilot.displayName]
                                });
                              }
                            }}
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

                {/* Booking Status */}
                <div className="space-y-2">
                  <Label className="text-white">Booking Status</Label>
                  <Select
                    value={editedBooking.bookingStatus}
                    onValueChange={(value: "confirmed" | "pending" | "cancelled") =>
                      setEditedBooking({ ...editedBooking, bookingStatus: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Additional Notes */}
                <div className="space-y-2">
                  <Label className="text-white">Additional Notes</Label>
                  <Textarea
                    value={editedBooking.notes || ""}
                    onChange={(e) => setEditedBooking({ ...editedBooking, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              {!isEditing ? (
                <>
                  <Button
                    onClick={handleEdit}
                    className="flex-1 bg-white text-black hover:bg-zinc-200"
                  >
                    Edit
                  </Button>
                  <Button
                    onClick={handleDelete}
                    variant="outline"
                    className="flex-1 border-red-700 text-red-500 hover:bg-red-950 hover:text-red-400"
                  >
                    Delete
                  </Button>
                  <Button
                    onClick={() => onOpenChange(false)}
                    variant="outline"
                    className="flex-1 border-zinc-700 text-white hover:bg-zinc-800"
                  >
                    Close
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={handleSave}
                    className="flex-1 bg-white text-black hover:bg-zinc-200"
                  >
                    Save
                  </Button>
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                    className="flex-1 border-zinc-700 text-white hover:bg-zinc-800"
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="payment" className="space-y-4 max-h-[60vh] overflow-y-auto">
            {pilotPayments.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                <p>No pilots assigned to this booking</p>
              </div>
            ) : (
              <>
                {sortedPilotPayments.map((payment, index) => {
                  const isCurrentUser = payment.pilotName === currentUser?.displayName;
                  return (<div
                    key={payment.pilotName}
                    className={`border rounded-lg p-4 space-y-4 ${
                      isCurrentUser
                        ? "border-blue-500 bg-blue-950/30"
                        : "border-zinc-700 bg-zinc-900/50"
                    }`}
                  >
                    {/* Pilot Name Header */}
                    <div className="flex items-center justify-between border-b border-zinc-700 pb-2">
                      <h3 className="text-white font-medium">
                        {payment.pilotName}
                        {isCurrentUser && (
                          <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-0.5 rounded">You</span>
                        )}
                      </h3>
                      <span className="text-xs text-zinc-500">Pilot #{index + 1}</span>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                      <Label className="text-white">Amount</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={payment.amount}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow empty string, negative sign, and valid numbers
                          if (value === '' || value === '-' || !isNaN(parseFloat(value))) {
                            handlePaymentUpdate(payment.pilotName, 'amount', value === '' || value === '-' ? value : parseFloat(value));
                          }
                        }}
                        placeholder="0.00"
                      />
                    </div>

                    {/* Payment Method Buttons */}
                    <div className="space-y-2">
                      <Label className="text-white">Payment Method</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handlePaymentUpdate(payment.pilotName, 'paymentMethod', 'direkt')}
                          className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                            payment.paymentMethod === 'direkt'
                              ? "bg-white text-black"
                              : "bg-zinc-800 text-white hover:bg-zinc-700"
                          }`}
                        >
                          Direkt
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePaymentUpdate(payment.pilotName, 'paymentMethod', 'ticket')}
                          className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                            payment.paymentMethod === 'ticket'
                              ? "bg-white text-black"
                              : "bg-zinc-800 text-white hover:bg-zinc-700"
                          }`}
                        >
                          Ticket
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePaymentUpdate(payment.pilotName, 'paymentMethod', 'ccp')}
                          className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                            payment.paymentMethod === 'ccp'
                              ? "bg-white text-black"
                              : "bg-zinc-800 text-white hover:bg-zinc-700"
                          }`}
                        >
                          CCP
                        </button>
                      </div>
                    </div>

                    {/* Conditional Image Upload for Ticket/CCP */}
                    {(payment.paymentMethod === 'ticket' || payment.paymentMethod === 'ccp') && (
                      <div className="space-y-3">
                        <Label className="text-white">Receipts/Tickets</Label>

                        {/* Upload Buttons */}
                        <div className="flex gap-2">
                          {/* Camera Button */}
                          <label className="flex-1">
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleImageUpload(payment.pilotName, file);
                                  e.target.value = '';
                                }
                              }}
                              className="hidden"
                            />
                            <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors bg-zinc-800 text-white hover:bg-zinc-700 cursor-pointer">
                              <Camera className="w-5 h-5" />
                              <span>Camera</span>
                            </div>
                          </label>

                          {/* Upload Button */}
                          <label className="flex-1">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleImageUpload(payment.pilotName, file);
                                  e.target.value = '';
                                }
                              }}
                              className="hidden"
                            />
                            <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors bg-zinc-800 text-white hover:bg-zinc-700 cursor-pointer">
                              <Upload className="w-5 h-5" />
                              <span>Upload</span>
                            </div>
                          </label>
                        </div>

                        {/* Receipt Files List */}
                        {payment.receiptFiles && payment.receiptFiles.length > 0 && (
                          <div className="space-y-2 mt-3">
                            {payment.receiptFiles.map((file, fileIndex) => (
                              <div
                                key={fileIndex}
                                className="flex items-center justify-between bg-zinc-800 rounded-lg p-3 border border-zinc-700"
                              >
                                <span className="text-white text-sm truncate flex-1 mr-3">
                                  {file.filename}
                                </span>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewImage(file.data)}
                                    className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                                    title="Preview"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveReceipt(payment.pilotName, fileIndex)}
                                    className="p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>);
                })}

                {/* Save Button */}
                <div className="pt-4 sticky bottom-0 bg-zinc-950 pb-2">
                  <Button
                    onClick={handleSavePayments}
                    className="w-full bg-white text-black hover:bg-zinc-200"
                  >
                    Save Payment Details
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* Image Preview Modal */}
      {previewImage && (
        <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
          <DialogContent className="max-w-[90vw] max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Receipt Preview</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center p-4">
              <img
                src={previewImage}
                alt="Receipt preview"
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setPreviewImage(null)}
                variant="outline"
                className="border-zinc-700 text-white hover:bg-zinc-800"
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}

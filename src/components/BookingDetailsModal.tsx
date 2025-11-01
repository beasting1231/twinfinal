import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import type { Booking, Pilot } from "../types/index";

interface BookingDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking | null;
  bookings: Booking[];
  pilots: Pilot[];
  isPilotAvailableForTimeSlot: (pilotUid: string, timeSlot: string) => boolean;
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
  const [isEditing, setIsEditing] = useState(false);
  const [editedBooking, setEditedBooking] = useState<Booking | null>(null);

  // Calculate available slots at this time (excluding the current booking)
  const availableSlots = useMemo(() => {
    if (!booking) return 0;

    // Get bookings at this time index, excluding the current booking
    const bookingsAtThisTime = bookings.filter(
      b => b.timeIndex === booking.timeIndex && b.id !== booking.id
    );

    // Calculate total occupied slots
    const occupiedSlots = bookingsAtThisTime.reduce((sum, b) => sum + b.span, 0);

    // Calculate how many slots are free from the booking position to the end
    const slotsFromThisPosition = pilots.length - booking.pilotIndex;
    const totalAvailable = pilots.length - occupiedSlots;

    // Return the minimum of slots available from this position and total available
    return Math.min(slotsFromThisPosition, totalAvailable);
  }, [booking, bookings, pilots.length]);

  // Get pilots already assigned at this time (excluding the current booking)
  const assignedPilotsAtThisTime = useMemo(() => {
    if (!booking) return new Set<string>();

    const bookingsAtThisTime = bookings.filter(
      b => b.timeIndex === booking.timeIndex && b.id !== booking.id
    );
    const assigned = new Set<string>();
    bookingsAtThisTime.forEach(b => {
      b.assignedPilots.forEach(pilot => assigned.add(pilot));
    });
    return assigned;
  }, [booking, bookings]);

  // Calculate flight counts for each pilot for the booking's day
  const pilotFlightCounts = useMemo(() => {
    if (!booking) return {};

    const bookingsForDay = bookings.filter(b => b.date === booking.date);

    const counts: Record<string, number> = {};
    bookingsForDay.forEach(b => {
      b.assignedPilots.forEach(pilotName => {
        counts[pilotName] = (counts[pilotName] || 0) + 1;
      });
    });
    return counts;
  }, [booking, bookings]);

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

  if (!booking || !editedBooking) return null;

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    if (booking.id && onUpdate) {
      // Validate pilots are selected
      if (editedBooking.assignedPilots.length === 0) {
        alert("Please select at least one pilot");
        return;
      }

      // Build update object with only changed fields
      const updates: any = {};

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[600px] overflow-x-hidden">
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
            {/* Customer Name */}
            <div className="space-y-2">
              <Label className="text-white">Customer Name</Label>
              <Input
                value={editedBooking.customerName}
                onChange={(e) => setEditedBooking({ ...editedBooking, customerName: e.target.value })}
                disabled={!isEditing}
              />
            </div>

            {/* Number of People */}
            <div className="space-y-2">
              <Label className="text-white">Number of People</Label>
              {isEditing ? (
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
                              // Clear assigned pilots when changing number of people
                              setEditedBooking({
                                ...editedBooking,
                                numberOfPeople: num,
                                assignedPilots: []
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
              ) : (
                <Input
                  type="number"
                  min="1"
                  value={editedBooking.numberOfPeople}
                  disabled={true}
                />
              )}
            </div>

            {/* Pickup Location */}
            <div className="space-y-2">
              <Label className="text-white">Pickup Location</Label>
              <Input
                value={editedBooking.pickupLocation}
                onChange={(e) => setEditedBooking({ ...editedBooking, pickupLocation: e.target.value })}
                disabled={!isEditing}
              />
            </div>

            {/* Booking Source */}
            <div className="space-y-2">
              <Label className="text-white">Booking Source</Label>
              <Input
                value={editedBooking.bookingSource}
                onChange={(e) => setEditedBooking({ ...editedBooking, bookingSource: e.target.value })}
                disabled={!isEditing}
              />
            </div>

            {/* Phone Number */}
            <div className="space-y-2">
              <Label className="text-white">Phone Number</Label>
              <Input
                type="tel"
                value={editedBooking.phoneNumber || ""}
                onChange={(e) => setEditedBooking({ ...editedBooking, phoneNumber: e.target.value })}
                disabled={!isEditing}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label className="text-white">Email</Label>
              <Input
                type="email"
                value={editedBooking.email || ""}
                onChange={(e) => setEditedBooking({ ...editedBooking, email: e.target.value })}
                disabled={!isEditing}
              />
            </div>

            {/* Assigned Pilots */}
            <div className="space-y-2">
              <Label className="text-white">Assigned Pilots</Label>
              {isEditing ? (
                <>
                  <p className="text-xs text-zinc-500">
                    Select {editedBooking.numberOfPeople} {editedBooking.numberOfPeople === 1 ? "pilot" : "pilots"} ({editedBooking.assignedPilots.length} selected)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {pilots
                      .filter((pilot) => {
                        const timeSlot = timeSlots[booking.timeIndex];
                        return !assignedPilotsAtThisTime.has(pilot.displayName) &&
                               isPilotAvailableForTimeSlot(pilot.uid, timeSlot);
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
                                  assignedPilots: editedBooking.assignedPilots.filter(p => p !== pilot.displayName),
                                  span: editedBooking.assignedPilots.length - 1
                                });
                              } else if (!isDisabled) {
                                setEditedBooking({
                                  ...editedBooking,
                                  assignedPilots: [...editedBooking.assignedPilots, pilot.displayName],
                                  span: editedBooking.assignedPilots.length + 1
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
                </>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {booking.assignedPilots.map((pilot, index) => (
                    <div key={index} className="bg-zinc-700 text-white px-3 py-1.5 rounded-md text-sm">
                      {pilot}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Booking Status */}
            <div className="space-y-2">
              <Label className="text-white">Booking Status</Label>
              <Select
                value={editedBooking.bookingStatus}
                onValueChange={(value: "confirmed" | "pending" | "cancelled") =>
                  setEditedBooking({ ...editedBooking, bookingStatus: value })
                }
                disabled={!isEditing}
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
                disabled={!isEditing}
                rows={3}
              />
            </div>

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

          <TabsContent value="payment" className="space-y-4">
            <div className="text-center py-12 text-zinc-500">
              <p>Payment information will be available soon</p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

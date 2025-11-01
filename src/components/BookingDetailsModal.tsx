import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import type { Booking } from "../types/index";

interface BookingDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Booking | null;
  onUpdate?: (id: string, booking: Partial<Booking>) => void;
  onDelete?: (id: string) => void;
}

export function BookingDetailsModal({
  open,
  onOpenChange,
  booking,
  onUpdate,
  onDelete,
}: BookingDetailsModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedBooking, setEditedBooking] = useState<Booking | null>(null);

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
      <DialogContent className="w-[90vw] max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Booking Details</DialogTitle>
          <DialogDescription>
            View and manage booking information
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Booking Details</TabsTrigger>
            <TabsTrigger value="payment">Payment</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
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
              <Input
                type="number"
                min="1"
                value={editedBooking.numberOfPeople}
                onChange={(e) => setEditedBooking({ ...editedBooking, numberOfPeople: parseInt(e.target.value) })}
                disabled={!isEditing}
              />
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
              <div className="flex gap-2 flex-wrap">
                {booking.assignedPilots.map((pilot, index) => (
                  <div key={index} className="bg-zinc-700 text-white px-3 py-1.5 rounded-md text-sm">
                    {pilot}
                  </div>
                ))}
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

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { Button } from "./ui/button";
import type { BookingRequest } from "../types/index";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

interface BookingRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: BookingRequest | null;
  onApprove?: (request: BookingRequest) => void;
}

export function BookingRequestModal({
  open,
  onOpenChange,
  request,
  onApprove,
}: BookingRequestModalProps) {
  const [processing, setProcessing] = useState(false);

  if (!request) return null;

  const handleApprove = async () => {
    setProcessing(true);
    try {
      // Update the request status to approved
      await updateDoc(doc(db, "bookingRequests", request.id!), {
        status: "approved",
      });

      // Call the onApprove callback if provided (to create a booking)
      if (onApprove) {
        onApprove(request);
      }

      onOpenChange(false);
    } catch (error) {
      console.error("Error approving request:", error);
      alert("Failed to approve request");
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    setProcessing(true);
    try {
      // Update the request status to rejected
      await updateDoc(doc(db, "bookingRequests", request.id!), {
        status: "rejected",
      });

      onOpenChange(false);
    } catch (error) {
      console.error("Error rejecting request:", error);
      alert("Failed to reject request");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-800 text-gray-900 dark:text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">Booking Request</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-zinc-400">Customer Name</label>
              <p className="text-gray-900 dark:text-white">{request.customerName}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-zinc-400">Email</label>
              <p className="text-gray-900 dark:text-white">{request.email}</p>
            </div>
          </div>

          {request.phone && (
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-zinc-400">Phone</label>
              <p className="text-gray-900 dark:text-white">{request.phone}</p>
            </div>
          )}

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-zinc-400">Date</label>
              <p className="text-gray-900 dark:text-white">{request.date}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-zinc-400">Preferred Time</label>
              <p className="text-gray-900 dark:text-white">{request.time}</p>
            </div>
          </div>

          {/* Number of People */}
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-zinc-400">Number of People</label>
            <p className="text-gray-900 dark:text-white">{request.numberOfPeople}</p>
          </div>

          {/* Flight Type */}
          {request.flightType && (
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-zinc-400">Flight Type</label>
              <p className="text-gray-900 dark:text-white capitalize">{request.flightType}</p>
            </div>
          )}

          {/* Notes */}
          {request.notes && (
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-zinc-400">Additional Notes</label>
              <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{request.notes}</p>
            </div>
          )}

          {/* Submission Time */}
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-zinc-400">Submitted</label>
            <p className="text-gray-900 dark:text-white">
              {new Date(request.createdAt).toLocaleString()}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleApprove}
              disabled={processing}
              className="flex-1 bg-green-600 dark:bg-green-600 hover:bg-green-700 dark:hover:bg-green-700 text-white"
            >
              {processing ? "Processing..." : "Approve & Create Booking"}
            </Button>
            <Button
              onClick={handleReject}
              disabled={processing}
              variant="outline"
              className="flex-1 border-red-600 dark:border-red-600 text-red-600 dark:text-red-600 hover:bg-red-50 dark:hover:bg-red-600 hover:text-red-700 dark:hover:text-white"
            >
              {processing ? "Processing..." : "Reject"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

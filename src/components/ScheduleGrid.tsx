import { useState } from "react";
import { BookingAvailable } from "./BookingAvailable";
import { NewBookingModal } from "./NewBookingModal";
import { BookingDetailsModal } from "./BookingDetailsModal";
import type { Booking, UnavailablePilot, Pilot } from "../types/index";

interface ScheduleGridProps {
  selectedDate: Date;
  pilots: Pilot[];
  timeSlots: string[];
  bookings?: Booking[];
  unavailablePilots?: UnavailablePilot[];
  isPilotAvailableForTimeSlot: (pilotUid: string, timeSlot: string) => boolean;
  loading?: boolean;
  onAddBooking?: (booking: Omit<Booking, "id">) => void;
  onUpdateBooking?: (id: string, booking: Partial<Booking>) => void;
  onDeleteBooking?: (id: string) => void;
}

export function ScheduleGrid({ selectedDate, pilots, timeSlots, bookings = [], unavailablePilots = [], isPilotAvailableForTimeSlot, loading = false, onAddBooking, onUpdateBooking, onDeleteBooking }: ScheduleGridProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ pilotIndex: number; timeIndex: number; timeSlot: string } | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const handleAvailableCellClick = (pilotIndex: number, timeIndex: number, timeSlot: string) => {
    setSelectedCell({ pilotIndex, timeIndex, timeSlot });
    setIsModalOpen(true);
  };

  const handleBookedCellClick = (booking: Booking) => {
    setSelectedBooking(booking);
    setIsDetailsModalOpen(true);
  };

  const handleBookingSubmit = (booking: Omit<Booking, "id">) => {
    if (onAddBooking) {
      onAddBooking(booking);
    }
  };

  // Show skeleton loader while loading
  if (loading) {
    return (
      <div className="flex-1 overflow-auto p-4 bg-zinc-950">
        <div className="inline-block">
          <div className="grid gap-2" style={{ gridTemplateColumns: `80px repeat(5, 220px)` }}>
            {/* Header Row Skeleton */}
            <div className="h-7" />
            <div className="h-7 bg-zinc-900 rounded-lg animate-pulse" />
            <div className="h-7 bg-zinc-900 rounded-lg animate-pulse" />
            <div className="h-7 bg-zinc-900 rounded-lg animate-pulse" />
            <div className="h-7 bg-zinc-900 rounded-lg animate-pulse" />
            <div className="h-7 bg-zinc-900 rounded-lg animate-pulse" />

            {/* Time Slot Rows Skeleton */}
            {timeSlots.map((_timeSlot, index) => (
              <div key={index} className="contents">
                {/* Time label skeleton */}
                <div className="h-14 bg-zinc-900 rounded-lg animate-pulse" />
                {/* Skeleton cells */}
                <div className="h-14 bg-zinc-800 rounded-lg animate-pulse" />
                <div className="h-14 bg-zinc-800 rounded-lg animate-pulse" />
                <div className="h-14 bg-zinc-800 rounded-lg animate-pulse" />
                <div className="h-14 bg-zinc-800 rounded-lg animate-pulse" />
                <div className="h-14 bg-zinc-800 rounded-lg animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Show empty state if no pilots are available
  if (pilots.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <div className="text-center">
          <p className="text-zinc-400 text-lg mb-2">No pilots available for this date</p>
          <p className="text-zinc-500 text-sm">Pilots can mark their availability in the Availability screen</p>
        </div>
      </div>
    );
  }

  // Helper function to check if a cell is booked
  const getBooking = (pilotIndex: number, timeIndex: number) => {
    return bookings.find(
      booking => booking.pilotIndex === pilotIndex && booking.timeIndex === timeIndex
    );
  };

  // Helper function to check if a cell is occupied by a spanning booking
  const isCellOccupied = (pilotIndex: number, timeIndex: number) => {
    return bookings.some(booking => {
      const bookingStart = booking.pilotIndex;
      const bookingEnd = booking.pilotIndex + (booking.span || 1) - 1;
      return booking.timeIndex === timeIndex && pilotIndex > bookingStart && pilotIndex <= bookingEnd;
    });
  };

  // Helper function to check if a pilot is unavailable at a specific time
  const isPilotUnavailable = (pilotIndex: number, timeIndex: number) => {
    return unavailablePilots.some(
      unavailable => unavailable.pilotIndex === pilotIndex && unavailable.timeIndex === timeIndex
    );
  };

  return (
    <div className="flex-1 overflow-auto p-4 bg-zinc-950">
      <div className="inline-block">
        <div className="grid gap-2" style={{ gridTemplateColumns: `80px repeat(${pilots.length}, 220px)` }}>
          {/* Header Row */}
          {/* Empty cell for top-left corner */}
          <div className="h-7" />

          {/* Pilot Headers */}
          {pilots.map((p) => (
            <div
              key={p.uid}
              className="h-7 flex items-center justify-center bg-zinc-900 rounded-lg font-medium text-sm"
            >
              {p.displayName}
            </div>
          ))}

          {/* Time Slots and Booking Cells */}
          {timeSlots.map((timeSlot, timeIndex) => {
            // Sort pilots for this specific time slot: available first, then unavailable
            const sortedPilotsForSlot = [...pilots].sort((a, b) => {
              const aAvailable = isPilotAvailableForTimeSlot(a.uid, timeSlot);
              const bAvailable = isPilotAvailableForTimeSlot(b.uid, timeSlot);

              // Available pilots come first (left side)
              if (aAvailable && !bAvailable) return -1;
              if (!aAvailable && bAvailable) return 1;

              // If both have same availability, maintain original order
              return 0;
            });

            return [
              // Time Slot Label
              <div
                key={`time-${timeIndex}`}
                className="h-14 flex items-center justify-center bg-zinc-900 rounded-lg font-medium text-sm"
              >
                {timeSlot}
              </div>,

              // Booking Cells for each pilot
              ...sortedPilotsForSlot.map((pilot) => {
                  // Find the original pilot index for booking lookups
                  const pilotIndex = pilots.findIndex(p => p.uid === pilot.uid);

                  // Skip cells that are occupied by a spanning booking
                  if (isCellOccupied(pilotIndex, timeIndex)) {
                    return null;
                  }

                  const booking = getBooking(pilotIndex, timeIndex);
                  const span = booking?.span || 1;
                  const isUnavailable = isPilotUnavailable(pilotIndex, timeIndex);

                  // Check if pilot is available for this specific time slot
                  const isPilotAvailableThisSlot = isPilotAvailableForTimeSlot(pilot.uid, timeSlot);

                  // Determine cell status
                  let cellStatus: "available" | "booked" | "noPilot" = "available";
                  if (booking) {
                    cellStatus = "booked";
                  } else if (isUnavailable || !isPilotAvailableThisSlot) {
                    cellStatus = "noPilot";
                  }

                  return (
                    <div
                      key={`cell-${timeIndex}-${pilot.uid}`}
                      className="h-14"
                      style={{ gridColumn: `span ${span}` }}
                    >
                      <BookingAvailable
                        pilotId={pilot.displayName}
                        timeSlot={timeSlot}
                        status={cellStatus}
                        customerName={booking?.customerName}
                        pickupLocation={booking?.pickupLocation}
                        assignedPilots={booking?.assignedPilots}
                        pilotPayments={booking?.pilotPayments}
                        bookingStatus={booking?.bookingStatus}
                        span={span}
                        onAvailableClick={
                          cellStatus === "available"
                            ? () => handleAvailableCellClick(pilotIndex, timeIndex, timeSlot)
                            : undefined
                        }
                        onBookedClick={
                          cellStatus === "booked" && booking
                            ? () => handleBookedCellClick(booking)
                            : undefined
                        }
                      />
                    </div>
                  );
              })
            ];
          })}
        </div>
      </div>

      {selectedCell && (
        <NewBookingModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          selectedDate={selectedDate}
          pilotIndex={selectedCell.pilotIndex}
          timeIndex={selectedCell.timeIndex}
          timeSlot={selectedCell.timeSlot}
          pilots={pilots}
          bookings={bookings}
          isPilotAvailableForTimeSlot={isPilotAvailableForTimeSlot}
          onSubmit={handleBookingSubmit}
        />
      )}

      <BookingDetailsModal
        open={isDetailsModalOpen}
        onOpenChange={setIsDetailsModalOpen}
        booking={selectedBooking}
        bookings={bookings}
        pilots={pilots}
        isPilotAvailableForTimeSlot={isPilotAvailableForTimeSlot}
        timeSlots={timeSlots}
        onUpdate={onUpdateBooking}
        onDelete={onDeleteBooking}
      />
    </div>
  );
}

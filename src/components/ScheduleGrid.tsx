import { BookingAvailable } from "./BookingAvailable";
import type { Booking, UnavailablePilot, Pilot } from "../types/index";

interface ScheduleGridProps {
  pilots: Pilot[];
  timeSlots: string[];
  bookings?: Booking[];
  unavailablePilots?: UnavailablePilot[];
  isPilotAvailableForTimeSlot: (pilotUid: string, timeSlot: string) => boolean;
}

export function ScheduleGrid({ pilots, timeSlots, bookings = [], unavailablePilots = [], isPilotAvailableForTimeSlot }: ScheduleGridProps) {
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
          <div className="h-14" />

          {/* Pilot Headers */}
          {pilots.map((p, index) => (
            <div
              key={p.uid}
              className="h-14 flex items-center justify-center bg-zinc-900 rounded-lg font-medium"
            >
              {p.displayName}
            </div>
          ))}

          {/* Time Slots and Booking Cells */}
          {timeSlots.map((timeSlot, timeIndex) => (
            <>
              {/* Time Slot Label */}
              <div
                key={`time-${timeIndex}`}
                className="h-14 flex items-center justify-center bg-zinc-900 rounded-lg font-medium text-sm"
              >
                {timeSlot}
              </div>

              {/* Booking Cells for each pilot */}
              {pilots.map((pilot, pilotIndex) => {
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
                      bookingStatus={booking?.bookingStatus}
                      span={span}
                    />
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}

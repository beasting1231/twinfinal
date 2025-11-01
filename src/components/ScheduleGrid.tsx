import { BookingAvailable } from "./BookingAvailable";

interface ScheduleGridProps {
  pilots: string[];
  timeSlots: string[];
}

// Mock booking data
const mockBookings = [
  { pilotIndex: 0, timeIndex: 1, customerName: "Sarah Johnson", pickupLocation: "Downtown Helipad", assignedPilots: ["Pilot 1"], bookingStatus: "confirmed" as const, span: 1, status: "booked" as const },
  { pilotIndex: 0, timeIndex: 3, customerName: "Michael Chen", pickupLocation: "Airport Terminal", assignedPilots: ["Pilot 1", "Pilot 2"], bookingStatus: "pending" as const, span: 2, status: "booked" as const },
  { pilotIndex: 2, timeIndex: 4, customerName: "David Kim", pickupLocation: "City Center", assignedPilots: ["Pilot 3"], bookingStatus: "cancelled" as const, span: 1, status: "booked" as const },
  { pilotIndex: 1, timeIndex: 2, customerName: "Alex Thompson", pickupLocation: "Hotel Rooftop", assignedPilots: ["Pilot 2"], bookingStatus: "pending" as const, span: 1, status: "booked" as const },
  { pilotIndex: 0, timeIndex: 0, customerName: "Corporate Group", pickupLocation: "Business District", assignedPilots: ["Pilot 1", "Pilot 2", "Pilot 3"], bookingStatus: "confirmed" as const, span: 3, status: "booked" as const },
];

// Mock unavailable pilots (signed out for specific time slots)
const mockUnavailablePilots = [
  { pilotIndex: 1, timeIndex: 1 }, // Pilot 2 unavailable at time slot 1
  { pilotIndex: 2, timeIndex: 1 }, // Pilot 3 unavailable at time slot 1
  { pilotIndex: 2, timeIndex: 3 }, // Pilot 3 unavailable at time slot 3
];

export function ScheduleGrid({ pilots, timeSlots }: ScheduleGridProps) {
  // Helper function to check if a cell is booked
  const getBooking = (pilotIndex: number, timeIndex: number) => {
    return mockBookings.find(
      booking => booking.pilotIndex === pilotIndex && booking.timeIndex === timeIndex
    );
  };

  // Helper function to check if a cell is occupied by a spanning booking
  const isCellOccupied = (pilotIndex: number, timeIndex: number) => {
    return mockBookings.some(booking => {
      const bookingStart = booking.pilotIndex;
      const bookingEnd = booking.pilotIndex + (booking.span || 1) - 1;
      return booking.timeIndex === timeIndex && pilotIndex > bookingStart && pilotIndex <= bookingEnd;
    });
  };

  // Helper function to check if a pilot is unavailable at a specific time
  const isPilotUnavailable = (pilotIndex: number, timeIndex: number) => {
    return mockUnavailablePilots.some(
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
          {pilots.map((pilot, index) => (
            <div
              key={index}
              className="h-14 flex items-center justify-center bg-zinc-900 rounded-lg font-medium"
            >
              {pilot}
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

                // Determine cell status
                let cellStatus: "available" | "booked" | "noPilot" = "available";
                if (booking) {
                  cellStatus = "booked";
                } else if (isUnavailable) {
                  cellStatus = "noPilot";
                }

                return (
                  <div
                    key={`cell-${timeIndex}-${pilotIndex}`}
                    className="h-14"
                    style={{ gridColumn: `span ${span}` }}
                  >
                    <BookingAvailable
                      pilotId={pilot}
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

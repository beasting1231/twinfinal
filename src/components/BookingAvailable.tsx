import type { PilotPayment } from "../types/index";

interface BookingAvailableProps {
  pilotId: string;
  timeSlot: string;
  status?: "available" | "booked" | "noPilot";
  customerName?: string;
  pickupLocation?: string;
  assignedPilots?: string[];
  pilotPayments?: PilotPayment[];
  bookingStatus?: "confirmed" | "pending" | "cancelled";
  span?: number;
  onAvailableClick?: () => void;
  onBookedClick?: () => void;
}

export function BookingAvailable({
  pilotId,
  status = "available",
  customerName,
  pickupLocation,
  assignedPilots = [],
  pilotPayments = [],
  bookingStatus = "confirmed",
  span = 1,
  onAvailableClick,
  onBookedClick
}: BookingAvailableProps) {
  if (status === "booked") {
    const statusColors = {
      confirmed: "bg-green-500",
      pending: "bg-yellow-500",
      cancelled: "bg-red-500"
    };

    return (
      <div
        className="w-full h-full bg-blue-900/40 border border-blue-700/50 rounded-lg pt-2 px-2 flex flex-col justify-between cursor-pointer hover:bg-blue-900/50 transition-colors overflow-hidden relative"
        onClick={onBookedClick}
      >
        {/* Status indicator dot */}
        <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${statusColors[bookingStatus]}`} />

        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="font-semibold text-sm text-white truncate">
            {customerName} - {pickupLocation}
          </div>
        </div>

        {/* Pilot badges grid */}
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${span}, 1fr)` }}>
          {assignedPilots.map((pilot, index) => {
            // Find payment amount for this pilot
            const payment = pilotPayments?.find(p => p.pilotName === pilot);
            const amount = payment?.amount;
            // Convert to number if it's a string
            const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

            return (
              <div key={index} className="flex justify-center">
                <div className="text-xs text-zinc-300 bg-zinc-700/50 rounded-t-lg px-2 py-0.5 w-[80%] relative">
                  <div className="text-center truncate">{pilot}</div>
                  {numAmount !== undefined && numAmount !== 0 && !isNaN(numAmount) && (
                    <span className="absolute right-2 top-0.5 font-medium text-zinc-400">{numAmount}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (status === "noPilot") {
    return (
      <div className="w-full h-full bg-zinc-900 rounded-lg flex items-center justify-center cursor-not-allowed">
        <div className="text-xs text-zinc-500">no {pilotId.toLowerCase()}</div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
      onClick={onAvailableClick}
    >
      {/* Empty booking cell - available for booking */}
    </div>
  );
}

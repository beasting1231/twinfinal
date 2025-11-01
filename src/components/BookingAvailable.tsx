interface BookingAvailableProps {
  pilotId: string;
  timeSlot: string;
  status?: "available" | "booked" | "noPilot";
  customerName?: string;
  pickupLocation?: string;
  assignedPilots?: string[];
  bookingStatus?: "confirmed" | "pending" | "cancelled";
  span?: number;
}

export function BookingAvailable({
  pilotId,
  status = "available",
  customerName,
  pickupLocation,
  assignedPilots = [],
  bookingStatus = "confirmed",
  span = 1
}: BookingAvailableProps) {
  if (status === "booked") {
    const statusColors = {
      confirmed: "bg-green-500",
      pending: "bg-yellow-500",
      cancelled: "bg-red-500"
    };

    return (
      <div className="w-full h-full bg-blue-900/40 border border-blue-700/50 rounded-lg pt-2 px-2 flex flex-col justify-between cursor-pointer hover:bg-blue-900/50 transition-colors overflow-hidden relative">
        {/* Status indicator dot */}
        <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${statusColors[bookingStatus]}`} />

        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="font-semibold text-sm text-white truncate">
            {customerName} - {pickupLocation}
          </div>
        </div>

        {/* Pilot badges grid */}
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${span}, 1fr)` }}>
          {assignedPilots.map((pilot, index) => (
            <div key={index} className="flex justify-center">
              <div className="text-xs text-zinc-300 bg-zinc-700/50 rounded-t-lg px-2 py-0.5 text-center truncate w-[80%]">
                {pilot}
              </div>
            </div>
          ))}
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
    <div className="w-full h-full bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer">
      {/* Empty booking cell - available for booking */}
    </div>
  );
}

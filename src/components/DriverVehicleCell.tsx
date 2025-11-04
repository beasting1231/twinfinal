import { memo } from "react";
import type { Booking } from "../types";

interface DriverVehicleCellProps {
  booking: Booking | null;
  onClick: () => void;
  onContextMenu: (position: { x: number; y: number }) => void;
}

export const DriverVehicleCell = memo(function DriverVehicleCell({
  booking,
  onClick,
  onContextMenu,
}: DriverVehicleCellProps) {
  if (!booking) {
    return null;
  }

  const hasDriver = booking.driver && booking.driver.trim();
  const hasVehicle = booking.vehicle && booking.vehicle.trim();
  const hasNoAssignment = !hasDriver && !hasVehicle;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className={`w-full h-full rounded-lg p-2 flex flex-col items-center justify-center cursor-pointer transition-colors ${
        hasNoAssignment
          ? "bg-orange-600/70 hover:bg-orange-500/80"
          : "bg-yellow-400/80 hover:bg-yellow-300/85"
      }`}
      onClick={onClick}
      onContextMenu={handleContextMenu}
    >
      {!hasDriver && !hasVehicle ? (
        <div className="text-xs text-zinc-900 font-medium">no driver</div>
      ) : (
        <div className="flex flex-col items-center gap-0.5 w-full">
          {hasDriver && (
            <div className="text-xs text-zinc-900 font-medium truncate w-full text-center">
              {booking.driver}
            </div>
          )}
          {hasVehicle && (
            <div className="text-xs text-zinc-900 truncate w-full text-center">
              {booking.vehicle}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

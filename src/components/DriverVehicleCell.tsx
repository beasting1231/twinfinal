import { memo, useRef } from "react";
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
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Extract driver/vehicle info from booking if it exists
  const hasDriver = booking?.driver && booking.driver.trim();
  const hasVehicle = booking?.vehicle && booking.vehicle.trim();
  const hasNoAssignment = !hasDriver && !hasVehicle;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    longPressTimerRef.current = setTimeout(() => {
      if (touchStartPosRef.current) {
        onContextMenu({
          x: touchStartPosRef.current.x,
          y: touchStartPosRef.current.y,
        });
      }
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current) return;

    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);

    // Cancel long press if moved more than 10px
    if (deltaX > 10 || deltaY > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      touchStartPosRef.current = null;
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {!hasDriver && !hasVehicle ? (
        <div className="text-xs text-zinc-900 font-medium">no driver</div>
      ) : (
        <div className="flex flex-col items-center gap-0.5 w-full">
          {hasDriver && (
            <div className="text-xs text-zinc-900 font-medium truncate w-full text-center">
              {booking?.driver}
            </div>
          )}
          {hasVehicle && (
            <div className="text-xs text-zinc-900 truncate w-full text-center">
              {booking?.vehicle}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

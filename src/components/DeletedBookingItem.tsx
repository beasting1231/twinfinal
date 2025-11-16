import { useRef, useState } from "react";
import type { Booking } from "../types/index";

interface DeletedBookingItemProps {
  booking: Booking;
  timeSlots: string[];
  onContextMenu: (booking: Booking, position: { x: number; y: number }) => void;
}

export function DeletedBookingItem({ booking, timeSlots, onContextMenu }: DeletedBookingItemProps) {
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [pressGlow, setPressGlow] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    longPressTimerRef.current = setTimeout(() => {
      const touch = e.touches[0];
      setPressGlow(true);
      onContextMenu(booking, { x: touch.clientX, y: touch.clientY });
    }, 500); // 500ms for context menu
  };

  const handleTouchMove = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setPressGlow(false);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setPressGlow(false);
  };

  const handleContextMenuEvent = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(booking, { x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className={`p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 cursor-context-menu transition-shadow ${
        pressGlow ? 'ring-2 ring-blue-500 shadow-lg' : ''
      }`}
      onContextMenu={handleContextMenuEvent}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-gray-900 dark:text-white">
              {booking.customerName || "No name"}
            </span>
            <span className="text-sm text-gray-500 dark:text-zinc-400">
              {booking.numberOfPeople} pax
            </span>
            {booking.flightType && (
              <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                {booking.flightType}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-600 dark:text-zinc-400">
            <span>{timeSlots[booking.timeIndex]}</span>
            {booking.pickupLocation && (
              <span className="ml-2">• {booking.pickupLocation}</span>
            )}
            {booking.bookingSource && (
              <span className="ml-2">• Source: {booking.bookingSource}</span>
            )}
          </div>
          {booking.assignedPilots && booking.assignedPilots.filter(p => p).length > 0 && (
            <div className="text-xs text-gray-500 dark:text-zinc-500 mt-1">
              Pilots: {booking.assignedPilots.filter(p => p).join(", ")}
            </div>
          )}
          {booking.notes && (
            <div className="text-xs text-gray-500 dark:text-zinc-500 mt-1">
              Notes: {booking.notes}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useRef, useState } from "react";
import type { Booking } from "../types/index";
import { useDraggable } from "@dnd-kit/core";

interface DeletedBookingItemProps {
  booking: Booking;
  timeSlots: string[];
  onContextMenu: (booking: Booking, position: { x: number; y: number }) => void;
  canDrag?: boolean; // Whether this booking can be dragged (admin only)
  // Move mode props (admin only)
  onEnterMoveMode?: (booking: Booking) => void; // Callback to enter move mode
  isInMoveMode?: boolean; // Whether this specific booking is in move mode
}

export function DeletedBookingItem({ booking, timeSlots, onContextMenu, canDrag = false, onEnterMoveMode, isInMoveMode = false }: DeletedBookingItemProps) {
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const moveModeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [pressGlow, setPressGlow] = useState<'none' | 'light' | 'intense'>('none');
  const preventClickRef = useRef(false);

  // Set up draggable for deleted bookings (admin only)
  const draggableId = booking.id ? `deleted-booking-${booking.id}` : null;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId || 'disabled',
    disabled: !canDrag || !booking.id,
  });

  // Apply drag transform
  const dragStyle = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
  } : {};

  const handleTouchStart = (e: React.TouchEvent) => {
    // Stage 1: 500ms - context menu + light glow
    longPressTimerRef.current = setTimeout(() => {
      const touch = e.touches[0];
      setPressGlow('light');
      onContextMenu(booking, { x: touch.clientX, y: touch.clientY });
    }, 500); // 500ms for context menu

    // Stage 2: 1000ms - move mode + intense glow (admin only)
    if (onEnterMoveMode && canDrag && booking.id) {
      moveModeTimerRef.current = setTimeout(() => {
        setPressGlow('intense');

        // Trigger haptic feedback if supported
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }

        // Prevent click event from firing after this long press
        preventClickRef.current = true;

        onEnterMoveMode(booking);
      }, 1000); // 1000ms for move mode
    }
  };

  const handleTouchMove = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (moveModeTimerRef.current) {
      clearTimeout(moveModeTimerRef.current);
      moveModeTimerRef.current = null;
    }
    setPressGlow('none');
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (moveModeTimerRef.current) {
      clearTimeout(moveModeTimerRef.current);
      moveModeTimerRef.current = null;
    }
    setPressGlow('none');

    // Reset preventClick after a short delay to allow click event to be blocked
    setTimeout(() => {
      preventClickRef.current = false;
    }, 100);
  };

  const handleContextMenuEvent = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(booking, { x: e.clientX, y: e.clientY });
  };

  // Apply glow effect based on press state or move mode
  let boxShadow = 'none';
  if (isInMoveMode) {
    boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.5), 0 0 20px rgba(59, 130, 246, 0.4)'; // Blue glow for active move
  } else if (pressGlow === 'light') {
    boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.3)'; // Light blue glow at 500ms
  } else if (pressGlow === 'intense') {
    boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.6), 0 0 15px rgba(59, 130, 246, 0.5)'; // Intense blue glow at 1000ms
  }

  return (
    <div
      ref={setNodeRef}
      {...(canDrag && booking.id ? { ...attributes, ...listeners } : {})}
      className={`p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 cursor-context-menu transition-all select-none ${canDrag && booking.id ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ ...dragStyle, boxShadow }}
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
          {/* Deletion Info */}
          {(booking.deletedByName || booking.deletedAt) && (
            <div className="text-xs text-gray-500 dark:text-zinc-500 mt-2 pt-2 border-t border-gray-300 dark:border-zinc-600">
              {booking.deletedByName && (
                <div>Deleted by: <span className="font-medium">{booking.deletedByName}</span></div>
              )}
              {booking.deletedAt && (
                <div>
                  Deleted at: <span className="font-medium">
                    {new Date(booking.deletedAt.toDate ? booking.deletedAt.toDate() : booking.deletedAt).toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

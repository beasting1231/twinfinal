import { useRef } from "react";
import type { PilotPayment } from "../types/index";

interface BookingAvailableProps {
  pilotId: string;
  timeSlot: string;
  status?: "available" | "booked" | "noPilot";
  customerName?: string;
  pickupLocation?: string;
  assignedPilots?: string[];
  pilotPayments?: PilotPayment[];
  bookingStatus?: "unconfirmed" | "confirmed" | "pending" | "cancelled";
  span?: number;
  femalePilotsRequired?: number;
  onAvailableClick?: () => void;
  onBookedClick?: () => void;
  onContextMenu?: (slotIndex: number, position: { x: number; y: number }) => void;
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
  femalePilotsRequired = 0,
  onAvailableClick,
  onBookedClick,
  onContextMenu
}: BookingAvailableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Detect which slot was clicked based on x position
  const getSlotIndexFromPosition = (clientX: number): number => {
    if (!containerRef.current || span === 1) return 0;

    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const slotWidth = rect.width / span;
    const slotIndex = Math.floor(relativeX / slotWidth);

    return Math.max(0, Math.min(span - 1, slotIndex));
  };

  // Handle right-click (desktop)
  const handleContextMenu = (e: React.MouseEvent) => {
    if (status !== "booked" || !onContextMenu) return;

    e.preventDefault();
    e.stopPropagation();

    const slotIndex = getSlotIndexFromPosition(e.clientX);
    onContextMenu(slotIndex, { x: e.clientX, y: e.clientY });
  };

  // Handle touch start (mobile long-press)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (status !== "booked" || !onContextMenu) return;

    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    longPressTimerRef.current = window.setTimeout(() => {
      if (touchStartPosRef.current) {
        const slotIndex = getSlotIndexFromPosition(touchStartPosRef.current.x);
        onContextMenu(slotIndex, touchStartPosRef.current);
      }
    }, 500); // 500ms long press
  };

  // Handle touch move (cancel long-press if finger moves)
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current || !longPressTimerRef.current) return;

    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);

    // Cancel long-press if finger moved more than 10px
    if (deltaX > 10 || deltaY > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      touchStartPosRef.current = null;
    }
  };

  // Handle touch end (clear long-press timer)
  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
  };

  if (status === "booked") {
    const statusColors = {
      unconfirmed: "bg-blue-500",
      confirmed: "bg-green-500",
      pending: "bg-yellow-500",
      cancelled: "bg-red-500"
    };

    return (
      <div
        ref={containerRef}
        className="w-full h-full bg-blue-900/40 border border-blue-700/50 rounded-lg pt-2 px-2 flex flex-col justify-between cursor-pointer hover:bg-blue-900/50 transition-colors overflow-hidden relative"
        onClick={onBookedClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Status indicator bar */}
        <div className={`absolute top-0 right-0 w-[5px] h-full ${statusColors[bookingStatus]}`} />

        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="font-semibold text-sm text-white truncate">
            {customerName} - {pickupLocation}
          </div>
        </div>

        {/* Pilot badges grid */}
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${span}, 1fr)` }}>
          {Array.from({ length: span }, (_, index) => {
            const pilot = assignedPilots[index];

            // Find payment amount for this pilot
            const payment = pilotPayments?.find(p => p.pilotName === pilot);
            const amount = payment?.amount;
            // Convert to number if it's a string
            const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

            // Check if this position requires a female pilot
            const requiresFemalePilot = index < femalePilotsRequired;

            // Show red box with "lady pilot" text for unassigned positions that require female pilot
            if (!pilot || pilot === "") {
              if (requiresFemalePilot) {
                return (
                  <div key={index} className="flex justify-center">
                    <div className="text-xs text-white bg-red-600/80 rounded-t-lg px-2 py-0.5 w-[80%] text-center">
                      lady pilot
                    </div>
                  </div>
                );
              }
              return <div key={index} className="flex justify-center" />;
            }

            return (
              <div key={index} className="flex justify-center">
                <div className={requiresFemalePilot
                  ? "text-xs text-white bg-red-600/80 rounded-t-lg px-2 py-0.5 w-[80%] relative"
                  : "text-xs text-zinc-300 bg-zinc-700/50 rounded-t-lg px-2 py-0.5 w-[80%] relative"
                }>
                  <div className="text-center truncate">{pilot}</div>
                  {numAmount !== undefined && numAmount !== 0 && !isNaN(numAmount) && (
                    <span className={requiresFemalePilot
                      ? "absolute right-2 top-0.5 font-medium text-white"
                      : "absolute right-2 top-0.5 font-medium text-zinc-400"
                    }>{numAmount}</span>
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

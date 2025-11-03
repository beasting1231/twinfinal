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
  bookingSourceColor?: string;
  onAvailableClick?: () => void;
  onBookedClick?: () => void;
  onContextMenu?: (slotIndex: number, position: { x: number; y: number }) => void;
  onNoPilotContextMenu?: (position: { x: number; y: number }) => void;
  onAvailableContextMenu?: (position: { x: number; y: number }) => void;
  isCurrentUserPilot?: boolean; // Whether this cell is for the current user
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
  bookingSourceColor = "#1e3a8a",
  onAvailableClick,
  onBookedClick,
  onContextMenu,
  onNoPilotContextMenu,
  onAvailableContextMenu,
  isCurrentUserPilot = false
}: BookingAvailableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  console.log("BookingAvailable render:", { pilotId, status, isCurrentUserPilot, hasNoPilotHandler: !!onNoPilotContextMenu, hasAvailableHandler: !!onAvailableContextMenu });

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
    if (status !== "booked" || !onContextMenu || bookingStatus === "cancelled") return;

    e.preventDefault();
    e.stopPropagation();

    const slotIndex = getSlotIndexFromPosition(e.clientX);
    onContextMenu(slotIndex, { x: e.clientX, y: e.clientY });
  };

  // Handle touch start (mobile long-press)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (status !== "booked" || !onContextMenu || bookingStatus === "cancelled") return;

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

    // Helper function to convert hex to rgba
    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const backgroundColor = hexToRgba(bookingSourceColor, 0.4);
    const borderColor = hexToRgba(bookingSourceColor, 0.5);
    const hoverColor = hexToRgba(bookingSourceColor, 0.5);

    return (
      <div
        ref={containerRef}
        className="w-full h-full rounded-lg pt-2 px-2 flex flex-col justify-between cursor-pointer transition-colors overflow-hidden relative"
        style={{
          backgroundColor,
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = hoverColor;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = backgroundColor;
        }}
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
                    <div className="text-xs text-white bg-red-600/90 rounded-t-lg px-2 py-0.5 w-[80%] text-center">
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
                  ? "text-xs text-white bg-red-600/90 rounded-t-lg px-2 py-0.5 w-[80%] relative"
                  : "text-xs text-white bg-zinc-800/90 rounded-t-lg px-2 py-0.5 w-[80%] relative"
                }>
                  <div className="text-center truncate">{pilot}</div>
                  {numAmount !== undefined && numAmount !== 0 && !isNaN(numAmount) && (
                    <span className="absolute right-2 top-0.5 font-medium text-white">{numAmount}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Handle context menu for noPilot cells
  const handleNoPilotContextMenu = (e: React.MouseEvent) => {
    console.log("handleNoPilotContextMenu called", { status, onNoPilotContextMenu, isCurrentUserPilot });
    if (status !== "noPilot" || !onNoPilotContextMenu || !isCurrentUserPilot) return;

    e.preventDefault();
    e.stopPropagation();

    console.log("NoPilot cell context menu triggered");
    onNoPilotContextMenu({ x: e.clientX, y: e.clientY });
  };

  // Handle touch start for noPilot cells (mobile long-press)
  const handleNoPilotTouchStart = (e: React.TouchEvent) => {
    if (status !== "noPilot" || !onNoPilotContextMenu || !isCurrentUserPilot) return;

    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    longPressTimerRef.current = window.setTimeout(() => {
      if (touchStartPosRef.current) {
        console.log("NoPilot cell touch long-press triggered");
        onNoPilotContextMenu(touchStartPosRef.current);
      }
    }, 500); // 500ms long press
  };

  // Handle context menu for available cells
  const handleAvailableContextMenu = (e: React.MouseEvent) => {
    if (status !== "available" || !onAvailableContextMenu) return;

    e.preventDefault();
    e.stopPropagation();

    console.log("Available cell context menu triggered");
    onAvailableContextMenu({ x: e.clientX, y: e.clientY });
  };

  // Handle touch start for available cells (mobile long-press)
  const handleAvailableTouchStart = (e: React.TouchEvent) => {
    if (status !== "available" || !onAvailableContextMenu) return;

    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    longPressTimerRef.current = window.setTimeout(() => {
      if (touchStartPosRef.current) {
        console.log("Available cell touch long-press triggered");
        onAvailableContextMenu(touchStartPosRef.current);
      }
    }, 500); // 500ms long press
  };

  if (status === "noPilot") {
    return (
      <div
        className={`w-full h-full bg-zinc-900 rounded-lg flex items-center justify-center ${
          isCurrentUserPilot ? 'cursor-pointer hover:bg-zinc-800' : 'cursor-not-allowed'
        }`}
        onContextMenu={handleNoPilotContextMenu}
        onTouchStart={handleNoPilotTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="text-xs text-zinc-500">no {pilotId.toLowerCase()}</div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
      onClick={onAvailableClick}
      onContextMenu={handleAvailableContextMenu}
      onTouchStart={handleAvailableTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Empty booking cell - available for booking */}
    </div>
  );
}

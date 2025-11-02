import { useState, useRef, useEffect } from "react";
import { BookingAvailable } from "./BookingAvailable";
import { NewBookingModal } from "./NewBookingModal";
import { BookingDetailsModal } from "./BookingDetailsModal";
import { PilotContextMenu } from "./PilotContextMenu";
import type { Booking, UnavailablePilot, Pilot } from "../types/index";

interface ScheduleGridProps {
  selectedDate: Date;
  pilots: Pilot[];
  timeSlots: string[];
  bookings?: Booking[];
  unavailablePilots?: UnavailablePilot[];
  isPilotAvailableForTimeSlot: (pilotUid: string, timeSlot: string) => boolean;
  loading?: boolean;
  onAddBooking?: (booking: Omit<Booking, "id">) => void;
  onUpdateBooking?: (id: string, booking: Partial<Booking>) => void;
  onDeleteBooking?: (id: string) => void;
  onNavigateToDate?: (date: Date) => void;
}

export function ScheduleGrid({ selectedDate, pilots, timeSlots, bookings = [], unavailablePilots = [], isPilotAvailableForTimeSlot, loading = false, onAddBooking, onUpdateBooking, onDeleteBooking, onNavigateToDate }: ScheduleGridProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ pilotIndex: number; timeIndex: number; timeSlot: string } | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    booking: Booking;
    slotIndex: number;
    timeSlot: string;
  } | null>(null);

  // Zoom state
  const [scale, setScale] = useState(1);
  const [isPinching, setIsPinching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialDistanceRef = useRef<number | null>(null);
  const initialScaleRef = useRef<number>(1);
  const rafRef = useRef<number | null>(null);

  const handleAvailableCellClick = (pilotIndex: number, timeIndex: number, timeSlot: string) => {
    setSelectedCell({ pilotIndex, timeIndex, timeSlot });
    setIsModalOpen(true);
  };

  const handleBookedCellClick = (booking: Booking) => {
    setSelectedBooking(booking);
    setIsDetailsModalOpen(true);
  };

  const handleBookingSubmit = (booking: Omit<Booking, "id">) => {
    if (onAddBooking) {
      onAddBooking(booking);
    }
  };

  // Handle context menu on booking cell
  const handleBookingContextMenu = (booking: Booking, timeSlot: string) => (
    slotIndex: number,
    position: { x: number; y: number }
  ) => {
    setContextMenu({
      isOpen: true,
      position,
      booking,
      slotIndex,
      timeSlot,
    });
  };

  // Handle pilot selection from context menu
  const handleSelectPilot = (pilotName: string) => {
    if (!contextMenu || !onUpdateBooking) return;

    const { booking, slotIndex } = contextMenu;
    // Ensure array has proper length to avoid undefined values
    const requiredLength = Math.max(booking.numberOfPeople, slotIndex + 1);
    const updatedPilots = [...booking.assignedPilots];
    // Fill any missing positions with empty strings to prevent undefined
    while (updatedPilots.length < requiredLength) {
      updatedPilots.push("");
    }
    updatedPilots[slotIndex] = pilotName;

    onUpdateBooking(booking.id!, { assignedPilots: updatedPilots });
  };

  // Handle pilot un-assignment from context menu
  const handleUnassignPilot = () => {
    if (!contextMenu || !onUpdateBooking) return;

    const { booking, slotIndex } = contextMenu;
    // Ensure array has proper length to avoid undefined values
    const requiredLength = Math.max(booking.numberOfPeople, slotIndex + 1);
    const updatedPilots = [...booking.assignedPilots];
    // Fill any missing positions with empty strings to prevent undefined
    while (updatedPilots.length < requiredLength) {
      updatedPilots.push("");
    }
    // Set the position to empty string instead of removing to preserve positions
    updatedPilots[slotIndex] = "";

    onUpdateBooking(booking.id!, {
      assignedPilots: updatedPilots,
    });
  };

  // Get distance between two touch points
  const getDistance = (touch1: React.Touch, touch2: React.Touch) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Handle touch start for pinch zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      setIsPinching(true);
      const distance = getDistance(e.touches[0], e.touches[1]);
      initialDistanceRef.current = distance;
      initialScaleRef.current = scale;
    }
  };

  // Handle touch move for pinch zoom
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialDistanceRef.current) {
      e.preventDefault();

      // Cancel any pending animation frame
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      // Use requestAnimationFrame for smoother updates
      rafRef.current = requestAnimationFrame(() => {
        const distance = getDistance(e.touches[0], e.touches[1]);
        const scaleChange = distance / initialDistanceRef.current!;
        const newScale = Math.max(0.15, Math.min(2, initialScaleRef.current * scaleChange));
        setScale(newScale);
      });
    }
  };

  // Handle touch end
  const handleTouchEnd = () => {
    initialDistanceRef.current = null;
    setIsPinching(false);

    // Cancel any pending animation frame
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  // Add touch event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const preventDefault = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
      }
    };

    container.addEventListener('touchmove', preventDefault, { passive: false });

    return () => {
      container.removeEventListener('touchmove', preventDefault);
    };
  }, []);

  // Show skeleton loader while loading
  if (loading) {
    return (
      <div className="flex-1 overflow-auto p-4 bg-zinc-950">
        <div className="inline-block">
          <div className="grid gap-2" style={{ gridTemplateColumns: `80px repeat(5, 220px)` }}>
            {/* Header Row Skeleton */}
            <div className="h-7" />
            <div className="h-7 bg-zinc-900 rounded-lg animate-pulse" />
            <div className="h-7 bg-zinc-900 rounded-lg animate-pulse" />
            <div className="h-7 bg-zinc-900 rounded-lg animate-pulse" />
            <div className="h-7 bg-zinc-900 rounded-lg animate-pulse" />
            <div className="h-7 bg-zinc-900 rounded-lg animate-pulse" />

            {/* Time Slot Rows Skeleton */}
            {timeSlots.map((_timeSlot, index) => (
              <div key={index} className="contents">
                {/* Time label skeleton */}
                <div className="h-14 bg-zinc-900 rounded-lg animate-pulse" />
                {/* Skeleton cells */}
                <div className="h-14 bg-zinc-800 rounded-lg animate-pulse" />
                <div className="h-14 bg-zinc-800 rounded-lg animate-pulse" />
                <div className="h-14 bg-zinc-800 rounded-lg animate-pulse" />
                <div className="h-14 bg-zinc-800 rounded-lg animate-pulse" />
                <div className="h-14 bg-zinc-800 rounded-lg animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

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
      // Use numberOfPeople to determine span for proper cell occupation
      const bookingSpan = booking.numberOfPeople || booking.span || 1;
      const bookingEnd = booking.pilotIndex + bookingSpan - 1;
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
    <div
      ref={containerRef}
      className="flex-1 overflow-auto p-4 bg-zinc-950"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className={`inline-block origin-top-left ${!isPinching ? 'transition-transform duration-100' : ''}`}
        style={{ transform: `scale(${scale})` }}
      >
        <div className="grid gap-2" style={{ gridTemplateColumns: `80px repeat(${pilots.length}, 220px)` }}>
          {/* Header Row */}
          {/* Empty cell for top-left corner */}
          <div className="h-7" />

          {/* Pilot Headers */}
          {pilots.map((p) => (
            <div
              key={p.uid}
              className="h-7 flex items-center justify-center bg-zinc-900 rounded-lg font-medium text-sm"
            >
              {p.displayName}
            </div>
          ))}

          {/* Time Slots and Booking Cells */}
          {timeSlots.map((timeSlot, timeIndex) => {
            // Sort pilots for this specific time slot: available first, then unavailable
            const sortedPilotsForSlot = [...pilots].sort((a, b) => {
              const aAvailable = isPilotAvailableForTimeSlot(a.uid, timeSlot);
              const bAvailable = isPilotAvailableForTimeSlot(b.uid, timeSlot);

              // Available pilots come first (left side)
              if (aAvailable && !bAvailable) return -1;
              if (!aAvailable && bAvailable) return 1;

              // If both have same availability, maintain original order
              return 0;
            });

            return [
              // Time Slot Label
              <div
                key={`time-${timeIndex}`}
                className="h-14 flex items-center justify-center bg-zinc-900 rounded-lg font-medium text-sm"
              >
                {timeSlot}
              </div>,

              // Booking Cells for each pilot
              ...sortedPilotsForSlot.map((pilot) => {
                  // Find the original pilot index for booking lookups
                  const pilotIndex = pilots.findIndex(p => p.uid === pilot.uid);

                  // Skip cells that are occupied by a spanning booking
                  if (isCellOccupied(pilotIndex, timeIndex)) {
                    return null;
                  }

                  const booking = getBooking(pilotIndex, timeIndex);
                  // Use numberOfPeople as span to ensure proper column width
                  const span = booking?.numberOfPeople || booking?.span || 1;
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
                        pilotPayments={booking?.pilotPayments}
                        bookingStatus={booking?.bookingStatus}
                        span={span}
                        onAvailableClick={
                          cellStatus === "available"
                            ? () => handleAvailableCellClick(pilotIndex, timeIndex, timeSlot)
                            : undefined
                        }
                        onBookedClick={
                          cellStatus === "booked" && booking
                            ? () => handleBookedCellClick(booking)
                            : undefined
                        }
                        onContextMenu={
                          cellStatus === "booked" && booking
                            ? handleBookingContextMenu(booking, timeSlot)
                            : undefined
                        }
                      />
                    </div>
                  );
              })
            ];
          })}
        </div>
      </div>

      {selectedCell && (
        <NewBookingModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          selectedDate={selectedDate}
          pilotIndex={selectedCell.pilotIndex}
          timeIndex={selectedCell.timeIndex}
          timeSlot={selectedCell.timeSlot}
          pilots={pilots}
          bookings={bookings}
          isPilotAvailableForTimeSlot={isPilotAvailableForTimeSlot}
          onSubmit={handleBookingSubmit}
        />
      )}

      <BookingDetailsModal
        open={isDetailsModalOpen}
        onOpenChange={setIsDetailsModalOpen}
        booking={selectedBooking}
        bookings={bookings}
        pilots={pilots}
        isPilotAvailableForTimeSlot={isPilotAvailableForTimeSlot}
        unavailablePilots={unavailablePilots}
        timeSlots={timeSlots}
        onUpdate={onUpdateBooking}
        onDelete={onDeleteBooking}
        onNavigateToDate={onNavigateToDate}
      />

      {/* Pilot Context Menu */}
      {contextMenu && (
        <PilotContextMenu
          isOpen={contextMenu.isOpen}
          position={contextMenu.position}
          availablePilots={pilots
            .filter((pilot) => {
              // Check if pilot is available for this time slot
              if (!isPilotAvailableForTimeSlot(pilot.uid, contextMenu.timeSlot)) {
                return false;
              }

              // Exclude pilots already assigned to this booking (to prevent double-assignment within same booking)
              const alreadyAssignedToThisBooking = contextMenu.booking.assignedPilots
                .filter((p, index) => p && p !== "" && index !== contextMenu.slotIndex)
                .includes(pilot.displayName);

              if (alreadyAssignedToThisBooking) {
                return false;
              }

              // Exclude pilots already assigned to other bookings at the same time
              const alreadyAssignedToOtherBooking = bookings.some(booking => {
                // Skip the current booking we're editing
                if (booking.id === contextMenu.booking.id) {
                  return false;
                }

                // Check if this booking is at the same time and date
                if (booking.timeIndex === contextMenu.booking.timeIndex &&
                    booking.date === contextMenu.booking.date) {
                  // Check if this pilot is assigned to this booking
                  return booking.assignedPilots.some(p => p && p !== "" && p === pilot.displayName);
                }

                return false;
              });

              return !alreadyAssignedToOtherBooking;
            })
            .sort((a, b) => {
              // Count flights for each pilot on the selected date
              const aFlightCount = bookings.filter(
                (booking) =>
                  booking.date === contextMenu.booking.date &&
                  booking.assignedPilots.includes(a.displayName)
              ).length;

              const bFlightCount = bookings.filter(
                (booking) =>
                  booking.date === contextMenu.booking.date &&
                  booking.assignedPilots.includes(b.displayName)
              ).length;

              // Sort by flight count (least to most)
              return aFlightCount - bFlightCount;
            })}
          pilotFlightCounts={bookings
            .filter(booking => booking.date === contextMenu.booking.date)
            .reduce((counts, booking) => {
              booking.assignedPilots.forEach(pilotName => {
                if (pilotName && pilotName !== "") {
                  counts[pilotName] = (counts[pilotName] || 0) + 1;
                }
              });
              return counts;
            }, {} as Record<string, number>)}
          currentPilot={contextMenu.booking.assignedPilots[contextMenu.slotIndex]}
          onSelectPilot={handleSelectPilot}
          onUnassign={handleUnassignPilot}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

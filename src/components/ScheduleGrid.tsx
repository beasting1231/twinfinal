import { useState, useRef, useEffect } from "react";
import { BookingAvailable } from "./BookingAvailable";
import { NewBookingModal } from "./NewBookingModal";
import { BookingDetailsModal } from "./BookingDetailsModal";
import { PilotContextMenu } from "./PilotContextMenu";
import { AvailabilityContextMenu } from "./AvailabilityContextMenu";
import type { Booking, Pilot } from "../types/index";

interface ScheduleGridProps {
  selectedDate: Date;
  pilots: Pilot[];
  timeSlots: string[];
  bookings?: Booking[];
  isPilotAvailableForTimeSlot: (pilotUid: string, timeSlot: string) => boolean;
  loading?: boolean;
  currentUserDisplayName?: string;
  onAddBooking?: (booking: Omit<Booking, "id">) => void;
  onUpdateBooking?: (id: string, booking: Partial<Booking>) => void;
  onDeleteBooking?: (id: string) => void;
  onNavigateToDate?: (date: Date) => void;
}

export function ScheduleGrid({ selectedDate, pilots, timeSlots, bookings = [], isPilotAvailableForTimeSlot, loading = false, currentUserDisplayName, onAddBooking, onUpdateBooking, onDeleteBooking, onNavigateToDate }: ScheduleGridProps) {
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

  // Availability context menu state
  const [availabilityContextMenu, setAvailabilityContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    pilotIndex: number;
    timeIndex: number;
    isSignedOut: boolean;
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

  // Handle opening availability context menu
  const handleNoPilotContextMenu = (pilotIndex: number, timeIndex: number) => (position: { x: number; y: number }) => {
    console.log("handleNoPilotContextMenu called in ScheduleGrid", { pilotIndex, timeIndex, position, currentUserDisplayName });

    // Check if pilot is currently available (has record in availability collection)
    const pilot = pilots[pilotIndex];
    const timeSlot = timeSlots[timeIndex];

    // If pilot is available, there's a record in the availability collection
    // If pilot is NOT available (signed out), there's NO record
    const isPilotAvailable = pilot && isPilotAvailableForTimeSlot(pilot.uid, timeSlot);
    const isSignedOut = !isPilotAvailable;

    console.log("Setting availability context menu", { isPilotAvailable, isSignedOut });
    setAvailabilityContextMenu({
      isOpen: true,
      position,
      pilotIndex,
      timeIndex,
      isSignedOut,
    });
  };

  // Handle signing in (marking as available - ADD to availability collection)
  const handleSignIn = async () => {
    if (!availabilityContextMenu) return;

    const { pilotIndex, timeIndex } = availabilityContextMenu;
    const pilot = pilots[pilotIndex];
    const timeSlot = timeSlots[timeIndex];

    if (!pilot || !currentUserDisplayName) return;

    try {
      const { addDoc, collection } = await import("firebase/firestore");
      const { db } = await import("../firebase/config");
      const { format } = await import("date-fns");

      // Add to availability collection
      await addDoc(collection(db, "availability"), {
        userId: pilot.uid,
        date: format(selectedDate, "yyyy-MM-dd"),
        timeSlot: timeSlot,
      });

      console.log("Signed in successfully");
      setAvailabilityContextMenu(null);
    } catch (error) {
      console.error("Error signing in:", error);
    }
  };

  // Handle signing out (marking as unavailable - DELETE from availability collection)
  const handleSignOut = async () => {
    if (!availabilityContextMenu) return;

    const { pilotIndex, timeIndex } = availabilityContextMenu;
    const pilot = pilots[pilotIndex];
    const timeSlot = timeSlots[timeIndex];

    if (!pilot || !currentUserDisplayName) return;

    try {
      const { query, collection, where, getDocs, deleteDoc } = await import("firebase/firestore");
      const { db } = await import("../firebase/config");
      const { format } = await import("date-fns");

      const dateStr = format(selectedDate, "yyyy-MM-dd");

      // Delete from availability collection
      const q = query(
        collection(db, "availability"),
        where("userId", "==", pilot.uid),
        where("date", "==", dateStr),
        where("timeSlot", "==", timeSlot)
      );

      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      console.log("Signed out successfully");
      setAvailabilityContextMenu(null);
    } catch (error) {
      console.error("Error signing out:", error);
    }
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

  // Get all bookings at a specific position (for rendering multiple bookings)
  const getAllBookingsAt = (pilotIndex: number, timeIndex: number) => {
    return bookings.filter(
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
          {pilots.map((p, index) => (
            <div
              key={p.uid}
              className={`h-7 flex items-center justify-center ${p.femalePilot ? 'bg-red-600/80' : 'bg-zinc-900'} rounded-lg font-medium text-sm gap-2`}
            >
              <span className={p.femalePilot ? 'text-white' : 'text-zinc-500'}>{index + 1}</span>
              <span>{p.displayName}</span>
            </div>
          ))}

          {/* Time Slots and Booking Cells */}
          {timeSlots.map((timeSlot, timeIndex) => {
            return [
              // Time Slot Label
              <div
                key={`time-${timeIndex}`}
                className="h-14 flex items-center justify-center bg-zinc-900 rounded-lg font-medium text-sm"
              >
                {timeSlot}
              </div>,

              // Booking Cells for each pilot
              ...pilots.flatMap((pilot, pilotIndex) => {

                  // Skip cells that are occupied by a spanning booking
                  if (isCellOccupied(pilotIndex, timeIndex)) {
                    return [];
                  }

                  // Get all bookings at this position
                  const allBookings = getAllBookingsAt(pilotIndex, timeIndex);

                  // If there are multiple bookings, render each as a separate cell
                  if (allBookings.length > 0) {
                    return allBookings.map((booking, idx) => {
                      const span = booking.numberOfPeople || booking.span || 1;
                      return (
                        <div
                          key={`cell-${timeIndex}-${pilot.uid}-${booking.id || idx}`}
                          className="h-14"
                          style={{ gridColumn: `span ${span}` }}
                        >
                          <BookingAvailable
                            pilotId={pilot.displayName}
                            timeSlot={timeSlot}
                            status="booked"
                            customerName={booking.customerName}
                            pickupLocation={booking.pickupLocation}
                            assignedPilots={booking.assignedPilots}
                            pilotPayments={booking.pilotPayments}
                            bookingStatus={booking.bookingStatus}
                            span={span}
                            femalePilotsRequired={booking.femalePilotsRequired}
                            onBookedClick={() => handleBookedCellClick(booking)}
                            onContextMenu={handleBookingContextMenu(booking, timeSlot)}
                          />
                        </div>
                      );
                    });
                  }

                  // No booking - check if available
                  const isPilotAvailableThisSlot = isPilotAvailableForTimeSlot(pilot.uid, timeSlot);
                  const cellStatus = isPilotAvailableThisSlot ? "available" : "noPilot";

                  // Check if this cell is for the current user
                  const isCurrentUserPilot = currentUserDisplayName === pilot.displayName;

                  // Find the current user's pilot to check their availability at this time slot
                  const currentUserPilot = pilots.find(p => p.displayName === currentUserDisplayName);
                  const currentUserPilotIndex = currentUserPilot ? pilots.findIndex(p => p.uid === currentUserPilot.uid) : -1;
                  const isCurrentUserAvailableAtThisTime = currentUserPilot && isPilotAvailableForTimeSlot(currentUserPilot.uid, timeSlot);

                  // Debug logging
                  if (timeIndex === 0) { // Only log for first time slot to avoid spam
                    console.log("Cell for pilot:", {
                      pilotName: pilot.displayName,
                      currentUserDisplayName,
                      isCurrentUserPilot,
                      cellStatus,
                      isCurrentUserAvailableAtThisTime,
                      hasNoPilotHandler: !!(cellStatus === "noPilot" && isCurrentUserPilot),
                      hasAvailableHandler: !!(cellStatus === "available" && isCurrentUserAvailableAtThisTime)
                    });
                  }

                  return [(
                    <div
                      key={`cell-${timeIndex}-${pilot.uid}`}
                      className="h-14"
                      style={{ gridColumn: `span 1` }}
                    >
                      <BookingAvailable
                        pilotId={pilot.displayName}
                        timeSlot={timeSlot}
                        status={cellStatus}
                        span={1}
                        isCurrentUserPilot={isCurrentUserPilot}
                        onAvailableClick={
                          cellStatus === "available"
                            ? () => handleAvailableCellClick(pilotIndex, timeIndex, timeSlot)
                            : undefined
                        }
                        onNoPilotContextMenu={
                          cellStatus === "noPilot" && isCurrentUserPilot
                            ? handleNoPilotContextMenu(currentUserPilotIndex, timeIndex)
                            : undefined
                        }
                        onAvailableContextMenu={
                          cellStatus === "available" && isCurrentUserAvailableAtThisTime
                            ? handleNoPilotContextMenu(currentUserPilotIndex, timeIndex)
                            : undefined
                        }
                      />
                    </div>
                  )];
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

              // Check if this specific position requires a female pilot
              // Only the first N positions require female pilots, where N = femalePilotsRequired
              if (contextMenu.booking.femalePilotsRequired && contextMenu.slotIndex < contextMenu.booking.femalePilotsRequired) {
                if (!pilot.femalePilot) {
                  return false;
                }
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

      {/* Availability Context Menu */}
      {availabilityContextMenu && (
        <AvailabilityContextMenu
          isOpen={availabilityContextMenu.isOpen}
          position={availabilityContextMenu.position}
          isSignedOut={availabilityContextMenu.isSignedOut}
          canSignOut={(() => {
            // Check if pilot is assigned to any booking at this time
            const pilot = pilots[availabilityContextMenu.pilotIndex];
            if (!pilot) return false;

            const isPilotAssignedAtThisTime = bookings.some(booking =>
              booking.timeIndex === availabilityContextMenu.timeIndex &&
              booking.assignedPilots.some(p => p && p !== "" && p === pilot.displayName)
            );

            return !isPilotAssignedAtThisTime;
          })()}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onClose={() => setAvailabilityContextMenu(null)}
        />
      )}
    </div>
  );
}

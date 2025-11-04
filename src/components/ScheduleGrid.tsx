import { useState, useRef, useEffect, useCallback } from "react";
import { BookingAvailable } from "./BookingAvailable";
import { NewBookingModal } from "./NewBookingModal";
import { BookingDetailsModal } from "./BookingDetailsModal";
import { PilotContextMenu } from "./PilotContextMenu";
import { AvailabilityContextMenu } from "./AvailabilityContextMenu";
import { DriverVehicleCell } from "./DriverVehicleCell";
import { DriverVehicleModal } from "./DriverVehicleModal";
import { DriverVehicleContextMenu } from "./DriverVehicleContextMenu";
import { BookingRequestContextMenu } from "./BookingRequestContextMenu";
import { BookingRequestItem } from "./BookingRequestItem";
import { useBookingSourceColors } from "../hooks/useBookingSourceColors";
import { useDriverAssignments } from "../hooks/useDriverAssignments";
import { useBookingRequests } from "../hooks/useBookingRequests";
import type { Booking, Pilot, BookingRequest } from "../types/index";
import { format } from "date-fns";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";

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

  // Fetch booking source colors
  const { getSourceColor } = useBookingSourceColors();

  // Fetch driver assignments for the selected date
  const dateString = format(selectedDate, "yyyy-MM-dd");
  const {
    driverAssignments,
    findAssignment,
    updateDriverAssignment,
    addDriverAssignment
  } = useDriverAssignments(dateString);

  // Fetch booking requests
  const { bookingRequests } = useBookingRequests();

  // Booking request context menu state
  const [bookingRequestContextMenu, setBookingRequestContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    request: BookingRequest;
  } | null>(null);

  // State for pre-filling new booking modal from a booking request
  const [bookingRequestToBook, setBookingRequestToBook] = useState<BookingRequest | null>(null);

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

  // Driver/Vehicle modal state
  const [isDriverVehicleModalOpen, setIsDriverVehicleModalOpen] = useState(false);
  const [selectedBookingForDriverVehicle, setSelectedBookingForDriverVehicle] = useState<Booking | null>(null);
  const [selectedDriverColumn, setSelectedDriverColumn] = useState<1 | 2>(1);
  const [selectedTimeIndex, setSelectedTimeIndex] = useState<number>(0);
  const [selectedDriverDate, setSelectedDriverDate] = useState<Date>(new Date());

  // Driver/Vehicle context menu state
  const [driverVehicleContextMenu, setDriverVehicleContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    timeIndex: number;
    driverColumn: 1 | 2;
  } | null>(null);

  // Second driver column visibility state
  const [showSecondDriverColumn, setShowSecondDriverColumn] = useState(() => {
    const saved = localStorage.getItem('showSecondDriverColumn');
    return saved === 'true';
  });

  // Save second driver column visibility to localStorage
  useEffect(() => {
    localStorage.setItem('showSecondDriverColumn', String(showSecondDriverColumn));
  }, [showSecondDriverColumn]);

  // Zoom state
  const [scale, setScale] = useState(1);
  const [isPinching, setIsPinching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridHeight, setGridHeight] = useState(0);
  const initialDistanceRef = useRef<number | null>(null);
  const initialScaleRef = useRef<number>(1);
  const rafRef = useRef<number | null>(null);

  // Measure grid height for zoom compensation
  useEffect(() => {
    if (gridRef.current) {
      const updateHeight = () => {
        if (gridRef.current) {
          setGridHeight(gridRef.current.offsetHeight);
        }
      };

      // Measure initially
      updateHeight();

      // Re-measure when window resizes or scale changes
      window.addEventListener('resize', updateHeight);

      return () => window.removeEventListener('resize', updateHeight);
    }
  }, [pilots.length, timeSlots.length, bookings.length, scale]);

  const handleAvailableCellClick = useCallback((pilotIndex: number, timeIndex: number, timeSlot: string) => {
    setSelectedCell({ pilotIndex, timeIndex, timeSlot });
    setIsModalOpen(true);
  }, []);

  const handleBookedCellClick = useCallback((booking: Booking) => {
    setSelectedBooking(booking);
    setIsDetailsModalOpen(true);
  }, []);

  const handleBookingSubmit = useCallback(async (booking: Omit<Booking, "id">) => {
    if (onAddBooking) {
      onAddBooking(booking);

      // If this booking was created from a booking request, mark the request as approved
      if (bookingRequestToBook?.id) {
        try {
          await updateDoc(doc(db, "bookingRequests", bookingRequestToBook.id), {
            status: "approved",
          });
        } catch (error) {
          console.error("Error updating booking request status:", error);
        }
      }
    }
    setIsModalOpen(false);
    setBookingRequestToBook(null);
  }, [onAddBooking, bookingRequestToBook]);

  const handleDriverVehicleCellClick = useCallback((booking: Booking | null, driverColumn: 1 | 2 = 1, timeIndex: number) => {
    setSelectedBookingForDriverVehicle(booking);
    setSelectedDriverColumn(driverColumn);
    setSelectedTimeIndex(timeIndex);
    setSelectedDriverDate(selectedDate);
    setIsDriverVehicleModalOpen(true);
  }, [selectedDate]);

  // Handle driver/vehicle context menu
  const handleDriverVehicleContextMenu = (_booking: Booking | null, driverColumn: 1 | 2 = 1, timeIndex: number) => (
    position: { x: number; y: number }
  ) => {
    setDriverVehicleContextMenu({
      isOpen: true,
      position,
      timeIndex,
      driverColumn,
    });
  };

  // Handle delete driver/vehicle
  const handleDeleteDriverVehicle = async () => {
    if (!driverVehicleContextMenu) return;

    const { timeIndex, driverColumn } = driverVehicleContextMenu;
    const assignment = findAssignment(dateString, timeIndex);

    if (assignment?.id) {
      if (driverColumn === 2) {
        await updateDriverAssignment(assignment.id, {
          driver2: "",
          vehicle2: "",
        });
      } else {
        await updateDriverAssignment(assignment.id, {
          driver: "",
          vehicle: "",
        });
      }
    }
    setDriverVehicleContextMenu(null);
  };

  // Handle fill driver/vehicle for all time slots on this day
  const handleFillDriverVehicle = async () => {
    if (!driverVehicleContextMenu) return;

    const { timeIndex, driverColumn } = driverVehicleContextMenu;
    const assignment = findAssignment(dateString, timeIndex);

    if (assignment) {
      const driver = driverColumn === 2 ? (assignment.driver2 || "") : (assignment.driver || "");
      const vehicle = driverColumn === 2 ? (assignment.vehicle2 || "") : (assignment.vehicle || "");

      // Fill all time slots that don't have a driver/vehicle set
      for (let i = 0; i < timeSlots.length; i++) {
        const existingAssignment = findAssignment(dateString, i);
        if (existingAssignment?.id) {
          // Update existing assignment if it doesn't have driver/vehicle
          if (driverColumn === 2) {
            if (!existingAssignment.driver2 || !existingAssignment.vehicle2) {
              await updateDriverAssignment(existingAssignment.id, {
                driver2: driver,
                vehicle2: vehicle,
              });
            }
          } else {
            if (!existingAssignment.driver || !existingAssignment.vehicle) {
              await updateDriverAssignment(existingAssignment.id, {
                driver: driver,
                vehicle: vehicle,
              });
            }
          }
        } else {
          // Create new assignment
          const newAssignment: any = {
            date: dateString,
            timeIndex: i,
          };
          if (driverColumn === 2) {
            newAssignment.driver2 = driver;
            newAssignment.vehicle2 = vehicle;
          } else {
            newAssignment.driver = driver;
            newAssignment.vehicle = vehicle;
          }
          await addDriverAssignment(newAssignment);
        }
      }
    }

    setDriverVehicleContextMenu(null);
  };

  // Handle clear column - clear all driver/vehicle for this column on this day
  const handleClearColumn = async () => {
    if (!driverVehicleContextMenu) return;

    const { driverColumn } = driverVehicleContextMenu;

    // Clear all driver assignments for this day
    for (const assignment of driverAssignments) {
      if (assignment.id) {
        if (driverColumn === 2) {
          // Clear driver2/vehicle2
          if (assignment.driver2 || assignment.vehicle2) {
            await updateDriverAssignment(assignment.id, {
              driver2: "",
              vehicle2: "",
            });
          }
        } else {
          // Clear driver/vehicle
          if (assignment.driver || assignment.vehicle) {
            await updateDriverAssignment(assignment.id, {
              driver: "",
              vehicle: "",
            });
          }
        }
      }
    }

    setDriverVehicleContextMenu(null);
  };

  // Handle add second driver
  const handleAddSecondDriver = () => {
    setShowSecondDriverColumn(true);
    setDriverVehicleContextMenu(null);
  };

  // Handle delete second driver - hide column and clear all driver2/vehicle2 data
  const handleDeleteSecondDriver = async () => {
    // Clear driver2/vehicle2 from all driver assignments
    for (const assignment of driverAssignments) {
      if (assignment.id && (assignment.driver2 || assignment.vehicle2)) {
        await updateDriverAssignment(assignment.id, {
          driver2: "",
          vehicle2: "",
        });
      }
    }

    // Hide the second driver column
    setShowSecondDriverColumn(false);
    setDriverVehicleContextMenu(null);
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

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto p-4 bg-zinc-950"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        ref={gridRef}
        className={`inline-block origin-top-left ${!isPinching ? 'transition-transform duration-100' : ''}`}
        style={{ transform: `scale(${scale})` }}
      >
        <div className="grid gap-2" style={{ gridTemplateColumns: `80px repeat(${pilots.length}, 220px) 98px${showSecondDriverColumn ? ' 98px' : ''}` }}>
          {/* Header Row - Shows pilots present today */}
          <div className="h-7" />
          {pilots.map((p, index) => (
            <div
              key={p.uid}
              className={`h-7 flex items-center justify-center ${p.femalePilot ? 'bg-red-600/80' : 'bg-zinc-900'} rounded-lg font-medium text-sm gap-2`}
            >
              <span className={p.femalePilot ? 'text-white' : 'text-zinc-500'}>{index + 1}</span>
              <span>{p.displayName}</span>
            </div>
          ))}
          {/* Driver Header */}
          <div className="h-7 flex items-center justify-center bg-yellow-400/80 rounded-lg font-medium text-sm text-zinc-900">
            Driver
          </div>
          {/* Second Driver Header */}
          {showSecondDriverColumn && (
            <div className="h-7 flex items-center justify-center bg-yellow-400/80 rounded-lg font-medium text-sm text-zinc-900">
              Driver 2
            </div>
          )}

          {/* Time Slots and Booking Cells */}
          {timeSlots.map((timeSlot, timeIndex) => {
            // Get all bookings for this time slot
            const bookingsAtThisTime = bookings.filter(b => b.timeIndex === timeIndex);

            // Calculate how many pilot slots are occupied by bookings
            const slotsOccupiedByBookings = bookingsAtThisTime.reduce((total, booking) => {
              return total + (booking.numberOfPeople || booking.span || 1);
            }, 0);

            // Collect all cells for this time slot
            const cellsForRow: Array<{
              pilot?: any;
              pilotIndex?: number;
              status: "booked" | "available" | "noPilot";
              booking?: any;
              sortOrder: number; // 0=booked, 1=available, 2=noPilot
            }> = [];

            // Add booking cells first (they go on the left)
            bookingsAtThisTime.forEach(booking => {
              cellsForRow.push({
                status: "booked",
                booking,
                sortOrder: 0
              });
            });

            // Add ALL unavailable pilots first (they MUST be shown)
            const unavailablePilots: Array<{pilot: any, pilotIndex: number}> = [];
            const availablePilots: Array<{pilot: any, pilotIndex: number}> = [];

            pilots.forEach((pilot, pilotIndex) => {
              const isPilotAvailableThisSlot = isPilotAvailableForTimeSlot(pilot.uid, timeSlot);
              if (isPilotAvailableThisSlot) {
                availablePilots.push({pilot, pilotIndex});
              } else {
                unavailablePilots.push({pilot, pilotIndex});
              }
            });

            // Add all unavailable pilot cells
            unavailablePilots.forEach(({pilot, pilotIndex}) => {
              cellsForRow.push({
                pilot,
                pilotIndex,
                status: "noPilot",
                sortOrder: 2
              });
            });

            // Calculate how many available pilot cells we can show
            const totalCellsNeeded = pilots.length; // Total capacity
            const cellsUsed = slotsOccupiedByBookings + unavailablePilots.length;
            const availableSlotsToShow = totalCellsNeeded - cellsUsed;

            // Add available pilot cells (only up to the available slots)
            for (let i = 0; i < Math.min(availableSlotsToShow, availablePilots.length); i++) {
              const {pilot, pilotIndex} = availablePilots[i];
              cellsForRow.push({
                pilot,
                pilotIndex,
                status: "available",
                sortOrder: 1
              });
            }

            // Sort cells: booked first, then available, then noPilot
            cellsForRow.sort((a, b) => a.sortOrder - b.sortOrder);

            return [
              // Time Slot Label
              <div
                key={`time-${timeIndex}`}
                className="h-14 flex items-center justify-center bg-zinc-900 rounded-lg font-medium text-sm"
              >
                {timeSlot}
              </div>,

              // Render sorted cells
              ...cellsForRow.map((cell, cellIdx) => {
                if (cell.status === "booked" && cell.booking) {
                  const span = cell.booking.numberOfPeople || cell.booking.span || 1;
                  return (
                    <div
                      key={`booking-${timeIndex}-${cell.booking.id || cellIdx}`}
                      className="h-14"
                      style={{ gridColumn: `span ${span}` }}
                    >
                      <BookingAvailable
                        pilotId="" // Not tied to a specific pilot column anymore
                        timeSlot={timeSlot}
                        status="booked"
                        customerName={cell.booking.customerName}
                        pickupLocation={cell.booking.pickupLocation}
                        bookingSource={cell.booking.bookingSource}
                        assignedPilots={cell.booking.assignedPilots}
                        pilotPayments={cell.booking.pilotPayments}
                        bookingStatus={cell.booking.bookingStatus}
                        span={span}
                        femalePilotsRequired={cell.booking.femalePilotsRequired}
                        flightType={cell.booking.flightType}
                        notes={cell.booking.notes}
                        bookingSourceColor={getSourceColor(cell.booking.bookingSource)}
                        onBookedClick={() => handleBookedCellClick(cell.booking)}
                        onContextMenu={handleBookingContextMenu(cell.booking, timeSlot)}
                      />
                    </div>
                  );
                } else if (cell.pilot) {
                  // Available or noPilot cell
                  const isCurrentUserPilot = currentUserDisplayName === cell.pilot.displayName;
                  const currentUserPilot = pilots.find(p => p.displayName === currentUserDisplayName);
                  const currentUserPilotIndex = currentUserPilot ? pilots.findIndex(p => p.uid === currentUserPilot.uid) : -1;
                  const isCurrentUserAvailableAtThisTime = currentUserPilot && isPilotAvailableForTimeSlot(currentUserPilot.uid, timeSlot);

                  return (
                    <div
                      key={`pilot-${timeIndex}-${cell.pilot.uid}`}
                      className="h-14"
                      style={{ gridColumn: `span 1` }}
                    >
                      <BookingAvailable
                        pilotId={cell.pilot.displayName}
                        timeSlot={timeSlot}
                        status={cell.status}
                        span={1}
                        isCurrentUserPilot={isCurrentUserPilot}
                        isFemalePilot={cell.pilot.femalePilot}
                        onAvailableClick={
                          cell.status === "available"
                            ? () => handleAvailableCellClick(cell.pilotIndex!, timeIndex, timeSlot)
                            : undefined
                        }
                        onNoPilotContextMenu={
                          cell.status === "noPilot" && isCurrentUserPilot
                            ? handleNoPilotContextMenu(currentUserPilotIndex, timeIndex)
                            : undefined
                        }
                        onAvailableContextMenu={
                          cell.status === "available" && isCurrentUserAvailableAtThisTime
                            ? handleNoPilotContextMenu(currentUserPilotIndex, timeIndex)
                            : undefined
                        }
                      />
                    </div>
                  );
                }
                return null;
              }),

              // Driver/Vehicle Cell - Always show, reads from driverAssignments (independent of bookings)
              <div
                key={`driver-vehicle-${timeIndex}`}
                className="h-14"
              >
                {(() => {
                  // Always use driverAssignments, never booking fields
                  const assignment = findAssignment(dateString, timeIndex);
                  const cellBooking = (assignment?.driver || assignment?.vehicle) ? {
                    driver: assignment.driver,
                    vehicle: assignment.vehicle,
                  } as any : null;

                  return (
                    <DriverVehicleCell
                      booking={cellBooking}
                      onClick={() => handleDriverVehicleCellClick(null, 1, timeIndex)}
                      onContextMenu={handleDriverVehicleContextMenu(null, 1, timeIndex)}
                    />
                  );
                })()}
              </div>,

              // Second Driver/Vehicle Cell - Show only when second driver column is visible
              ...(showSecondDriverColumn ? [
                <div
                  key={`driver-vehicle-2-${timeIndex}`}
                  className="h-14"
                >
                  {(() => {
                    // Always use driverAssignments, never booking fields
                    const assignment = findAssignment(dateString, timeIndex);
                    const cellBooking = (assignment?.driver2 || assignment?.vehicle2) ? {
                      driver: assignment.driver2,
                      vehicle: assignment.vehicle2,
                    } as any : null;

                    return (
                      <DriverVehicleCell
                        booking={cellBooking}
                        onClick={() => handleDriverVehicleCellClick(null, 2, timeIndex)}
                        onContextMenu={handleDriverVehicleContextMenu(null, 2, timeIndex)}
                      />
                    );
                  })()}
                </div>
              ] : [])
            ];
          })}
        </div>
      </div>

      {/* Booking Requests Inbox */}
      {bookingRequests.length > 0 && (
        <div
          className="max-w-lg"
          style={{
            marginTop: `${24 + (gridHeight * (scale - 1))}px`
          }}
        >
          <h2 className="text-xl font-semibold text-white mb-3">New Booking Requests</h2>
          <div className="space-y-2">
            {bookingRequests.map((request) => (
              <BookingRequestItem
                key={request.id}
                request={request}
                onContextMenu={(req, position) => {
                  setBookingRequestContextMenu({
                    isOpen: true,
                    position,
                    request: req,
                  });
                }}
                onDateClick={(dateString) => {
                  if (onNavigateToDate) {
                    // Parse the date string (YYYY-MM-DD) to a Date object
                    const [year, month, day] = dateString.split('-').map(Number);
                    const date = new Date(year, month - 1, day);
                    onNavigateToDate(date);
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {selectedCell && (
        <NewBookingModal
          open={isModalOpen}
          onOpenChange={(open) => {
            setIsModalOpen(open);
            if (!open) {
              // Clear booking request data when modal closes
              setBookingRequestToBook(null);
            }
          }}
          selectedDate={selectedDate}
          pilotIndex={selectedCell.pilotIndex}
          timeIndex={selectedCell.timeIndex}
          timeSlot={selectedCell.timeSlot}
          pilots={pilots}
          bookings={bookings}
          isPilotAvailableForTimeSlot={isPilotAvailableForTimeSlot}
          onSubmit={handleBookingSubmit}
          initialData={bookingRequestToBook ? {
            customerName: bookingRequestToBook.customerName,
            numberOfPeople: bookingRequestToBook.numberOfPeople,
            phoneNumber: bookingRequestToBook.phone,
            email: bookingRequestToBook.email,
            notes: bookingRequestToBook.notes,
          } : undefined}
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

      {/* Driver/Vehicle Context Menu */}
      {driverVehicleContextMenu && (
        <DriverVehicleContextMenu
          isOpen={driverVehicleContextMenu.isOpen}
          position={driverVehicleContextMenu.position}
          onDelete={handleDeleteDriverVehicle}
          onFill={handleFillDriverVehicle}
          onClearColumn={handleClearColumn}
          onAddSecondDriver={
            driverVehicleContextMenu.driverColumn === 1 && !showSecondDriverColumn
              ? handleAddSecondDriver
              : undefined
          }
          onDeleteSecondDriver={
            showSecondDriverColumn
              ? handleDeleteSecondDriver
              : undefined
          }
          onClose={() => setDriverVehicleContextMenu(null)}
        />
      )}

      {/* Driver/Vehicle Modal */}
      <DriverVehicleModal
        isOpen={isDriverVehicleModalOpen}
        onClose={() => setIsDriverVehicleModalOpen(false)}
        booking={selectedBookingForDriverVehicle}
        driverColumn={selectedDriverColumn}
        timeIndex={selectedTimeIndex}
        date={selectedDriverDate}
      />

      {/* Booking Request Context Menu */}
      {bookingRequestContextMenu && (
        <BookingRequestContextMenu
          isOpen={bookingRequestContextMenu.isOpen}
          position={bookingRequestContextMenu.position}
          onBook={async () => {
            const request = bookingRequestContextMenu.request;
            if (!request.id || !onAddBooking) return;

            try {
              // Find the time index
              const timeSlotIndex = timeSlots.findIndex(slot => slot === request.time);

              if (timeSlotIndex === -1) {
                alert("The requested time slot is not available in the schedule.");
                return;
              }

              // Create the booking
              await onAddBooking({
                date: request.date,
                pilotIndex: 0, // Will be assigned later
                timeIndex: timeSlotIndex,
                customerName: request.customerName,
                numberOfPeople: request.numberOfPeople,
                pickupLocation: "",
                bookingSource: "twin",
                phoneNumber: request.phone || "",
                email: request.email,
                notes: request.notes || "",
                assignedPilots: [],
                bookingStatus: "pending",
                span: request.numberOfPeople,
              });

              // Mark request as approved
              await updateDoc(doc(db, "bookingRequests", request.id), {
                status: "approved",
              });
            } catch (error) {
              console.error("Error creating booking from request:", error);
              alert("Failed to create booking. Please try again.");
            }
          }}
          onBookForAnotherTime={() => {
            setBookingRequestToBook(bookingRequestContextMenu.request);
            // Open the new booking modal with default time slot (user can change it)
            setSelectedCell({ pilotIndex: 0, timeIndex: 0, timeSlot: timeSlots[0] });
            setIsModalOpen(true);
          }}
          onAddToWaitingList={async () => {
            const request = bookingRequestContextMenu.request;
            // For now, just show an alert. You can implement a waiting list feature later.
            alert(`Added ${request.customerName} to the waiting list for ${request.date} at ${request.time}`);

            // Optionally mark the request with a different status or add to a waiting list collection
            if (request.id) {
              await updateDoc(doc(db, "bookingRequests", request.id), {
                status: "rejected", // or create a "waiting_list" status
              });
            }
          }}
          onDelete={async () => {
            const request = bookingRequestContextMenu.request;
            if (!request.id) return;

            if (confirm(`Delete booking request from ${request.customerName}?`)) {
              try {
                await deleteDoc(doc(db, "bookingRequests", request.id));
              } catch (error) {
                console.error("Error deleting booking request:", error);
                alert("Failed to delete booking request. Please try again.");
              }
            }
          }}
          onClose={() => setBookingRequestContextMenu(null)}
        />
      )}
    </div>
  );
}

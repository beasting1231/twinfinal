import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { BookingAvailable } from "./BookingAvailable";
import { NewBookingModal } from "./NewBookingModal";
import { BookingDetailsModal } from "./BookingDetailsModal";
import { PilotContextMenu } from "./PilotContextMenu";
import { OverbookedPilotContextMenu } from "./OverbookedPilotContextMenu";
import { AvailabilityContextMenu } from "./AvailabilityContextMenu";
import { DriverVehicleCell } from "./DriverVehicleCell";
import { DriverVehicleModal } from "./DriverVehicleModal";
import { DriverVehicleContextMenu } from "./DriverVehicleContextMenu";
import { ScheduleBookingRequestContextMenu } from "./ScheduleBookingRequestContextMenu";
import { BookingRequestItem } from "./BookingRequestItem";
import { TimeSlotContextMenu } from "./TimeSlotContextMenu";
import { AddPilotModal } from "./AddPilotModal";
import { ChangeTimeModal } from "./ChangeTimeModal";
import { AddTimeModal } from "./AddTimeModal";
import { DeletedBookingContextMenu } from "./DeletedBookingContextMenu";
import { DeletedBookingItem } from "./DeletedBookingItem";
import { CollapsibleDriverMap } from "./CollapsibleDriverMap";
import { CollapsibleDriverOwnMap } from "./CollapsibleDriverOwnMap";
import { LocationToggle } from "./LocationToggle";
import { SearchBookingModal } from "./SearchBookingModal";
import { useBookingSourceColors } from "../hooks/useBookingSourceColors";
import { useDriverAssignments } from "../hooks/useDriverAssignments";
import { useBookingRequests } from "../hooks/useBookingRequests";
import { useAllPilots } from "../hooks/useAllPilots";
import { useAuth } from "../contexts/AuthContext";
import { useRole } from "../hooks/useRole";
import type { Booking, Pilot, BookingRequest } from "../types/index";
import { format } from "date-fns";
import { doc, updateDoc, setDoc, deleteDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import { DndContext, useSensor, useSensors, PointerSensor, useDraggable, useDroppable } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";

interface ScheduleGridProps {
  selectedDate: Date;
  pilots: Pilot[];
  timeSlots: string[];
  bookings?: Booking[];
  allBookingsForSearch?: Booking[];
  isPilotAvailableForTimeSlot: (pilotUid: string, timeSlot: string) => boolean;
  saveCustomPilotOrder?: (newOrder: string[]) => Promise<void>;
  loading?: boolean;
  currentUserDisplayName?: string;
  onAddBooking?: (booking: Omit<Booking, "id">) => void;
  onUpdateBooking?: (id: string, booking: Partial<Booking>) => void;
  onDeleteBooking?: (id: string) => void;
  onNavigateToDate?: (date: Date) => void;
}

// Draggable Pilot Header Component
function DraggablePilotHeader({ pilot, index, isAdmin, isDragging }: { pilot: Pilot; index: number; isAdmin: boolean; isDragging: boolean }) {
  const id = `pilot-header-${index}`;

  const { attributes, listeners, setNodeRef: setDragNodeRef, transform } = useDraggable({
    id,
    disabled: !isAdmin,
  });

  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id,
    disabled: !isAdmin,
  });

  const setNodeRef = (node: HTMLElement | null) => {
    setDragNodeRef(node);
    setDropNodeRef(node);
  };

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(isAdmin ? listeners : {})}
      {...(isAdmin ? attributes : {})}
      className={`h-7 flex items-center justify-center ${pilot.femalePilot ? 'bg-red-600/80 text-white' : 'bg-gray-200 dark:bg-zinc-900 text-gray-900 dark:text-white'} rounded-lg font-medium text-sm gap-2 ${isAdmin ? 'cursor-move' : ''} ${isOver ? 'ring-2 ring-blue-500' : ''} transition-all`}
      title={isAdmin ? 'Drag to reorder (Admin only)' : ''}
    >
      <span className={pilot.femalePilot ? 'text-white' : 'text-gray-600 dark:text-zinc-500'}>{index + 1}</span>
      <span>{pilot.displayName}</span>
    </div>
  );
}

export function ScheduleGrid({ selectedDate, pilots, timeSlots, bookings: allBookings = [], allBookingsForSearch = [], isPilotAvailableForTimeSlot, saveCustomPilotOrder, loading = false, currentUserDisplayName, onAddBooking, onUpdateBooking, onDeleteBooking, onNavigateToDate }: ScheduleGridProps) {
  // Filter out deleted bookings from the main grid
  const bookings = useMemo(() => {
    return allBookings.filter(booking => booking.bookingStatus !== "deleted");
  }, [allBookings]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ pilotIndex: number; timeIndex: number; timeSlot: string } | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  // Get current user and role for permission checks
  const { currentUser } = useAuth();
  const { role} = useRole();

  // Get all pilots from system (for overbooked assignments)
  const { allPilots: systemPilots } = useAllPilots();

  // Detect if user is on mobile device
  const isMobile = useMemo(() => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0);
  }, []);

  // Calculate max columns needed (for overbooking support)
  const maxColumnsNeeded = useMemo(() => {
    let maxCols = pilots.length;

    // Check each time slot for overbookings
    timeSlots.forEach((timeSlot, timeIndex) => {
      const bookingsAtTime = bookings.filter(b => b.timeIndex === timeIndex);
      const bookingSlots = bookingsAtTime.reduce((total, booking) => {
        return total + (booking.numberOfPeople || booking.span || 1);
      }, 0);

      // Count unavailable pilots at this time
      const unavailableCount = pilots.filter(p => !isPilotAvailableForTimeSlot(p.uid, timeSlot)).length;

      // Total cells needed = bookings + unavailable pilots
      const cellsNeeded = bookingSlots + unavailableCount;

      if (cellsNeeded > maxCols) {
        maxCols = cellsNeeded;
      }
    });

    // Ensure at least 1 column exists so bookings can be created even with 0 pilots
    return Math.max(1, maxCols);
  }, [pilots, timeSlots, bookings, isPilotAvailableForTimeSlot]);

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
  const { bookingRequests, updateBookingRequest, deleteBookingRequest } = useBookingRequests();

  // Filter booking requests by status
  const pendingRequests = useMemo(() => {
    return bookingRequests.filter(req => req.status === "pending");
  }, [bookingRequests]);

  const waitlistRequests = useMemo(() => {
    // Only show waitlist requests for the currently selected date
    return bookingRequests.filter(req => req.status === "waitlist" && req.date === dateString);
  }, [bookingRequests, dateString]);

  const deletedBookings = useMemo(() => {
    // Only show deleted bookings for the currently selected date
    return allBookings.filter(booking => booking.bookingStatus === "deleted" && booking.date === dateString);
  }, [allBookings, dateString]);

  // Helper function to calculate available spots for a booking request
  const getAvailableSpotsForRequest = (request: BookingRequest): number => {
    // Find the time slot for this request
    const timeSlot = timeSlots[request.timeIndex];
    if (!timeSlot) return 0;

    // Count available pilots at this time
    const availablePilotsCount = pilots.filter(p => isPilotAvailableForTimeSlot(p.uid, timeSlot)).length;

    // Get bookings at this time slot on the requested date
    const bookingsAtTime = bookings.filter(b => b.timeIndex === request.timeIndex && b.date === request.date);

    // Calculate total spots already booked
    const spotsBooked = bookingsAtTime.reduce((total, booking) => {
      return total + (booking.numberOfPeople || booking.span || 1);
    }, 0);

    // Available spots = available pilots - spots already booked
    return Math.max(0, availablePilotsCount - spotsBooked);
  };

  // Move mode state (admin only)
  const [moveMode, setMoveMode] = useState<{
    isActive: boolean;
    booking: Booking | null;
  }>({ isActive: false, booking: null });

  const [requestMoveMode, setRequestMoveMode] = useState<{
    isActive: boolean;
    request: BookingRequest | null;
  }>({ isActive: false, request: null });

  const [deletedBookingMoveMode, setDeletedBookingMoveMode] = useState<{
    isActive: boolean;
    booking: Booking | null;
  }>({ isActive: false, booking: null });

  // Booking request context menu state
  const [bookingRequestContextMenu, setBookingRequestContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    request: BookingRequest;
  } | null>(null);

  // State for pre-filling new booking modal from a booking request
  const [bookingRequestToBook, setBookingRequestToBook] = useState<BookingRequest | null>(null);

  // Deleted booking context menu state
  const [deletedBookingContextMenu, setDeletedBookingContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    booking: Booking;
  } | null>(null);

  // State for restoring deleted booking
  const [deletedBookingToRestore, setDeletedBookingToRestore] = useState<Booking | null>(null);

  // Search modal state
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [highlightedBookingId, setHighlightedBookingId] = useState<string | null>(null);

  // Handle search result click - navigate to the booking's date and highlight it
  const handleSearchBookingClick = (booking: Booking) => {
    if (!booking.date || !onNavigateToDate) return;

    try {
      const [year, month, day] = booking.date.split('-').map(Number);
      const date = new Date(year, month - 1, day);

      // Set the highlighted booking
      setHighlightedBookingId(booking.id || null);

      // Navigate to the date
      onNavigateToDate(date);
    } catch (error) {
      console.error('Error navigating to booking date:', error);
    }
  };

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    booking: Booking;
    slotIndex: number;
    timeSlot: string;
    isPilotSelfUnassign?: boolean;
  } | null>(null);

  // Overbooked position context menu state
  const [overbookedContextMenu, setOverbookedContextMenu] = useState<{
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

  // Drag and drop state - track active drag for validation and multi-column highlighting
  const [draggedBooking, setDraggedBooking] = useState<Booking | null>(null);
  const [draggedRequest, setDraggedRequest] = useState<BookingRequest | null>(null);
  const [draggedDeletedBooking, setDraggedDeletedBooking] = useState<Booking | null>(null);
  const [draggedPilotIndex, setDraggedPilotIndex] = useState<number | null>(null);

  // Time slot context menu state
  const [timeSlotContextMenu, setTimeSlotContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    timeIndex: number;
    timeSlot: string;
    isAdditional: boolean;
  } | null>(null);

  // Add pilot modal state
  const [addPilotModal, setAddPilotModal] = useState<{
    isOpen: boolean;
    timeIndex: number;
    timeSlot: string;
  } | null>(null);

  // Change time modal state
  const [changeTimeModal, setChangeTimeModal] = useState<{
    isOpen: boolean;
    timeIndex: number;
    timeSlot: string;
  } | null>(null);

  // Add time modal state
  const [addTimeModal, setAddTimeModal] = useState<{
    isOpen: boolean;
  } | null>(null);

  // Time overrides state - maps timeIndex to new time string
  const [timeOverrides, setTimeOverrides] = useState<Record<number, string>>({});

  // Additional time slots state - extra time slots added by admin
  const [additionalSlots, setAdditionalSlots] = useState<string[]>([]);

  // State for all pilots (not just those available on the selected date)
  const [allPilots, setAllPilots] = useState<Pilot[]>([]);

  // Fetch all pilots from userProfiles (for Add Pilot modal)
  useEffect(() => {
    const pilotsQuery = query(
      collection(db, "userProfiles"),
      where("role", "in", ["pilot", "admin"])
    );

    const unsubscribe = onSnapshot(pilotsQuery, (snapshot) => {
      const pilotsData: Pilot[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          uid: data.uid,
          displayName: data.displayName || "Unknown Pilot",
          email: data.email || "",
          femalePilot: data.femalePilot || false,
          priority: data.priority || undefined,
        };
      });

      // Sort by priority and name
      pilotsData.sort((a, b) => {
        const aPriority = a.priority ?? 999999;
        const bPriority = b.priority ?? 999999;
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        return a.displayName.localeCompare(b.displayName);
      });

      setAllPilots(pilotsData);
    });

    return () => unsubscribe();
  }, []);

  // Fetch time overrides and additional slots for the selected date
  useEffect(() => {
    const dateString = format(selectedDate, 'yyyy-MM-dd');
    const timeOverridesRef = doc(db, 'timeOverrides', dateString);

    const unsubscribe = onSnapshot(timeOverridesRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setTimeOverrides(data.overrides || {});
        setAdditionalSlots(data.additionalSlots || []);
      } else {
        setTimeOverrides({});
        setAdditionalSlots([]);
      }
    });

    return () => unsubscribe();
  }, [selectedDate]);

  // Helper function to parse time string to minutes for sorting
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Combined time slots: merge default slots with additional slots, sorted by time
  const combinedTimeSlots = useMemo(() => {
    // Create entries for default slots
    const defaultEntries = timeSlots.map((time, index) => ({
      time,
      displayTime: timeOverrides[index] || time,
      originalIndex: index,
      isAdditional: false,
    }));

    // Create entries for additional slots (use indices starting from 1000)
    const additionalEntries = additionalSlots.map((time, index) => ({
      time,
      displayTime: time,
      originalIndex: 1000 + index,
      isAdditional: true,
    }));

    // Combine and sort by time
    const combined = [...defaultEntries, ...additionalEntries];
    combined.sort((a, b) => timeToMinutes(a.displayTime) - timeToMinutes(b.displayTime));

    return combined;
  }, [timeSlots, additionalSlots, timeOverrides]);

  // Configure drag sensors for better interaction - disable on mobile
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    })
  );

  // Disable drag-and-drop on mobile (use long press move mode instead)
  const isDragEnabled = !isMobile && role === 'admin';

  // Helper function to check if there's enough space for a booking at a given time
  const hasEnoughSpaceAtTime = useCallback((timeIndex: number, _startPilotIndex: number, requiredPax: number): boolean => {
    // Get all bookings at this time
    const bookingsAtThisTime = bookings.filter(b => b.timeIndex === timeIndex && b.date === format(selectedDate, 'yyyy-MM-dd'));

    // Calculate occupied slots at this time
    const slotsOccupied = bookingsAtThisTime.reduce((total, booking) => {
      return total + (booking.numberOfPeople || booking.span || 1);
    }, 0);

    // Count unavailable pilots at this time
    const unavailablePilotsCount = pilots.filter((pilot) => {
      const timeSlot = timeSlots[timeIndex];
      return !isPilotAvailableForTimeSlot(pilot.uid, timeSlot);
    }).length;

    // Total capacity is the number of pilots
    const totalCapacity = pilots.length;

    // Available space is what's left after occupied bookings and unavailable pilots
    const availableSpace = totalCapacity - slotsOccupied - unavailablePilotsCount;

    return availableSpace >= requiredPax;
  }, [bookings, pilots, timeSlots, selectedDate, isPilotAvailableForTimeSlot]);

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
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef<boolean>(false);

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

  // Handle sticky time column when zoomed (CSS sticky breaks with transform)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || scale === 1) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const stickyElements = container.querySelectorAll('[data-sticky-column="true"]');

      stickyElements.forEach((el) => {
        const element = el as HTMLElement;
        // Compensate for the scroll position, accounting for scale
        element.style.transform = `translateX(${scrollLeft / scale}px)`;
      });
    };

    container.addEventListener('scroll', handleScroll);
    // Initial call in case already scrolled
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      // Reset transforms when scale returns to 1
      const stickyElements = container.querySelectorAll('[data-sticky-column="true"]');
      stickyElements.forEach((el) => {
        (el as HTMLElement).style.transform = '';
      });
    };
  }, [scale]);

  // Check if the selected date is more than 24 hours in the past
  const isSelectedDateOlderThan24Hours = useMemo(() => {
    // Set to end of day to be generous
    const dateEnd = new Date(selectedDate);
    dateEnd.setHours(23, 59, 59, 999);
    const now = new Date();
    const hoursDifference = (now.getTime() - dateEnd.getTime()) / (1000 * 60 * 60);
    return hoursDifference > 24;
  }, [selectedDate]);

  // Check if editing/creating is allowed for the current date (admins always, others only within 24 hours)
  const canEditForSelectedDate = useMemo(() => {
    if (role === 'admin') return true;
    return !isSelectedDateOlderThan24Hours;
  }, [role, isSelectedDateOlderThan24Hours]);

  const handleAvailableCellClick = useCallback((pilotIndex: number, timeIndex: number, timeSlot: string) => {
    // Check if creating bookings is allowed for this date
    if (!canEditForSelectedDate) {
      return;
    }
    setSelectedCell({ pilotIndex, timeIndex, timeSlot });
    setIsModalOpen(true);
  }, [canEditForSelectedDate]);

  // Check if a booking can be clicked by the current user
  const canViewBooking = useCallback((booking: Booking) => {
    // Agency users can only view bookings they created
    if (role === "agency" && booking.createdBy !== currentUser?.uid) {
      return false;
    }
    return true;
  }, [role, currentUser]);

  // Check if user can manage pilot assignments (context menu)
  const canManagePilots = useCallback(() => {
    // Agency and pilot users cannot assign/unassign pilots
    return role !== "agency" && role !== "pilot";
  }, [role]);

  // Check if user can manage drivers
  const canManageDrivers = useCallback(() => {
    // Only driver and admin can manage drivers
    return role === "driver" || role === "admin";
  }, [role]);

  // Move mode functions (admin only)
  const enterMoveMode = (booking: Booking) => {
    if (role !== 'admin') return;
    // Close all context menus when entering move mode
    setContextMenu(null);
    setOverbookedContextMenu(null);
    setAvailabilityContextMenu(null);
    setBookingRequestContextMenu(null);
    setMoveMode({ isActive: true, booking });
  };

  const exitMoveMode = () => {
    setMoveMode({ isActive: false, booking: null });
  };

  const enterRequestMoveMode = (request: BookingRequest) => {
    if (role !== 'admin') return;
    // Close all context menus when entering move mode
    setBookingRequestContextMenu(null);
    setRequestMoveMode({ isActive: true, request });
  };

  const exitRequestMoveMode = () => {
    setRequestMoveMode({ isActive: false, request: null });
  };

  const enterDeletedBookingMoveMode = (booking: Booking) => {
    if (role !== 'admin') return;
    // Close all context menus when entering move mode
    setDeletedBookingContextMenu(null);
    setDeletedBookingMoveMode({ isActive: true, booking });
  };

  const exitDeletedBookingMoveMode = () => {
    setDeletedBookingMoveMode({ isActive: false, booking: null });
  };

  // Handle move mode destination - time slot click
  const handleMoveModeDestination = async (targetTimeIndex: number) => {
    // Handle booking request move mode
    if (requestMoveMode.isActive && requestMoveMode.request && onAddBooking) {
      const request = requestMoveMode.request;
      const targetDate = format(selectedDate, 'yyyy-MM-dd');
      const targetTimeSlot = timeSlots[targetTimeIndex];

      // Show confirmation dialog
      const confirmMessage = `Are you sure you want to create a booking for ${request.customerName} (${request.numberOfPeople} pax) at ${targetTimeSlot}?`;
      if (!confirm(confirmMessage)) {
        return;
      }

      try {
        // Create booking from request
        await onAddBooking({
          date: targetDate,
          pilotIndex: 0,
          timeIndex: targetTimeIndex,
          customerName: request.customerName,
          numberOfPeople: request.numberOfPeople,
          pickupLocation: request.meetingPoint || "",
          bookingSource: "twin",
          phoneNumber: request.phone || "",
          email: request.email,
          notes: request.notes || "",
          flightType: request.flightType,
          assignedPilots: [],
          bookingStatus: "pending",
          span: request.numberOfPeople,
        });

        // Mark request as approved
        if (request.id) {
          await updateDoc(doc(db, "bookingRequests", request.id), {
            status: "approved",
          });
        }

        // Exit move mode
        exitRequestMoveMode();
      } catch (error) {
        console.error('Error creating booking from request:', error);
        alert('Failed to create booking. Please try again.');
      }
    }

    // Handle deleted booking restore mode
    if (deletedBookingMoveMode.isActive && deletedBookingMoveMode.booking && onUpdateBooking) {
      const booking = deletedBookingMoveMode.booking;
      const targetDate = format(selectedDate, 'yyyy-MM-dd');
      const targetTimeSlot = timeSlots[targetTimeIndex];

      // Show confirmation dialog
      const confirmMessage = `Are you sure you want to restore this booking for ${booking.customerName} (${booking.numberOfPeople} pax) at ${targetTimeSlot}?`;
      if (!confirm(confirmMessage)) {
        return;
      }

      try {
        // Restore the booking: update status to pending, move to new time/date, and clear pilots
        await onUpdateBooking(booking.id!, {
          bookingStatus: "pending",
          timeIndex: targetTimeIndex,
          date: targetDate,
          assignedPilots: [],
        });

        // Exit move mode
        exitDeletedBookingMoveMode();
      } catch (error) {
        console.error('Error restoring deleted booking:', error);
        alert('Failed to restore booking. Please try again.');
      }
    }

    // Handle booking move mode
    if (moveMode.isActive && moveMode.booking && onUpdateBooking) {
      const booking = moveMode.booking;
      const targetDate = format(selectedDate, 'yyyy-MM-dd');
      const targetTimeSlot = timeSlots[targetTimeIndex];

      // Don't update if dropping on the same time
      if (booking.timeIndex === targetTimeIndex && booking.date === targetDate) {
        exitMoveMode();
        return;
      }

      // Show confirmation dialog
      const confirmMessage = `Are you sure you want to move this booking to ${targetTimeSlot}?`;
      if (!confirm(confirmMessage)) {
        return;
      }

      try {
        // Move the booking to new time and clear pilots
        await onUpdateBooking(booking.id!, {
          timeIndex: targetTimeIndex,
          date: targetDate,
          assignedPilots: [],
        });

        // Exit move mode
        exitMoveMode();
      } catch (error) {
        console.error('Error moving booking:', error);
        alert('Failed to move booking. Please try again.');
      }
    }
  };

  const handleBookedCellClick = useCallback((booking: Booking) => {
    if (!canViewBooking(booking)) {
      return; // Don't open modal for bookings user cannot view
    }

    // Clear highlight when booking is clicked
    setHighlightedBookingId(null);

    setSelectedBooking(booking);
    setIsDetailsModalOpen(true);
  }, [canViewBooking]);

  const handleBookingSubmit = useCallback(async (booking: Omit<Booking, "id">) => {
    // If restoring a deleted booking to a new time, update the existing booking
    if (deletedBookingToRestore?.id && onUpdateBooking) {
      try {
        await onUpdateBooking(deletedBookingToRestore.id, {
          date: booking.date,
          timeIndex: booking.timeIndex,
          pilotIndex: booking.pilotIndex,
          bookingStatus: "pending",
          assignedPilots: [],
        });
      } catch (error) {
        console.error("Error restoring deleted booking:", error);
        alert("Failed to restore booking. Please try again.");
      }
    } else if (onAddBooking) {
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
    setDeletedBookingToRestore(null);
  }, [onAddBooking, onUpdateBooking, bookingRequestToBook, deletedBookingToRestore]);

  const handleDriverVehicleCellClick = useCallback((booking: Booking | null, driverColumn: 1 | 2 = 1, timeIndex: number) => {
    // Only driver and admin can manage drivers
    if (!canManageDrivers()) {
      return;
    }
    setSelectedBookingForDriverVehicle(booking);
    setSelectedDriverColumn(driverColumn);
    setSelectedTimeIndex(timeIndex);
    setSelectedDriverDate(selectedDate);
    setIsDriverVehicleModalOpen(true);
  }, [selectedDate, canManageDrivers]);

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
    // Check if editing is allowed for this date (non-admins cannot edit past 24 hours)
    if (!canEditForSelectedDate) {
      return;
    }

    // Check if this is a pilot clicking on their own assigned position
    const assignedPilotAtSlot = booking.assignedPilots[slotIndex];
    const isPilotSelfUnassign = !!(role === "pilot" &&
      currentUserDisplayName &&
      assignedPilotAtSlot === currentUserDisplayName);

    // If it's a pilot and they're NOT clicking on their own position, don't open context menu
    if (role === "pilot" && !isPilotSelfUnassign) {
      return;
    }

    setContextMenu({
      isOpen: true,
      position,
      booking,
      slotIndex,
      timeSlot,
      isPilotSelfUnassign,
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

  // Handle overbooked pilot selection from context menu
  const handleSelectOverbookedPilot = (pilotName: string) => {
    if (!overbookedContextMenu || !onUpdateBooking) return;

    const { booking, slotIndex } = overbookedContextMenu;
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

  // Handle overbooked pilot un-assignment from context menu
  const handleUnassignOverbookedPilot = () => {
    if (!overbookedContextMenu || !onUpdateBooking) return;

    const { booking, slotIndex } = overbookedContextMenu;
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

  // Handle pilot clicking on their own name to open context menu for unassignment
  const handlePilotNameClick = useCallback((booking: Booking, timeSlot: string) => (
    slotIndex: number,
    pilotName: string,
    position: { x: number; y: number }
  ) => {
    // Check if editing is allowed for this date (non-admins cannot edit past 24 hours)
    if (!canEditForSelectedDate) return;

    if (!currentUserDisplayName || pilotName !== currentUserDisplayName) return;

    // Only allow pilots to click their own names
    if (role !== "pilot") return;

    // Open context menu with isPilotSelfUnassign flag
    setContextMenu({
      isOpen: true,
      position,
      booking,
      slotIndex,
      timeSlot,
      isPilotSelfUnassign: true,
    });
  }, [currentUserDisplayName, role, canEditForSelectedDate]);

  // Handle opening availability context menu
  const handleNoPilotContextMenu = (pilotIndex: number, timeIndex: number) => (position: { x: number; y: number }) => {
    // Check if editing is allowed for this date (non-admins cannot edit past 24 hours)
    if (!canEditForSelectedDate) return;

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
      const { query, collection, where, getDocs, deleteDoc, doc, updateDoc } = await import("firebase/firestore");
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

      // Find and unassign pilot from any bookings at this time
      const bookingsAtThisTime = bookings.filter(
        booking => booking.date === dateStr && booking.timeIndex === timeIndex
      );

      // Unassign pilot from each booking they're assigned to
      const unassignPromises = bookingsAtThisTime.map(async (booking) => {
        const pilotDisplayName = pilot.displayName;
        const assignedIndex = booking.assignedPilots.findIndex(p => p === pilotDisplayName);

        if (assignedIndex !== -1) {
          // Create updated pilots array with pilot removed (replaced with empty string)
          const updatedPilots = [...booking.assignedPilots];
          updatedPilots[assignedIndex] = "";

          // Update the booking
          if (onUpdateBooking && booking.id) {
            await updateDoc(doc(db, "bookings", booking.id), {
              assignedPilots: updatedPilots
            });
          }
        }
      });

      await Promise.all(unassignPromises);

      console.log("Signed out successfully and unassigned from bookings");
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

  // Handle time slot context menu (admin only)
  const handleTimeSlotContextMenu = (timeIndex: number, timeSlot: string, isAdditional: boolean = false) => (e: React.MouseEvent) => {
    if (role !== 'admin') return;

    e.preventDefault();
    e.stopPropagation();

    setTimeSlotContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      timeIndex,
      timeSlot,
      isAdditional,
    });
  };

  // Handle long press on time slot for mobile (admin only)
  const handleTimeSlotTouchStart = (timeIndex: number, timeSlot: string, isAdditional: boolean = false) => (e: React.TouchEvent) => {
    if (role !== 'admin') return;

    // Clear any existing timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTriggeredRef.current = false;

    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    // Set timer for long press (500ms)
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setTimeSlotContextMenu({
        isOpen: true,
        position: { x, y },
        timeIndex,
        timeSlot,
        isAdditional,
      });
    }, 500);
  };

  const handleTimeSlotTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTimeSlotTouchMove = () => {
    // Cancel long press if user moves finger
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Handle adding a pilot to a time slot
  const handleAddPilot = async (pilotUid: string) => {
    if (!addPilotModal) return;

    const { timeSlot } = addPilotModal;
    const dateString = format(selectedDate, 'yyyy-MM-dd');

    try {
      // Find the pilot in allPilots
      const pilot = allPilots.find(p => p.uid === pilotUid);
      if (!pilot) {
        alert('Pilot not found');
        return;
      }

      // Check if this availability already exists
      const { getDocs, addDoc } = await import('firebase/firestore');
      const availabilityQuery = query(
        collection(db, 'availability'),
        where('userId', '==', pilotUid),
        where('date', '==', dateString),
        where('timeSlot', '==', timeSlot)
      );

      const existingDocs = await getDocs(availabilityQuery);

      // Only add if it doesn't already exist
      if (existingDocs.empty) {
        await addDoc(collection(db, 'availability'), {
          userId: pilotUid,
          date: dateString,
          timeSlot: timeSlot,
        });
      }

      // Close modal
      setAddPilotModal(null);
    } catch (error) {
      console.error('Error adding pilot availability:', error);
      alert('Failed to add pilot. Please try again.');
    }
  };

  // Handle changing a time slot's displayed time
  const handleChangeTime = async (newTime: string | null) => {
    if (!changeTimeModal) return;

    const { timeIndex } = changeTimeModal;
    const dateString = format(selectedDate, 'yyyy-MM-dd');
    const timeOverridesRef = doc(db, 'timeOverrides', dateString);

    try {
      if (newTime === null) {
        // Remove the override for this time index
        const newOverrides = { ...timeOverrides };
        delete newOverrides[timeIndex];

        if (Object.keys(newOverrides).length === 0 && additionalSlots.length === 0) {
          // Delete the entire document if no overrides or additional slots left
          await deleteDoc(timeOverridesRef);
        } else {
          await setDoc(timeOverridesRef, { overrides: newOverrides, additionalSlots, date: dateString });
        }
      } else {
        // Set or update the override
        const newOverrides = { ...timeOverrides, [timeIndex]: newTime };
        await setDoc(timeOverridesRef, { overrides: newOverrides, additionalSlots, date: dateString });
      }

      setChangeTimeModal(null);
    } catch (error) {
      console.error('Error changing time:', error);
      alert('Failed to change time. Please try again.');
    }
  };

  // Handle adding a new time slot
  const handleAddTimeSlot = async (newTime: string) => {
    const dateString = format(selectedDate, 'yyyy-MM-dd');
    const timeOverridesRef = doc(db, 'timeOverrides', dateString);

    try {
      const newAdditionalSlots = [...additionalSlots, newTime];
      await setDoc(timeOverridesRef, {
        overrides: timeOverrides,
        additionalSlots: newAdditionalSlots,
        date: dateString
      });
      setAddTimeModal(null);
    } catch (error) {
      console.error('Error adding time slot:', error);
      alert('Failed to add time slot. Please try again.');
    }
  };

  // Handle removing an additional time slot
  const handleRemoveTimeSlot = async (timeToRemove: string) => {
    const dateString = format(selectedDate, 'yyyy-MM-dd');
    const timeOverridesRef = doc(db, 'timeOverrides', dateString);

    // Find the timeIndex for this additional slot
    const slotIndex = additionalSlots.indexOf(timeToRemove);
    if (slotIndex === -1) {
      console.error('Time slot not found in additionalSlots');
      return;
    }
    const timeIndex = 1000 + slotIndex;

    // Find all bookings at this time slot
    const bookingsToDelete = bookings.filter(
      b => b.timeIndex === timeIndex && b.date === dateString
    );

    // Confirm deletion if there are bookings
    if (bookingsToDelete.length > 0) {
      const confirmDelete = window.confirm(
        `This will also delete ${bookingsToDelete.length} booking(s) at ${timeToRemove}. Are you sure?`
      );
      if (!confirmDelete) return;
    }

    try {
      // Delete all bookings at this time slot
      for (const booking of bookingsToDelete) {
        if (booking.id) {
          await deleteDoc(doc(db, 'bookings', booking.id));
        }
      }

      // Remove the time slot
      const newAdditionalSlots = additionalSlots.filter(t => t !== timeToRemove);

      if (Object.keys(timeOverrides).length === 0 && newAdditionalSlots.length === 0) {
        // Delete the entire document if nothing left
        await deleteDoc(timeOverridesRef);
      } else {
        await setDoc(timeOverridesRef, {
          overrides: timeOverrides,
          additionalSlots: newAdditionalSlots,
          date: dateString
        });
      }
    } catch (error) {
      console.error('Error removing time slot:', error);
      alert('Failed to remove time slot. Please try again.');
    }
  };

  // Handle drag start - track what's being dragged for validation
  const handleDragStart = (event: DragStartEvent) => {
    // Disable drag on mobile
    if (!isDragEnabled) return;

    const { active } = event;

    // Check if dragging a pilot header
    if (typeof active.id === 'string' && active.id.startsWith('pilot-header-')) {
      const pilotIndex = parseInt(active.id.replace('pilot-header-', ''));
      if (!isNaN(pilotIndex)) {
        setDraggedPilotIndex(pilotIndex);
      }
    } else if (typeof active.id === 'string' && active.id.startsWith('deleted-booking-')) {
      const bookingId = active.id.replace('deleted-booking-', '');
      const booking = deletedBookings.find(b => b.id === bookingId);
      if (booking) {
        setDraggedDeletedBooking(booking);
      }
    } else if (typeof active.id === 'string' && active.id.startsWith('booking-')) {
      const bookingId = active.id.replace('booking-', '');
      const booking = bookings.find(b => b.id === bookingId);
      if (booking) {
        setDraggedBooking(booking);
      }
    } else if (typeof active.id === 'string' && active.id.startsWith('request-')) {
      const requestId = active.id.replace('request-', '');
      const request = bookingRequests.find(r => r.id === requestId);
      if (request) {
        setDraggedRequest(request);
      }
    }
  };

  // Handle drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    // Disable drag on mobile
    if (!isDragEnabled) {
      // Clear drag state
      setDraggedBooking(null);
      setDraggedRequest(null);
      setDraggedDeletedBooking(null);
      setDraggedPilotIndex(null);
      return;
    }

    const { active, over } = event;

    // Handle pilot header reordering (admin only)
    if (typeof active.id === 'string' && active.id.startsWith('pilot-header-') && over && typeof over.id === 'string' && over.id.startsWith('pilot-header-')) {
      setDraggedPilotIndex(null);

      // Only admins can reorder pilots
      if (role !== 'admin') {
        alert('Only administrators can reorder pilots');
        return;
      }

      const fromIndex = parseInt(active.id.replace('pilot-header-', ''));
      const toIndex = parseInt(over.id.replace('pilot-header-', ''));

      if (isNaN(fromIndex) || isNaN(toIndex) || fromIndex === toIndex) return;

      // Reorder pilots array
      const newPilots = [...pilots];
      const [movedPilot] = newPilots.splice(fromIndex, 1);
      newPilots.splice(toIndex, 0, movedPilot);

      // Save the new order
      if (saveCustomPilotOrder) {
        try {
          const newOrder = newPilots.map(p => p.uid);
          await saveCustomPilotOrder(newOrder);
        } catch (error) {
          console.error('Error saving pilot order:', error);
          alert('Failed to save pilot order. Please try again.');
        }
      }

      return;
    }

    // Clear drag state
    setDraggedBooking(null);
    setDraggedRequest(null);
    setDraggedDeletedBooking(null);
    setDraggedPilotIndex(null);

    if (!over) return;

    // Parse the drop target ID (format: "droppable-timeIndex-pilotIndex")
    const overIdStr = over.id as string;
    if (!overIdStr.startsWith('droppable-')) return;

    const parts = overIdStr.split('-');
    if (parts.length !== 3) return;

    const targetTimeIndex = parseInt(parts[1]);
    const targetPilotIndex = parseInt(parts[2]);

    if (isNaN(targetTimeIndex) || isNaN(targetPilotIndex)) return;

    const targetDate = format(selectedDate, 'yyyy-MM-dd');

    // Handle booking being moved
    if (typeof active.id === 'string' && active.id.startsWith('booking-')) {
      const bookingId = active.id.replace('booking-', '');
      const booking = bookings.find(b => b.id === bookingId);

      if (!booking || !onUpdateBooking) return;

      // Only admins can move bookings
      if (role !== 'admin') {
        alert('Only administrators can move bookings');
        return;
      }

      // Don't update if dropping on the same time
      if (booking.timeIndex === targetTimeIndex && booking.date === targetDate) {
        return;
      }

      // Show confirmation dialog
      const targetTimeSlot = timeSlots[targetTimeIndex];
      const confirmMessage = `Are you sure you want to move this booking to ${targetTimeSlot}?`;
      if (!confirm(confirmMessage)) {
        return;
      }

      // Update the booking with new time/date and clear assigned pilots
      try {
        await onUpdateBooking(booking.id!, {
          timeIndex: targetTimeIndex,
          date: targetDate,
          assignedPilots: [], // Clear all pilot assignments
        });
      } catch (error) {
        console.error('Error moving booking:', error);
        alert('Failed to move booking. Please try again.');
      }
    }
    // Handle booking request being dropped
    else if (typeof active.id === 'string' && active.id.startsWith('request-')) {
      const requestId = active.id.replace('request-', '');
      const request = bookingRequests.find(r => r.id === requestId);

      if (!request || !onAddBooking) return;

      // Only admins can create bookings from requests
      if (role !== 'admin') {
        alert('Only administrators can create bookings');
        return;
      }

      // Show confirmation dialog
      const targetTimeSlot = timeSlots[targetTimeIndex];
      const confirmMessage = `Are you sure you want to create a booking for ${request.customerName} (${request.numberOfPeople} pax) at ${targetTimeSlot}?`;
      if (!confirm(confirmMessage)) {
        return;
      }

      // Create a booking from the request at the dropped location
      try {
        await onAddBooking({
          date: targetDate,
          pilotIndex: targetPilotIndex,
          timeIndex: targetTimeIndex,
          customerName: request.customerName,
          numberOfPeople: request.numberOfPeople,
          pickupLocation: request.meetingPoint || "",
          bookingSource: "twin",
          phoneNumber: request.phone || "",
          email: request.email,
          notes: request.notes || "",
          flightType: request.flightType,
          assignedPilots: [],
          bookingStatus: "pending",
          span: request.numberOfPeople,
        });

        // Mark request as approved
        await updateDoc(doc(db, "bookingRequests", requestId), {
          status: "approved",
        });
      } catch (error) {
        console.error('Error creating booking from request:', error);
        alert('Failed to create booking. Please try again.');
      }
    }
    // Handle deleted booking being dropped (restore it)
    else if (typeof active.id === 'string' && active.id.startsWith('deleted-booking-')) {
      const bookingId = active.id.replace('deleted-booking-', '');
      const booking = deletedBookings.find(b => b.id === bookingId);

      if (!booking || !onUpdateBooking) return;

      // Only admins can restore deleted bookings
      if (role !== 'admin') {
        alert('Only administrators can restore deleted bookings');
        return;
      }

      // Show confirmation dialog
      const targetTimeSlot = timeSlots[targetTimeIndex];
      const confirmMessage = `Are you sure you want to restore this booking for ${booking.customerName} (${booking.numberOfPeople} pax) at ${targetTimeSlot}?`;
      if (!confirm(confirmMessage)) {
        return;
      }

      // Restore the booking: update status to pending, move to new time/date, and clear pilots
      try {
        await onUpdateBooking(booking.id!, {
          bookingStatus: "pending",
          timeIndex: targetTimeIndex,
          date: targetDate,
          assignedPilots: [], // Clear all pilot assignments
        });
      } catch (error) {
        console.error('Error restoring deleted booking:', error);
        alert('Failed to restore booking. Please try again.');
      }
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
      <div className="flex-1 overflow-auto p-4 bg-gray-50 dark:bg-zinc-950">
        <div className="inline-block">
          <div className="grid gap-2" style={{ gridTemplateColumns: `80px repeat(5, 220px) 48px 98px 98px` }}>
            {/* Header Row Skeleton */}
            <div className="h-7" />
            <div className="h-7 bg-gray-200 dark:bg-zinc-900 rounded-lg animate-pulse" />
            <div className="h-7 bg-gray-200 dark:bg-zinc-900 rounded-lg animate-pulse" />
            <div className="h-7 bg-gray-200 dark:bg-zinc-900 rounded-lg animate-pulse" />
            <div className="h-7 bg-gray-200 dark:bg-zinc-900 rounded-lg animate-pulse" />
            <div className="h-7 bg-gray-200 dark:bg-zinc-900 rounded-lg animate-pulse" />
            {/* Spacer between bookings and drivers */}
            <div className="h-7 w-full" />
            {/* Driver headers */}
            <div className="h-7 bg-yellow-400/80 rounded-lg animate-pulse" />
            <div className="h-7 bg-yellow-400/80 rounded-lg animate-pulse" />

            {/* Time Slot Rows Skeleton */}
            {timeSlots.map((_timeSlot, index) => (
              <div key={index} className="contents">
                {/* Time label skeleton */}
                <div className="h-14 bg-gray-200 dark:bg-zinc-900 rounded-lg animate-pulse" />
                {/* Skeleton cells */}
                <div className="h-14 bg-gray-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                <div className="h-14 bg-gray-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                <div className="h-14 bg-gray-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                <div className="h-14 bg-gray-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                <div className="h-14 bg-gray-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                {/* Spacer */}
                <div className="h-14 w-full" />
                {/* Driver cells */}
                <div className="h-14 bg-gray-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                <div className="h-14 bg-gray-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Grid will always render, even with 0 pilots (shows at least 1 column for overbooking)

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 bg-gray-50 dark:bg-zinc-950"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
      <div
        ref={gridRef}
        className={`inline-block origin-top-left ${!isPinching ? 'transition-transform duration-100' : ''}`}
        style={{ transform: `scale(${scale})` }}
      >
        <div className="grid gap-2" style={{ gridTemplateColumns: `80px repeat(${maxColumnsNeeded}, 220px) 48px 98px${showSecondDriverColumn ? ' 98px' : ''}` }}>
          {/* Header Row - Shows pilots present today */}
          {role !== 'agency' ? (
            <div data-sticky-column="true" className={`h-7 ${scale === 1 ? 'sticky left-0' : ''} z-10 relative`}>
              <div className="absolute top-0 bottom-0 bg-gray-50 dark:bg-zinc-950" style={{ left: '-16px', right: '-8px' }} />
              <div
                data-date-cell="true"
                className="h-full w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer transition-colors relative"
                onClick={() => setIsSearchModalOpen(true)}
                title="Search bookings"
              >
                <span className="text-white text-xs font-medium">{format(selectedDate, 'EEE d MMM')}</span>
              </div>
            </div>
          ) : (
            <div data-sticky-column="true" className={`h-7 ${scale === 1 ? 'sticky left-0' : ''} z-10 relative`}>
              <div className="absolute top-0 bottom-0 bg-gray-50 dark:bg-zinc-950" style={{ left: '-16px', right: '-8px' }} />
              <div data-date-cell="true" className="h-full w-full bg-zinc-900 rounded-lg relative" />
            </div>
          )}
          {Array.from({ length: maxColumnsNeeded }, (_, index) => {
            const pilot = pilots[index];
            if (pilot) {
              return (
                <DraggablePilotHeader
                  key={pilot.uid}
                  pilot={pilot}
                  index={index}
                  isAdmin={role === 'admin'}
                  isDragging={draggedPilotIndex === index}
                />
              );
            } else {
              // Extra column header (for overbookings or when no pilots available)
              return (
                <div
                  key={`extra-${index}`}
                  className="h-7 flex items-center justify-center bg-orange-600/80 rounded-lg font-medium text-sm text-white gap-2"
                >
                  <span>{index + 1}</span>
                  {pilots.length === 0 && <span>No Pilots</span>}
                </div>
              );
            }
          })}
          {/* Spacer between bookings and drivers */}
          <div className="h-7 w-full" />
          {/* Driver Header */}
          <div className="h-7 flex items-center justify-center bg-yellow-400/80 rounded-lg font-medium text-sm text-gray-900 dark:text-zinc-900">
            Driver
          </div>
          {/* Second Driver Header */}
          {showSecondDriverColumn && (
            <div className="h-7 flex items-center justify-center bg-yellow-400/80 rounded-lg font-medium text-sm text-gray-900 dark:text-zinc-900">
              Driver 2
            </div>
          )}

          {/* Time Slots and Booking Cells */}
          {combinedTimeSlots.map((slotInfo, displayIndex) => {
            const { time: timeSlot, displayTime, originalIndex: timeIndex, isAdditional } = slotInfo;

            // Get all bookings for this time slot and sort by creation time (oldest first, newest last/right)
            const bookingsAtThisTime = bookings
              .filter(b => b.timeIndex === timeIndex)
              .sort((a, b) => {
                // Sort by createdAt timestamp (oldest to newest)
                const aTime = a.createdAt?.toMillis?.() || a.createdAt?.getTime?.() || 0;
                const bTime = b.createdAt?.toMillis?.() || b.createdAt?.getTime?.() || 0;
                return aTime - bTime;
              });

            // Calculate how many pilot slots are occupied by bookings
            const slotsOccupiedByBookings = bookingsAtThisTime.reduce((total, booking) => {
              return total + (booking.numberOfPeople || booking.span || 1);
            }, 0);

            // Calculate total available pilots at this time
            const totalAvailablePilotsAtThisTime = pilots.filter((pilot) =>
              isPilotAvailableForTimeSlot(pilot.uid, timeSlot)
            ).length;

            // Determine which booking positions are overbooked
            // Positions beyond available pilot count are overbooked
            const overbookedPositionStart = totalAvailablePilotsAtThisTime;

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

            // Calculate actual booking capacity remaining (not just grid space)
            const totalAvailablePilots = availablePilots.length;
            const actualCapacityRemaining = Math.max(0, totalAvailablePilots - slotsOccupiedByBookings);

            // Calculate how many available pilot cells we can show
            const totalCellsNeeded = maxColumnsNeeded; // Total capacity (including overflow for overbookings)
            const cellsUsed = slotsOccupiedByBookings + unavailablePilots.length;
            const gridSpaceAvailable = totalCellsNeeded - cellsUsed;

            // Only show available cells if there's actual booking capacity remaining
            // For admins with no pilots, show at least 1 cell so they can create bookings
            let availableCellsToShow = Math.min(gridSpaceAvailable, actualCapacityRemaining, availablePilots.length);
            if (pilots.length === 0 && role === 'admin' && slotsOccupiedByBookings === 0) {
              availableCellsToShow = Math.max(1, availableCellsToShow);
            }

            // Add available pilot cells
            for (let i = 0; i < availableCellsToShow; i++) {
              // When there are no pilots but we're showing a cell for admins
              if (i >= availablePilots.length) {
                cellsForRow.push({
                  status: "available",
                  sortOrder: 1
                });
              } else {
                const {pilot, pilotIndex} = availablePilots[i];
                cellsForRow.push({
                  pilot,
                  pilotIndex,
                  status: "available",
                  sortOrder: 1
                });
              }
            }

            // Add invisible cells to fill remaining columns (for rows without overbooking)
            // Calculate actual grid columns occupied (bookings can span multiple columns)
            const columnsOccupied = cellsForRow.reduce((total, cell) => {
              if (cell.status === "booked" && cell.booking) {
                return total + (cell.booking.numberOfPeople || cell.booking.span || 1);
              }
              return total + 1; // Other cells occupy 1 column each
            }, 0);

            const cellsToFill = totalCellsNeeded - columnsOccupied;
            for (let i = 0; i < cellsToFill; i++) {
              cellsForRow.push({
                status: "available" as const,
                sortOrder: 3  // Put invisible cells at the end
              });
            }

            // Sort cells: booked first, then available, then noPilot, then invisible
            cellsForRow.sort((a, b) => a.sortOrder - b.sortOrder);

            // Calculate total pax for this time slot
            const totalPaxAtThisTime = bookingsAtThisTime.reduce((total, booking) => {
              return total + (booking.numberOfPeople || 1);
            }, 0);

            // Determine styling: additional slots are green, overridden times are orange
            const hasTimeOverride = !isAdditional && timeOverrides[timeIndex] !== undefined;
            const slotDisplayTime = displayTime;

            return [
              // Time Slot Label
              <div
                key={`time-${timeIndex}-${displayIndex}`}
                data-sticky-column="true"
                className={`h-14 ${scale === 1 ? 'sticky left-0' : ''} z-10 relative`}
              >
                <div className="absolute top-0 bottom-0 bg-gray-50 dark:bg-zinc-950" style={{ left: '-16px', right: '-8px' }} />
                <div
                  data-time-index={timeIndex}
                  className={`h-full w-full flex items-center justify-center rounded-lg font-medium text-sm relative ${
                    isAdditional
                      ? 'bg-green-500 dark:bg-green-600 text-white'
                      : hasTimeOverride
                      ? 'bg-orange-400 dark:bg-orange-600 text-white'
                      : 'bg-gray-200 dark:bg-zinc-900 text-gray-900 dark:text-white'
                  } ${role === 'admin' ? 'cursor-context-menu' : ''} ${moveMode.isActive || requestMoveMode.isActive || deletedBookingMoveMode.isActive ? 'cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/50' : ''}`}
                  onContextMenu={role === 'admin' ? handleTimeSlotContextMenu(timeIndex, timeSlot, isAdditional) : undefined}
                  onTouchStart={role === 'admin' ? handleTimeSlotTouchStart(timeIndex, timeSlot, isAdditional) : undefined}
                  onTouchEnd={role === 'admin' ? handleTimeSlotTouchEnd : undefined}
                  onTouchMove={role === 'admin' ? handleTimeSlotTouchMove : undefined}
                  onClick={moveMode.isActive || requestMoveMode.isActive || deletedBookingMoveMode.isActive ? () => handleMoveModeDestination(timeIndex) : undefined}
                >
                  {slotDisplayTime}
                  {totalPaxAtThisTime > 0 && (
                    <span className={`absolute top-1 right-1 text-xs font-medium rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ${
                      isAdditional
                        ? 'bg-green-700 dark:bg-green-800 text-green-100'
                        : hasTimeOverride
                        ? 'bg-orange-600 dark:bg-orange-800 text-orange-100'
                        : 'bg-gray-400 dark:bg-zinc-700 text-gray-700 dark:text-zinc-400'
                    }`}>
                      {totalPaxAtThisTime}
                    </span>
                  )}
                </div>
              </div>,

              // Render sorted cells
              // Track cumulative position for overbooking calculation
              ...(() => {
                let cumulativePosition = 0;
                return cellsForRow.map((cell, cellIdx) => {
                  // Invisible cell - render empty div to maintain grid structure
                  if (cell.sortOrder === 3) {
                    return (
                      <div
                        key={`invisible-${timeIndex}-${cellIdx}`}
                        className="h-14"
                        style={{ gridColumn: `span 1` }}
                      />
                    );
                  }

                  if (cell.status === "booked" && cell.booking) {
                    const span = cell.booking.numberOfPeople || cell.booking.span || 1;

                    // Calculate how many positions in THIS booking are overbooked
                    // based on cumulative position across all bookings
                    const startPosition = cumulativePosition;
                    const endPosition = cumulativePosition + span;

                    // Count how many positions in this booking exceed available capacity
                    let overbookedCount = 0;
                    for (let pos = startPosition; pos < endPosition; pos++) {
                      if (pos >= overbookedPositionStart) {
                        overbookedCount++;
                      }
                    }

                    // Update cumulative position for next booking
                    cumulativePosition += span;

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
                        onBookedClick={canViewBooking(cell.booking) ? () => handleBookedCellClick(cell.booking) : undefined}
                        onContextMenu={canViewBooking(cell.booking) && (canManagePilots() || role === "pilot") ? handleBookingContextMenu(cell.booking, timeSlot) : undefined}
                        onPilotNameClick={role === "pilot" ? handlePilotNameClick(cell.booking, timeSlot) : undefined}
                        currentUserDisplayName={currentUserDisplayName}
                        bookingId={cell.booking.id}
                        canDrag={isDragEnabled}
                        overbookedCount={overbookedCount}
                        onOverbookedClick={role === 'admin' ? (slotIndex: number, position: { x: number; y: number }) => {
                          setOverbookedContextMenu({
                            isOpen: true,
                            position,
                            booking: cell.booking,
                            slotIndex,
                            timeSlot
                          });
                        } : undefined}
                        onEnterMoveMode={role === 'admin' ? enterMoveMode : undefined}
                        isInMoveMode={moveMode.isActive && moveMode.booking?.id === cell.booking.id}
                        isHighlighted={highlightedBookingId === cell.booking.id}
                        hideDetails={!canViewBooking(cell.booking)}
                      />
                    </div>
                  );
                } else if (cell.pilot || cell.status === "available") {
                  // Available or noPilot cell (with or without pilot)
                  const isCurrentUserPilot = cell.pilot ? currentUserDisplayName === cell.pilot.displayName : false;
                  const currentUserPilot = pilots.find(p => p.displayName === currentUserDisplayName);
                  const currentUserPilotIndex = currentUserPilot ? pilots.findIndex(p => p.uid === currentUserPilot.uid) : -1;
                  const isCurrentUserAvailableAtThisTime = currentUserPilot && isPilotAvailableForTimeSlot(currentUserPilot.uid, timeSlot);

                  // Left-click on available cell - check if in move mode first
                  const handleAvailableLeftClick = () => {
                    // If in move mode, handle destination click
                    if (moveMode.isActive || requestMoveMode.isActive || deletedBookingMoveMode.isActive) {
                      handleMoveModeDestination(timeIndex);
                      return;
                    }
                    // Otherwise, open new booking modal
                    handleAvailableCellClick(cell.pilotIndex ?? 0, timeIndex, timeSlot);
                  };

                  // Determine what happens on left-click of "no pilot" cell
                  // Only handle clicks when in move mode
                  const handleNoPilotLeftClick = (role === "admin" && (moveMode.isActive || requestMoveMode.isActive || deletedBookingMoveMode.isActive)) ? async () => {
                    handleMoveModeDestination(timeIndex);
                  } : undefined;

                  return (
                    <div
                      key={`pilot-${timeIndex}-${cell.pilot?.uid || cellIdx}`}
                      className="h-14"
                      style={{ gridColumn: `span 1` }}
                    >
                      <BookingAvailable
                        pilotId={cell.pilot?.displayName || ""}
                        timeSlot={timeSlot}
                        status={cell.status}
                        span={1}
                        isCurrentUserPilot={isCurrentUserPilot}
                        isFemalePilot={cell.pilot?.femalePilot}
                        onAvailableClick={
                          cell.status === "available"
                            ? handleAvailableLeftClick
                            : undefined
                        }
                        onNoPilotClick={
                          cell.status === "noPilot"
                            ? handleNoPilotLeftClick
                            : undefined
                        }
                        onNoPilotContextMenu={
                          cell.status === "noPilot" && (isCurrentUserPilot || role === "admin")
                            ? handleNoPilotContextMenu(role === "admin" ? cell.pilotIndex! : currentUserPilotIndex, timeIndex)
                            : undefined
                        }
                        onAvailableContextMenu={
                          cell.status === "available" && isCurrentUserAvailableAtThisTime
                            ? handleNoPilotContextMenu(currentUserPilotIndex, timeIndex)
                            : undefined
                        }
                        droppableId={cell.status === "available" ? `droppable-${timeIndex}-${cell.pilotIndex ?? 0}` : undefined}
                        draggedItemPax={draggedBooking ? (draggedBooking.numberOfPeople || draggedBooking.span || 1) : draggedRequest ? draggedRequest.numberOfPeople : draggedDeletedBooking ? (draggedDeletedBooking.numberOfPeople || draggedDeletedBooking.span || 1) : undefined}
                        hasEnoughSpace={
                          (draggedBooking || draggedRequest || draggedDeletedBooking) && cell.status === "available"
                            ? hasEnoughSpaceAtTime(timeIndex, cell.pilotIndex ?? 0, draggedBooking ? (draggedBooking.numberOfPeople || draggedBooking.span || 1) : draggedRequest ? draggedRequest.numberOfPeople : draggedDeletedBooking!.numberOfPeople)
                            : true
                        }
                        isMoveModeActive={moveMode.isActive || requestMoveMode.isActive || deletedBookingMoveMode.isActive}
                      />
                    </div>
                  );
                }
                return null;
              });
              })(),

              // Spacer between bookings and drivers
              <div
                key={`spacer-${timeIndex}`}
                className="h-14 w-full"
              />,

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
                      onClick={canManageDrivers() ? () => handleDriverVehicleCellClick(null, 1, timeIndex) : undefined}
                      onContextMenu={canManageDrivers() ? handleDriverVehicleContextMenu(null, 1, timeIndex) : undefined}
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
                        onClick={canManageDrivers() ? () => handleDriverVehicleCellClick(null, 2, timeIndex) : undefined}
                        onContextMenu={canManageDrivers() ? handleDriverVehicleContextMenu(null, 2, timeIndex) : undefined}
                      />
                    );
                  })()}
                </div>
              ] : [])
            ];
          })}
        </div>
      </div>

      {/* Booking Requests Inbox and Driver Location Map - Only show to admins */}
      {role === 'admin' && (
      <div
        className="flex flex-col gap-4 max-w-4xl"
        style={{
          marginTop: `${24 + (gridHeight * (scale - 1))}px`
        }}
      >
        {/* Booking Requests Inbox */}
        <div className="w-full bg-white dark:bg-zinc-900 rounded-lg border border-gray-300 dark:border-zinc-800">
          <Tabs defaultValue="requests" className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-3 bg-gray-100 dark:bg-zinc-800 border-b border-gray-300 dark:border-zinc-700 rounded-t-lg">
              <TabsTrigger value="requests" className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900">
                Requests ({pendingRequests.length})
              </TabsTrigger>
              <TabsTrigger value="waitlist" className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900">
                Waiting List ({waitlistRequests.length})
              </TabsTrigger>
              <TabsTrigger value="deleted" className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900">
                Deleted ({deletedBookings.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="requests" className="p-4 mt-0">
              {pendingRequests.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-gray-500 dark:text-zinc-500">No booking requests</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingRequests.map((request) => (
                    <BookingRequestItem
                      key={request.id}
                      request={request}
                      canDrag={isDragEnabled}
                      availableSpots={getAvailableSpotsForRequest(request)}
                      onContextMenu={(req, position) => {
                        setBookingRequestContextMenu({
                          isOpen: true,
                          position,
                          request: req,
                        });
                      }}
                      onDateClick={(dateString) => {
                        if (onNavigateToDate) {
                          const [year, month, day] = dateString.split('-').map(Number);
                          const date = new Date(year, month - 1, day);
                          onNavigateToDate(date);
                        }
                      }}
                      onEnterMoveMode={role === 'admin' ? enterRequestMoveMode : undefined}
                      isInMoveMode={requestMoveMode.isActive && requestMoveMode.request?.id === request.id}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="waitlist" className="p-4 mt-0">
              {waitlistRequests.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-gray-500 dark:text-zinc-500">No items in waiting list</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {waitlistRequests.map((request) => (
                    <BookingRequestItem
                      key={request.id}
                      request={request}
                      canDrag={isDragEnabled}
                      availableSpots={getAvailableSpotsForRequest(request)}
                      onContextMenu={(req, position) => {
                        setBookingRequestContextMenu({
                          isOpen: true,
                          position,
                          request: req,
                        });
                      }}
                      onDateClick={(dateString) => {
                        if (onNavigateToDate) {
                          const [year, month, day] = dateString.split('-').map(Number);
                          const date = new Date(year, month - 1, day);
                          onNavigateToDate(date);
                        }
                      }}
                      onEnterMoveMode={role === 'admin' ? enterRequestMoveMode : undefined}
                      isInMoveMode={requestMoveMode.isActive && requestMoveMode.request?.id === request.id}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="deleted" className="p-4 mt-0">
              {deletedBookings.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-gray-500 dark:text-zinc-500">No deleted bookings</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {deletedBookings.map((booking) => (
                    <DeletedBookingItem
                      key={booking.id}
                      booking={booking}
                      timeSlots={timeSlots}
                      onContextMenu={(booking, position) => {
                        setDeletedBookingContextMenu({
                          isOpen: true,
                          position,
                          booking,
                        });
                      }}
                      onClick={(booking) => {
                        setSelectedBooking(booking);
                        setIsDetailsModalOpen(true);
                      }}
                      canDrag={role === 'admin'}
                      onEnterMoveMode={role === 'admin' ? enterDeletedBookingMoveMode : undefined}
                      isInMoveMode={deletedBookingMoveMode.isActive && deletedBookingMoveMode.booking?.id === booking.id}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Collapsible Driver Location Map */}
        <CollapsibleDriverMap />
      </div>
      )}

      {/* Driver's Own Location Map - Only show to drivers */}
      {role === 'driver' && (
      <div
        className="flex flex-col gap-4 max-w-4xl"
        style={{
          marginTop: `${24 + (gridHeight * (scale - 1))}px`
        }}
      >
        {/* Location Control */}
        <div className="flex items-center justify-between bg-white dark:bg-zinc-900 rounded-lg border border-gray-300 dark:border-zinc-800 p-4">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Location Tracking</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Enable to share your location with admins</p>
          </div>
          <LocationToggle />
        </div>

        {/* Driver's Own Location Map - Collapsible */}
        <CollapsibleDriverOwnMap />
      </div>
      )}

      {selectedCell && (
        <NewBookingModal
          open={isModalOpen}
          onOpenChange={(open) => {
            setIsModalOpen(open);
            if (!open) {
              // Clear booking request and deleted booking data when modal closes
              setBookingRequestToBook(null);
              setDeletedBookingToRestore(null);
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
          initialData={deletedBookingToRestore ? {
            customerName: deletedBookingToRestore.customerName,
            numberOfPeople: deletedBookingToRestore.numberOfPeople,
            phoneNumber: deletedBookingToRestore.phoneNumber,
            email: deletedBookingToRestore.email,
            notes: deletedBookingToRestore.notes,
            flightType: deletedBookingToRestore.flightType,
          } : bookingRequestToBook ? {
            customerName: bookingRequestToBook.customerName,
            numberOfPeople: bookingRequestToBook.numberOfPeople,
            phoneNumber: bookingRequestToBook.phone,
            email: bookingRequestToBook.email,
            notes: bookingRequestToBook.notes,
            flightType: bookingRequestToBook.flightType,
            bookingSource: bookingRequestToBook.bookingSource || "Online",
            commission: bookingRequestToBook.commission,
            commissionStatus: bookingRequestToBook.commissionStatus,
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
        timeOverrides={timeOverrides}
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
          isPilotSelfUnassign={contextMenu.isPilotSelfUnassign}
        />
      )}

      {/* Overbooked Pilot Context Menu */}
      {overbookedContextMenu && (
        <OverbookedPilotContextMenu
          isOpen={overbookedContextMenu.isOpen}
          position={overbookedContextMenu.position}
          unavailablePilots={systemPilots.filter((pilot) => {
            // Only show pilots who are NOT signed in at this time slot
            if (isPilotAvailableForTimeSlot(pilot.uid, overbookedContextMenu.timeSlot)) {
              return false;
            }

            // Check if this specific position requires a female pilot
            if (overbookedContextMenu.booking.femalePilotsRequired && overbookedContextMenu.slotIndex < overbookedContextMenu.booking.femalePilotsRequired) {
              if (!pilot.femalePilot) {
                return false;
              }
            }

            // Exclude pilots already assigned to this booking (to prevent double-assignment within same booking)
            const alreadyAssignedToThisBooking = overbookedContextMenu.booking.assignedPilots
              .filter((p, index) => p && p !== "" && index !== overbookedContextMenu.slotIndex)
              .includes(pilot.displayName);

            if (alreadyAssignedToThisBooking) {
              return false;
            }

            return true;
          })}
          currentPilot={overbookedContextMenu.booking.assignedPilots[overbookedContextMenu.slotIndex]}
          onSelectPilot={handleSelectOverbookedPilot}
          onUnassign={handleUnassignOverbookedPilot}
          onClose={() => setOverbookedContextMenu(null)}
        />
      )}

      {/* Availability Context Menu */}
      {availabilityContextMenu && (
        <AvailabilityContextMenu
          isOpen={availabilityContextMenu.isOpen}
          position={availabilityContextMenu.position}
          isSignedOut={availabilityContextMenu.isSignedOut}
          canSignOut={true}
          pilotName={pilots[availabilityContextMenu.pilotIndex]?.displayName}
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
        <ScheduleBookingRequestContextMenu
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
                pickupLocation: request.meetingPoint || "",
                bookingSource: request.bookingSource || "Online",
                phoneNumber: request.phone || "",
                email: request.email,
                notes: request.notes || "",
                flightType: request.flightType,
                assignedPilots: [],
                bookingStatus: "pending",
                span: request.numberOfPeople,
              });

              // Mark request as approved
              await updateDoc(doc(db, "bookingRequests", request.id), {
                status: "approved",
              });

              // Navigate to the booking's date if it's different from the current date
              const currentDateString = format(selectedDate, "yyyy-MM-dd");
              if (request.date !== currentDateString && onNavigateToDate) {
                const [year, month, day] = request.date.split('-').map(Number);
                const targetDate = new Date(year, month - 1, day);
                onNavigateToDate(targetDate);
              }
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
          onAddToWaitingList={bookingRequestContextMenu.request.status === "pending" ? async () => {
            const request = bookingRequestContextMenu.request;
            if (request.id) {
              await updateBookingRequest(request.id, {
                status: "waitlist",
              });
            }
            setBookingRequestContextMenu(null);
          } : undefined}
          onRemoveFromWaitingList={bookingRequestContextMenu.request.status === "waitlist" ? async () => {
            const request = bookingRequestContextMenu.request;
            if (request.id) {
              await updateBookingRequest(request.id, {
                status: "pending",
              });
            }
            setBookingRequestContextMenu(null);
          } : undefined}
          onDelete={async () => {
            const request = bookingRequestContextMenu.request;
            if (!request.id) return;

            if (confirm(`Delete booking request from ${request.customerName}?`)) {
              try {
                await deleteBookingRequest(request.id);
                setBookingRequestContextMenu(null);
              } catch (error) {
                console.error("Error deleting booking request:", error);
                alert("Failed to delete booking request. Please try again.");
              }
            }
          }}
          onClose={() => setBookingRequestContextMenu(null)}
        />
      )}

      {/* Time Slot Context Menu */}
      {timeSlotContextMenu && (
        <TimeSlotContextMenu
          isOpen={timeSlotContextMenu.isOpen}
          position={timeSlotContextMenu.position}
          isAdditionalSlot={timeSlotContextMenu.isAdditional}
          onAddPilot={() => {
            setAddPilotModal({
              isOpen: true,
              timeIndex: timeSlotContextMenu.timeIndex,
              timeSlot: timeSlotContextMenu.timeSlot,
            });
            setTimeSlotContextMenu(null);
          }}
          onChangeTime={() => {
            setChangeTimeModal({
              isOpen: true,
              timeIndex: timeSlotContextMenu.timeIndex,
              timeSlot: timeSlotContextMenu.timeSlot,
            });
            setTimeSlotContextMenu(null);
          }}
          onAddTime={() => {
            setAddTimeModal({ isOpen: true });
            setTimeSlotContextMenu(null);
          }}
          onRemoveTime={() => {
            handleRemoveTimeSlot(timeSlotContextMenu.timeSlot);
            setTimeSlotContextMenu(null);
          }}
          onClose={() => setTimeSlotContextMenu(null)}
        />
      )}

      {/* Deleted Booking Context Menu */}
      {deletedBookingContextMenu && (
        <DeletedBookingContextMenu
          isOpen={deletedBookingContextMenu.isOpen}
          position={deletedBookingContextMenu.position}
          onRestoreToSlot={async () => {
            const booking = deletedBookingContextMenu.booking;
            if (!onUpdateBooking || !booking.id) return;

            try {
              // Restore the booking to its original slot with "pending" status
              await onUpdateBooking(booking.id, {
                bookingStatus: "pending"
              });
              setDeletedBookingContextMenu(null);
            } catch (error) {
              console.error("Error restoring booking:", error);
              alert("Failed to restore booking. Please try again.");
            }
          }}
          onRestoreToAnotherTime={() => {
            const booking = deletedBookingContextMenu.booking;
            setDeletedBookingToRestore(booking);
            // Open the new booking modal with default time slot (user can change it)
            setSelectedCell({ pilotIndex: 0, timeIndex: 0, timeSlot: timeSlots[0] });
            setIsModalOpen(true);
            setDeletedBookingContextMenu(null);
          }}
          onClose={() => setDeletedBookingContextMenu(null)}
        />
      )}

      {/* Add Pilot Modal */}
      {addPilotModal && (
        <AddPilotModal
          open={addPilotModal.isOpen}
          onOpenChange={(open) => {
            if (!open) {
              setAddPilotModal(null);
            }
          }}
          pilots={allPilots}
          timeSlot={addPilotModal.timeSlot}
          onAddPilot={handleAddPilot}
        />
      )}

      {/* Change Time Modal */}
      {changeTimeModal && (
        <ChangeTimeModal
          open={changeTimeModal.isOpen}
          onOpenChange={(open) => {
            if (!open) {
              setChangeTimeModal(null);
            }
          }}
          originalTime={changeTimeModal.timeSlot}
          currentOverride={timeOverrides[changeTimeModal.timeIndex]}
          onChangeTime={handleChangeTime}
        />
      )}

      {/* Add Time Modal */}
      {addTimeModal && (
        <AddTimeModal
          open={addTimeModal.isOpen}
          onOpenChange={(open) => {
            if (!open) {
              setAddTimeModal(null);
            }
          }}
          existingTimes={[...timeSlots, ...additionalSlots]}
          onAddTime={handleAddTimeSlot}
        />
      )}

      {/* Search Booking Modal */}
      <SearchBookingModal
        open={isSearchModalOpen}
        onOpenChange={setIsSearchModalOpen}
        bookings={allBookingsForSearch}
        timeSlots={timeSlots}
        onBookingClick={handleSearchBookingClick}
      />

      {/* Dim overlay when in move mode */}
      {(moveMode.isActive || requestMoveMode.isActive || deletedBookingMoveMode.isActive) && (
        <div
          className="fixed inset-0 bg-black/20 z-40 pointer-events-none"
          onClick={(e) => {
            e.stopPropagation();
            if (moveMode.isActive) exitMoveMode();
            if (requestMoveMode.isActive) exitRequestMoveMode();
            if (deletedBookingMoveMode.isActive) exitDeletedBookingMoveMode();
          }}
        />
      )}
    </div>
    </DndContext>
  );
}

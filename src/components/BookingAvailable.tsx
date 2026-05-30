import { useRef, memo, useState } from "react";
import { Info } from "lucide-react";
import type { Booking, BookingHistoryEntry, PilotPayment, AvailabilityStatus } from "../types/index";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { formatSwissDateTime } from "../utils/timezone";

interface HistoryTooltipData {
  user: string;
  action?: string;
  timestamp?: string;
  timestampValue?: string;
  text?: string;
  accentText?: string;
}

interface PilotSlotProps {
  bookingId: string;
  slotIndex: number;
  pilot?: string;
  canDrag: boolean;
  isValidDropTarget: boolean;
  isAcknowledged: boolean;
  requiresFemalePilot: boolean;
  isOverbookedPosition: boolean;
  numAmount?: number;
  canClickToUnassign: boolean;
  canLongPress: boolean;
  isSecondDriverSelected: boolean;
  canSelectSecondDriverPilot: boolean;
  assignedHistory?: HistoryTooltipData;
  assignedHistoryEntries?: HistoryTooltipData[];
  paymentHistory?: HistoryTooltipData;
  paymentHistoryEntries?: HistoryTooltipData[];
  onPilotNameClick?: (slotIndex: number, pilotName: string, position: { x: number; y: number }) => void;
  onPilotNameLongPress?: (pilotName: string, position: { x: number; y: number }) => void;
  onSecondDriverPilotToggle?: (pilotName: string) => void;
}

function PilotSlot({
  bookingId,
  slotIndex,
  pilot,
  canDrag,
  isValidDropTarget,
  isAcknowledged,
  requiresFemalePilot,
  isOverbookedPosition,
  numAmount,
  canClickToUnassign,
  canLongPress,
  isSecondDriverSelected,
  canSelectSecondDriverPilot,
  assignedHistory,
  assignedHistoryEntries = [],
  paymentHistory,
  paymentHistoryEntries = [],
  onPilotNameClick,
  onPilotNameLongPress,
  onSecondDriverPilotToggle,
}: PilotSlotProps) {
  const longPressTimerRef = useRef<number | null>(null);
  const hasPilot = !!(pilot && pilot.trim());

  const isDraggable = canDrag && (hasPilot || isOverbookedPosition);

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `pilot-drag-${bookingId}-${slotIndex}`,
    disabled: !isDraggable,
    data: { isOverbooked: isOverbookedPosition, hasPilot },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `pilot-drop-${bookingId}-${slotIndex}`,
    // Always registered — pilotAwareCollisionDetection in ScheduleGrid filters these
    // out during non-pilot drags so they never interfere with booking drops.
  });

  const setRef = (el: HTMLDivElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };

  const dragStyle: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 50 : undefined }
    : {};

  const dragListeners = isDraggable && !canSelectSecondDriverPilot
    ? {
        ...attributes,
        ...listeners,
        onPointerDown: (e: React.PointerEvent) => {
          e.stopPropagation(); // prevent booking drag from firing
          listeners?.onPointerDown?.(e);
        },
      }
    : {};

  const handlePilotTouchStart = (e: React.TouchEvent) => {
    if (!canLongPress) return;
    e.stopPropagation();
    const touch = e.touches[0];
    longPressTimerRef.current = window.setTimeout(() => {
      onPilotNameLongPress?.(pilot!, { x: touch.clientX, y: touch.clientY });
    }, 500);
  };

  const handlePilotTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePilotContextMenu = (e: React.MouseEvent) => {
    if (!canLongPress || !hasPilot) return;
    e.preventDefault();
    e.stopPropagation();
    onPilotNameLongPress?.(pilot!, { x: e.clientX, y: e.clientY });
  };

  const dropHighlight = isOver && isValidDropTarget ? 'ring-2 ring-blue-400 rounded-t-lg' : '';

  // Empty overbooked slot — draggable so admin can move the overbooked slot itself
  if (!hasPilot && isOverbookedPosition) {
    return (
      <div
        className="flex justify-center"
        ref={setRef}
        style={{ ...dragStyle, cursor: canDrag ? 'grab' : undefined }}
        {...dragListeners}
      >
        <div className={`text-xs text-orange-200 bg-orange-600/90 rounded-t-lg px-2 py-0.5 w-[80%] text-center ${dropHighlight}`}>
          overbooked
        </div>
      </div>
    );
  }

  // Empty lady-pilot slot
  if (!hasPilot && requiresFemalePilot) {
    return (
      <div className="flex justify-center" ref={setRef}>
        <div className={`text-xs text-white bg-red-600/90 rounded-t-lg px-2 py-0.5 w-[80%] text-center ${dropHighlight}`}>
          lady pilot
        </div>
      </div>
    );
  }

  // Truly empty slot
  if (!hasPilot) {
    return (
      <div
        className={`flex justify-center min-h-[20px] ${isOver ? 'bg-blue-500/20 rounded-t-lg' : ''}`}
        ref={setRef}
      />
    );
  }

  const bgColorClass = isAcknowledged
    ? "bg-green-600/90"
    : isOverbookedPosition
    ? "bg-orange-600/90"
    : requiresFemalePilot
    ? "bg-red-600/90"
    : "bg-gray-700/90 dark:bg-zinc-800/90";

  return (
    <div
      className="flex justify-center"
      ref={setRef}
      style={{ ...dragStyle, cursor: canDrag ? 'grab' : undefined }}
      {...dragListeners}
    >
      <div
        data-history-hover-target="pilot-assignment"
        data-history-user={assignedHistory?.user}
        data-history-action={assignedHistory?.action}
        data-history-timestamp={assignedHistory?.timestamp}
        data-history-timestamp-value={assignedHistory?.timestampValue}
        data-history-entries={JSON.stringify(assignedHistoryEntries)}
        className={`text-xs text-white ${bgColorClass} rounded-t-lg px-2 py-0.5 w-[80%] relative ${
          isSecondDriverSelected ? 'pl-3' : ''
        } ${
          canSelectSecondDriverPilot ? 'cursor-pointer hover:opacity-80' : canClickToUnassign ? 'cursor-pointer hover:opacity-80' : ''
        } ${dropHighlight}`}
        onClick={(e) => {
          if (canSelectSecondDriverPilot) {
            e.stopPropagation();
            onSecondDriverPilotToggle?.(pilot!);
          } else if (canClickToUnassign) {
            e.stopPropagation();
            onPilotNameClick?.(slotIndex, pilot!, { x: e.clientX, y: e.clientY });
          }
        }}
        onTouchStart={handlePilotTouchStart}
        onTouchEnd={handlePilotTouchEnd}
        onContextMenu={handlePilotContextMenu}
      >
        {isSecondDriverSelected && (
          <span className="absolute left-0 top-0 bottom-0 w-2 rounded-tl-lg bg-orange-400" />
        )}
        <div className="text-center truncate">{pilot}</div>
        {numAmount !== undefined && numAmount !== 0 && !isNaN(numAmount) && (
          <span
            data-history-hover-target="pilot-payment-amount"
            data-history-user={paymentHistory?.user}
            data-history-action={paymentHistory?.action}
            data-history-timestamp={paymentHistory?.timestamp}
            data-history-timestamp-value={paymentHistory?.timestampValue}
            data-history-entries={JSON.stringify(paymentHistoryEntries)}
            className="absolute right-2 top-0.5 font-medium text-white"
          >
            {numAmount}
          </span>
        )}
      </div>
    </div>
  );
}

interface BookingAvailableProps {
  pilotId: string;
  timeSlot: string;
  status?: "available" | "booked" | "noPilot";
  pilotAvailabilityStatus?: AvailabilityStatus; // "available", "onRequest", or "unavailable"
  customerName?: string;
  pickupLocation?: string;
  bookingSource?: string;
  assignedPilots?: string[];
  acknowledgedPilots?: string[];
  pilotPayments?: PilotPayment[];
  bookingStatus?: "unconfirmed" | "confirmed" | "pending" | "cancelled";
  span?: number;
  femalePilotsRequired?: number;
  flightType?: "sensational" | "classic" | "early bird";
  notes?: string;
  bookingSourceColor?: string;
  onAvailableClick?: () => void;
  onBookedClick?: () => void;
  onContextMenu?: (slotIndex: number, position: { x: number; y: number }) => void;
  onNoPilotClick?: () => void; // Handler for left-clicking on "no pilot" cell (admin sign-in)
  onNoPilotContextMenu?: (position: { x: number; y: number }) => void;
  noPilotHistoryEntries?: HistoryTooltipData[];
  onAvailableContextMenu?: (position: { x: number; y: number }) => void;
  onPilotNameClick?: (slotIndex: number, pilotName: string, position: { x: number; y: number }) => void; // Handler for clicking on a pilot name
  onPilotNameLongPress?: (pilotName: string, position: { x: number; y: number }) => void; // Handler for long-press on pilot name
  onSecondDriverPilotToggle?: (pilotName: string) => void;
  onOverbookedClick?: (slotIndex: number, position: { x: number; y: number }) => void; // Handler for context menu on overbooked position
  isCurrentUserPilot?: boolean; // Whether this cell is for the current user
  isFemalePilot?: boolean; // Whether this pilot is a female pilot
  currentUserDisplayName?: string; // Current user's display name to check if they're clicking their own name
  // Drag and drop props
  bookingId?: string; // ID for drag source
  createdByName?: string;
  createdAt?: any;
  history?: BookingHistoryEntry[];
  droppableId?: string; // ID for drop target
  canDrag?: boolean; // Whether this booking can be dragged (admin only)
  draggedItemPax?: number; // Number of passengers in the currently dragged item
  hasEnoughSpace?: boolean; // Whether there's enough space at this location for the dragged item
  overbookedCount?: number; // Number of overbooked spots (if any)
  overbookedSlotIndexes?: number[]; // Exact slot indexes marked overbooked when manually arranged
  // Move mode props (admin only)
  onEnterMoveMode?: (booking: Booking) => void; // Callback to enter move mode
  isInMoveMode?: boolean; // Whether this specific booking is in move mode
  isMoveModeActive?: boolean; // Whether ANY booking/request is in move mode (affects available cell styling)
  // Highlight prop (for search results)
  isHighlighted?: boolean; // Whether this booking should be highlighted (from search)
  // Hide details prop (for agency users viewing others' bookings)
  hideDetails?: boolean; // Whether to hide booking details and show blank booking
  // On request booking restriction
  canBookOnRequest?: boolean; // Whether the user can book on "on request" slots (admins and pilots only)
  // Pilot drag-and-drop
  isValidPilotDropTarget?: boolean; // Whether pilot slots in this booking accept pilot drops
  secondDriverPilots?: string[];
  isSecondDriverPilotSelectionMode?: boolean;
}

export const BookingAvailable = memo(function BookingAvailable({
  pilotId,
  status = "available",
  pilotAvailabilityStatus,
  customerName,
  pickupLocation,
  bookingSource,
  assignedPilots = [],
  acknowledgedPilots = [],
  pilotPayments = [],
  bookingStatus = "confirmed",
  span = 1,
  femalePilotsRequired = 0,
  flightType,
  notes,
  bookingSourceColor = "#1e3a8a",
  onAvailableClick,
  onBookedClick,
  onContextMenu,
  onNoPilotClick,
  onNoPilotContextMenu,
  noPilotHistoryEntries = [],
  onAvailableContextMenu,
  onPilotNameClick,
  onPilotNameLongPress,
  onSecondDriverPilotToggle,
  onOverbookedClick,
  isCurrentUserPilot = false,
  isFemalePilot = false,
  currentUserDisplayName,
  bookingId,
  createdByName,
  createdAt,
  history = [],
  droppableId,
  canDrag = false,
  draggedItemPax,
  hasEnoughSpace = true,
  overbookedCount = 0,
  overbookedSlotIndexes,
  onEnterMoveMode,
  isInMoveMode = false,
  isMoveModeActive = false,
  isHighlighted = false,
  hideDetails = false,
  canBookOnRequest = false,
  isValidPilotDropTarget = false,
  secondDriverPilots = [],
  isSecondDriverPilotSelectionMode = false,
}: BookingAvailableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const moveModeTimerRef = useRef<number | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const infoIconRef = useRef<HTMLDivElement>(null);
  const [showNotesTooltip, setShowNotesTooltip] = useState(false);
  const [pressGlow, setPressGlow] = useState<'none' | 'light' | 'intense'>('none');
  const preventClickRef = useRef(false);

  // Set up draggable for booked cells (admin only)
  const draggableId = bookingId ? `booking-${bookingId}` : null;
  const { attributes, listeners, setNodeRef: setDragNodeRef, transform, isDragging } = useDraggable({
    id: draggableId || 'disabled',
    disabled: !canDrag || !bookingId || status !== 'booked',
  });

  // Set up droppable for available cells
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: droppableId || 'disabled-drop',
    disabled: !droppableId || status !== 'available' || !hasEnoughSpace,
  });

  // Determine drop zone width (how many columns to highlight)
  const dropZoneWidth = draggedItemPax || 1;

  console.log("BookingAvailable render:", { pilotId, status, isCurrentUserPilot, hasNoPilotHandler: !!onNoPilotContextMenu, hasAvailableHandler: !!onAvailableContextMenu });

  const getHistoryDate = (timestamp: any) => {
    if (!timestamp) return undefined;

    const date =
      typeof timestamp.toDate === "function"
        ? timestamp.toDate()
        : timestamp instanceof Date
        ? timestamp
        : new Date(timestamp);

    if (Number.isNaN(date.getTime())) return undefined;

    return date;
  };

  const formatHistoryTimestamp = (timestamp: any) => {
    const date = getHistoryDate(timestamp);
    if (!date) return undefined;

    return formatSwissDateTime(date) || undefined;
  };

  const formatHistoryTimestampValue = (timestamp: any) => {
    return getHistoryDate(timestamp)?.toISOString();
  };

  const getStatusFromDetails = (details?: string) => {
    const match = details?.match(/\b(?:to|status:)\s+([a-z ]+)/i);
    return match?.[1]?.trim();
  };

  const getChangedFieldLabel = (details?: string) => {
    if (!details) return undefined;

    const firstDetail = details.split(",")[0].trim().toLowerCase();
    if (firstDetail.startsWith("name:")) return "name";
    if (firstDetail.startsWith("location:")) return "pickup";
    if (firstDetail.startsWith("source:")) return "source";
    if (firstDetail.startsWith("phone:")) return "phone";
    if (firstDetail.startsWith("email:")) return "email";
    if (firstDetail.startsWith("notes ")) return "notes";
    if (firstDetail.includes("people")) return "number of people";
    if (firstDetail.startsWith("commission")) return "commission";
    if (firstDetail.includes("lady pilots")) return "lady pilots";
    if (firstDetail.startsWith("flight:")) return "flight";

    return undefined;
  };

  const getPilotListFromDetails = (details?: string) => {
    const match = details?.match(/pilots:\s*([^,]+)/i);
    return match?.[1]?.split(/\s+and\s+|,\s*/).map((name) => name.trim()).filter(Boolean) || [];
  };

  const getPresentPilotFromDetails = (details?: string) => {
    const match = details?.match(/present:\s*([^,]+)/i) || details?.match(/acknowledgedpilots:\s*([^,]+)/i);
    return match?.[1]?.split(/\s+and\s+|,\s*/)[0]?.trim();
  };

  const getHistoryText = (entry: BookingHistoryEntry, contextPilotName?: string): Pick<HistoryTooltipData, "text" | "accentText" | "action"> => {
    const user = entry.userName;
    const details = entry.details || "";

    if (entry.action === "status_changed") {
      const status = getStatusFromDetails(details);
      return {
        text: user,
        accentText: status ? `status ${status}` : "status changed",
        action: "status_changed",
      };
    }

    if (entry.action === "created") {
      return { text: user, accentText: "created", action: "created" };
    }

    if (entry.action === "moved") {
      return { text: user, accentText: "moved", action: "moved" };
    }

    if (entry.action === "restored") {
      return { text: user, accentText: "restored", action: "restored" };
    }

    const presentPilot = getPresentPilotFromDetails(details);
    if (presentPilot && (!contextPilotName || presentPilot.toLowerCase() === contextPilotName.toLowerCase())) {
      return {
        text: presentPilot,
        accentText: "present",
        action: "present",
      };
    }

    const assignedPilots = getPilotListFromDetails(details);
    if (assignedPilots.length > 0) {
      const pilotLabel = contextPilotName || assignedPilots[0];
      return {
        text: user,
        accentText: `assigned ${pilotLabel}`,
        action: "pilot_assigned",
      };
    }

    if (details.toLowerCase().includes("payment")) {
      return { text: user, accentText: `updated ${contextPilotName ? `${contextPilotName} ` : ""}payment`, action: "payment" };
    }

    if (entry.action === "edited") {
      const field = getChangedFieldLabel(details);
      if (field) {
        const verb = details.toLowerCase().includes("cleared") ? "removed" : "updated";
        return { text: user, accentText: `${verb} ${field}`, action: "edited" };
      }
      return { text: user, accentText: "edited", action: "edited" };
    }

    return { text: user, accentText: entry.action.replace(/_/g, " "), action: entry.action };
  };

  const toHistoryTooltip = (entry?: BookingHistoryEntry, fallbackUser?: string, fallbackAction?: string, fallbackTimestamp?: any, contextPilotName?: string): HistoryTooltipData | undefined => {
    const user = entry?.userName || fallbackUser;
    if (!user) return undefined;
    const textParts = entry ? getHistoryText(entry, contextPilotName) : {};

    return {
      user,
      action: textParts.action || entry?.action || fallbackAction,
      timestamp: formatHistoryTimestamp(entry?.timestamp || fallbackTimestamp),
      timestampValue: formatHistoryTimestampValue(entry?.timestamp || fallbackTimestamp),
      text: textParts.text,
      accentText: textParts.accentText,
    };
  };

  const toHistoryTooltipEntries = (entries: BookingHistoryEntry[], fallback?: HistoryTooltipData, contextPilotName?: string) => {
    const tooltipEntries = entries
      .map((entry) => toHistoryTooltip(entry, undefined, undefined, undefined, contextPilotName))
      .filter((entry): entry is HistoryTooltipData => Boolean(entry));

    if (tooltipEntries.length === 0 && fallback) {
      return [fallback];
    }

    return tooltipEntries;
  };

  const latestHistoryEntry = (predicate: (entry: BookingHistoryEntry) => boolean) => {
    return [...history].reverse().find(predicate);
  };

  const isBookingDetailsHistoryEntry = (entry: BookingHistoryEntry) => {
    if (entry.action === "deleted") return false;
    if (entry.action === "created" || entry.action === "moved" || entry.action === "status_changed" || entry.action === "restored") {
      return true;
    }
    if (entry.action !== "edited") return false;

    const details = entry.details?.toLowerCase() || "";
    if (!details.trim()) return false;

    return !["payment", "pilot", "driver", "vehicle"].some((blockedDetail) => details.includes(blockedDetail));
  };

  const latestBookingEntry = latestHistoryEntry(isBookingDetailsHistoryEntry);
  const latestBookingHistory = toHistoryTooltip(latestBookingEntry, createdByName || "Unknown", "created", createdAt);
  const bookingHistoryEntries = toHistoryTooltipEntries(
    history.filter(isBookingDetailsHistoryEntry),
    latestBookingHistory
  );

  const isPaymentHistoryForPilot = (entry: BookingHistoryEntry, pilotName?: string) => {
    const details = entry.details?.toLowerCase() || "";
    if (!details.includes("payment")) return false;
    if (!pilotName) return true;

    return details.includes(pilotName.toLowerCase());
  };

  const getPaymentHistoryEntries = (pilotName?: string) => {
    const paymentEntries = history.filter((entry) => isPaymentHistoryForPilot(entry, pilotName));
    return toHistoryTooltipEntries(paymentEntries, undefined, pilotName);
  };

  const getLatestPaymentHistory = (pilotName?: string) => {
    const latestPaymentEntry = latestHistoryEntry((entry) => isPaymentHistoryForPilot(entry, pilotName));
    return toHistoryTooltip(latestPaymentEntry, undefined, undefined, undefined, pilotName);
  };

  const getPilotAssignmentHistoryEntries = (pilotName?: string) => {
    if (!pilotName) return latestBookingHistory ? [latestBookingHistory] : [];

    const pilotEntries = history.filter((entry) => {
      const details = entry.details?.toLowerCase() || "";
      return details.includes("pilots") && details.includes(pilotName.toLowerCase());
    });
    const presentEntries = history.filter((entry) => {
      const details = entry.details?.toLowerCase() || "";
      return (
        (details.includes("present:") || details.includes("acknowledgedpilots:")) &&
        details.includes(pilotName.toLowerCase())
      );
    });
    const combinedPilotEntries = [...pilotEntries, ...presentEntries].sort((a, b) => {
      const getTime = (entry: BookingHistoryEntry) => {
        const timestamp = entry.timestamp;
        const date =
          typeof timestamp?.toDate === "function"
            ? timestamp.toDate()
            : timestamp instanceof Date
            ? timestamp
            : new Date(timestamp);
        return Number.isNaN(date.getTime()) ? 0 : date.getTime();
      };
      return getTime(a) - getTime(b);
    });

    if (combinedPilotEntries.length > 0) {
      return toHistoryTooltipEntries(combinedPilotEntries, undefined, pilotName);
    }

    const actionEntries = history.filter((entry) => entry.action === "pilot_assigned");
    if (actionEntries.length > 0) {
      return toHistoryTooltipEntries(actionEntries, undefined, pilotName);
    }

    return latestBookingHistory ? [latestBookingHistory] : [];
  };

  const getPilotAssignedByName = (pilotName?: string) => {
    if (!pilotName) return latestBookingHistory;

    const latestPilotEntry =
      [...history].reverse().find((entry) => {
        const details = entry.details?.toLowerCase() || "";
        return details.includes("pilots") && details.includes(pilotName.toLowerCase());
      }) ||
      latestHistoryEntry((entry) => entry.action === "pilot_assigned");

    return toHistoryTooltip(latestPilotEntry, latestBookingHistory?.user, "pilot_assigned", latestBookingEntry?.timestamp || createdAt);
  };

  // Detect which slot was clicked based on x position
  const getSlotIndexFromPosition = (clientX: number): number => {
    if (!containerRef.current || span === 1) return 0;

    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const slotWidth = rect.width / span;
    const slotIndex = Math.floor(relativeX / slotWidth);

    return Math.max(0, Math.min(span - 1, slotIndex));
  };

  const isOverbookedSlot = (slotIndex: number): boolean => {
    return overbookedSlotIndexes
      ? overbookedSlotIndexes.includes(slotIndex)
      : slotIndex >= (span - overbookedCount);
  };

  // Handle right-click (desktop)
  const handleContextMenu = (e: React.MouseEvent) => {
    if (status !== "booked") return;
    if (!onContextMenu && !onOverbookedClick) return;

    e.preventDefault();
    e.stopPropagation();

    const slotIndex = getSlotIndexFromPosition(e.clientX);

    // Check if this position is overbooked
    const isOverbookedPosition = isOverbookedSlot(slotIndex);

    // If overbooked and handler exists, use overbooked context menu
    if (isOverbookedPosition && onOverbookedClick) {
      onOverbookedClick(slotIndex, { x: e.clientX, y: e.clientY });
      return;
    }

    // Otherwise use regular context menu
    if (onContextMenu) {
      onContextMenu(slotIndex, { x: e.clientX, y: e.clientY });
    }
  };

  // Handle touch start (mobile long-press with two stages)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (status !== "booked") return;
    if (!onContextMenu && !onOverbookedClick && !onEnterMoveMode) return;

    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    // Stage 1: 500ms - context menu + light glow
    longPressTimerRef.current = window.setTimeout(() => {
      if (touchStartPosRef.current) {
        setPressGlow('light');

        const slotIndex = getSlotIndexFromPosition(touchStartPosRef.current.x);

        // Check if this position is overbooked
        const isOverbookedPosition = isOverbookedSlot(slotIndex);

        // If overbooked and handler exists, use overbooked context menu
        if (isOverbookedPosition && onOverbookedClick) {
          onOverbookedClick(slotIndex, touchStartPosRef.current);
        } else if (onContextMenu) {
          // Otherwise use regular context menu
          onContextMenu(slotIndex, touchStartPosRef.current);
        }
      }
    }, 500); // 500ms for context menu

    // Stage 2: 1000ms - move mode + intense glow (admin only)
    if (onEnterMoveMode && canDrag && bookingId) {
      moveModeTimerRef.current = window.setTimeout(() => {
        if (touchStartPosRef.current) {
          setPressGlow('intense');

          // Trigger haptic feedback if supported
          if (navigator.vibrate) {
            navigator.vibrate(50);
          }

          // Construct booking object to pass to move mode
          const booking = {
            id: bookingId,
            customerName,
            pickupLocation,
            bookingSource: bookingSource ?? "",
            assignedPilots,
            pilotPayments,
            bookingStatus,
            numberOfPeople: span,
            span,
            femalePilotsRequired,
            flightType,
            notes,
            // These will be provided by parent
            timeIndex: 0,
            date: '',
            pilotIndex: 0,
          };

          // Prevent click event from firing after this long press
          preventClickRef.current = true;

          onEnterMoveMode(booking);
        }
      }, 1000); // 1000ms for move mode
    }
  };

  // Handle touch move (cancel long-press if finger moves)
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current) return;

    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);

    // Cancel long-press if finger moved more than 10px
    if (deltaX > 10 || deltaY > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (moveModeTimerRef.current) {
        clearTimeout(moveModeTimerRef.current);
        moveModeTimerRef.current = null;
      }
      setPressGlow('none');
      touchStartPosRef.current = null;
    }
  };

  // Handle touch end (clear long-press timers and reset glow)
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
    touchStartPosRef.current = null;

    // Reset preventClick after a short delay to allow click event to be blocked
    setTimeout(() => {
      preventClickRef.current = false;
    }, 100);
  };

  // Handle click - prevent if it's right after entering move mode
  const handleClick = (e: React.MouseEvent) => {
    if (preventClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (isSecondDriverPilotSelectionMode && onSecondDriverPilotToggle) {
      e.preventDefault();
      e.stopPropagation();

      const slotIndex = getSlotIndexFromPosition(e.clientX);
      const pilot = assignedPilots[slotIndex];
      if (pilot?.trim()) {
        onSecondDriverPilotToggle(pilot);
      }
      return;
    }

    if (onBookedClick) {
      onBookedClick();
    }
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

    // Use generic gray color when hiding details for agency users
    const backgroundColor = hideDetails ? 'rgba(156, 163, 175, 0.4)' : hexToRgba(bookingSourceColor, 0.4);
    const borderColor = hideDetails ? 'rgba(156, 163, 175, 0.5)' : hexToRgba(bookingSourceColor, 0.5);
    const hoverColor = hideDetails ? 'rgba(156, 163, 175, 0.5)' : hexToRgba(bookingSourceColor, 0.5);

    // Apply drag transform
    const dragStyle = transform ? {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      opacity: isDragging ? 0.5 : 1,
    } : {};

    // Apply glow effect based on press state, move mode, or highlight
    let boxShadow = 'none';
    if (isHighlighted) {
      // Green pulsing glow for highlighted booking from search
      boxShadow = '0 0 0 4px rgba(34, 197, 94, 0.6), 0 0 25px rgba(34, 197, 94, 0.5)';
    } else if (isInMoveMode) {
      boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.5), 0 0 20px rgba(59, 130, 246, 0.4)'; // Blue glow for active move
    } else if (pressGlow === 'light') {
      boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.3)'; // Light blue glow at 500ms
    } else if (pressGlow === 'intense') {
      boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.6), 0 0 15px rgba(59, 130, 246, 0.5)'; // Intense blue glow at 1000ms
    }

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          if (canDrag && bookingId) {
            setDragNodeRef(node);
          }
        }}
        data-booking-id={bookingId}
        data-history-hover-target="booking"
        data-history-user={latestBookingHistory?.user}
        data-history-action={latestBookingHistory?.action}
        data-history-timestamp={latestBookingHistory?.timestamp}
        data-history-timestamp-value={latestBookingHistory?.timestampValue}
        data-history-entries={JSON.stringify(bookingHistoryEntries)}
        className={`w-full h-full rounded-lg pt-2 px-2 flex flex-col justify-between transition-all overflow-hidden relative ${onBookedClick || isSecondDriverPilotSelectionMode ? 'cursor-pointer' : 'cursor-default'} ${canDrag && bookingId ? 'cursor-grab active:cursor-grabbing' : ''} ${isHighlighted ? 'animate-pulse-slow' : ''}`}
        style={{
          backgroundColor,
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor,
          boxShadow,
          ...dragStyle,
        }}
        {...(canDrag && bookingId ? { ...attributes, ...listeners } : {})}
        onMouseEnter={(e) => {
          if (onBookedClick && !isDragging) {
            e.currentTarget.style.backgroundColor = hoverColor;
          }
        }}
        onMouseLeave={(e) => {
          if (!isDragging) {
            e.currentTarget.style.backgroundColor = backgroundColor;
          }
        }}
        onClick={isDragging ? undefined : handleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Status indicator bar */}
        <div className={`absolute top-0 right-0 w-[5px] h-full ${statusColors[bookingStatus]}`} />

        {/* Pax count circle */}
        {span > 0 && !hideDetails && (
          <span className="absolute bottom-1 left-1 text-xs font-medium rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 bg-gray-600 dark:bg-zinc-700 text-white dark:text-zinc-300">
            {span}
          </span>
        )}

        {/* Notes indicator icon */}
        {notes && notes.trim() && (
          <div
            ref={infoIconRef}
            className="absolute bottom-1 right-2 z-[9999]"
            onMouseEnter={() => setShowNotesTooltip(true)}
            onMouseLeave={() => setShowNotesTooltip(false)}
          >
            <Info className="w-4 h-4 text-zinc-900 cursor-help" />
          </div>
        )}

        {/* Notes tooltip - render outside with fixed positioning */}
        {notes && notes.trim() && showNotesTooltip && infoIconRef.current && (() => {
          const rect = infoIconRef.current.getBoundingClientRect();
          return (
            <div
              className="fixed w-64 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg shadow-xl p-3 text-sm text-gray-900 dark:text-white whitespace-pre-wrap break-words"
              style={{
                left: `${rect.right - 256}px`,
                bottom: `${window.innerHeight - rect.top + 2}px`,
                zIndex: 9999
              }}
              onMouseEnter={() => setShowNotesTooltip(true)}
              onMouseLeave={() => setShowNotesTooltip(false)}
            >
              <div className="text-xs text-gray-600 dark:text-zinc-400 mb-1">Notes:</div>
              {notes}
            </div>
          );
        })()}

        {hideDetails ? (
          // Show completely empty cell for agency users who didn't create this booking
          <div className="flex-1 min-h-0 overflow-hidden" />
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-hidden">
              <div className="flex items-center gap-2">
                {flightType === "classic" && (
                  <span className="text-xs font-semibold text-orange-400 bg-orange-500/20 px-2 py-0.5 rounded-full border border-orange-400/40">
                    classic
                  </span>
                )}
                <div className="font-semibold text-sm text-zinc-900 dark:text-white truncate">
                  {[bookingSource, pickupLocation].filter(Boolean).join(" - ")}
                </div>
              </div>
              {customerName && (
                <div className="text-xs text-zinc-700 dark:text-zinc-300 truncate mt-0.5">
                  {customerName}
                </div>
              )}
            </div>

            {/* Pilot badges grid - includes assigned pilots and overbooked indicators */}
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${span}, 1fr)` }}>
              {Array.from({ length: span }, (_, index) => {
                const pilot = assignedPilots[index];
                const payment = pilotPayments?.find(p => p.pilotName === pilot);
                const amount = payment?.amount;
                const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
                const requiresFemalePilot = index < femalePilotsRequired;
                const isOverbookedPosition = isOverbookedSlot(index);
                const isOwnName = !!(currentUserDisplayName && pilot === currentUserDisplayName);
                const isAcknowledged = pilot ? acknowledgedPilots.includes(pilot) : false;
                const assignedHistory = getPilotAssignedByName(pilot);
                const assignedHistoryEntries = getPilotAssignmentHistoryEntries(pilot);
                const paymentHistory = getLatestPaymentHistory(pilot);
                const paymentHistoryEntries = getPaymentHistoryEntries(pilot);

                return (
                  <PilotSlot
                    key={index}
                    bookingId={bookingId!}
                    slotIndex={index}
                    pilot={pilot}
                    canDrag={canDrag && !!bookingId}
                    isValidDropTarget={isValidPilotDropTarget && !!bookingId}
                    isAcknowledged={isAcknowledged}
                    requiresFemalePilot={requiresFemalePilot}
                    isOverbookedPosition={isOverbookedPosition}
                    numAmount={numAmount}
                    canClickToUnassign={isOwnName && !!onPilotNameClick}
                    canLongPress={isOwnName && !!onPilotNameLongPress}
                    isSecondDriverSelected={Boolean(pilot && secondDriverPilots.includes(pilot))}
                    canSelectSecondDriverPilot={Boolean(pilot && isSecondDriverPilotSelectionMode && onSecondDriverPilotToggle)}
                    assignedHistory={assignedHistory}
                    assignedHistoryEntries={assignedHistoryEntries}
                    paymentHistory={paymentHistory}
                    paymentHistoryEntries={paymentHistoryEntries}
                    onPilotNameClick={onPilotNameClick}
                    onPilotNameLongPress={onPilotNameLongPress}
                    onSecondDriverPilotToggle={onSecondDriverPilotToggle}
                  />
                );
              })}
            </div>
          </>
        )}
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
    const hasClickHandler = isCurrentUserPilot || onNoPilotClick;
    const isOnRequest = pilotAvailabilityStatus === "onRequest";
    return (
      <div
        data-history-hover-target="no-pilot-cell"
        data-history-entries={JSON.stringify(noPilotHistoryEntries)}
        className={`w-full h-full rounded-lg flex items-center justify-center ${
          isMoveModeActive
            ? 'bg-blue-200 dark:bg-blue-900/40 hover:bg-blue-300 dark:hover:bg-blue-800/50 border-2 border-blue-400 dark:border-blue-600 cursor-pointer'
            : isOnRequest
            ? (hasClickHandler ? 'bg-amber-200 dark:bg-amber-700/50 cursor-pointer hover:bg-amber-300 dark:hover:bg-amber-600/50' : 'bg-amber-200 dark:bg-amber-700/50 cursor-not-allowed')
            : isFemalePilot
            ? (hasClickHandler ? 'bg-red-600/80 cursor-pointer hover:bg-red-700/80' : 'bg-red-600/80 cursor-not-allowed')
            : (hasClickHandler ? 'bg-gray-500 dark:bg-zinc-900 cursor-pointer hover:bg-gray-400 dark:hover:bg-zinc-800' : 'bg-gray-500 dark:bg-zinc-900 cursor-not-allowed')
        }`}
        onClick={onNoPilotClick}
        onContextMenu={handleNoPilotContextMenu}
        onTouchStart={handleNoPilotTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className={`text-xs ${isMoveModeActive ? 'text-blue-600 dark:text-blue-300' : isOnRequest ? 'text-amber-700 dark:text-amber-300' : isFemalePilot ? 'text-white' : 'text-white dark:text-zinc-500'}`}>{isOnRequest ? `${pilotId.toLowerCase()} on request` : `no ${pilotId.toLowerCase()}`}</div>
      </div>
    );
  }

  // Hide base cell styling when showing multi-column overlay
  const showMultiColumnOverlay = isOver && hasEnoughSpace && dropZoneWidth > 1;
  const isOnRequest = pilotAvailabilityStatus === "onRequest";

  // Get base styling for available cell (non-drag states)
  const getAvailableCellBaseStyle = () => {
    if (isMoveModeActive) {
      return 'bg-blue-200 dark:bg-blue-900/40 hover:bg-blue-300 dark:hover:bg-blue-800/50 border-2 border-blue-400 dark:border-blue-600';
    }
    if (showMultiColumnOverlay) {
      return isOnRequest
        ? 'bg-amber-200 dark:bg-amber-800/60 relative'
        : 'bg-gray-300 dark:bg-zinc-800 relative';
    }
    if (isOver && hasEnoughSpace) {
      return 'bg-green-600/40 border-2 border-green-500';
    }
    if (!hasEnoughSpace && draggedItemPax) {
      return 'bg-red-600/20 border border-red-500';
    }
    if (isOnRequest) {
      return 'bg-amber-200 dark:bg-amber-700/50 hover:bg-amber-300 dark:hover:bg-amber-600/50';
    }
    return 'bg-gray-300 dark:bg-zinc-800 hover:bg-gray-400 dark:hover:bg-zinc-700';
  };

  // Determine if booking is allowed on this cell
  const canBookThisCell = isOnRequest ? canBookOnRequest : true;
  const effectiveOnAvailableClick = canBookThisCell ? onAvailableClick : undefined;

  return (
    <div
      ref={setDropNodeRef}
      className={`w-full h-full rounded-lg transition-colors flex items-center justify-center ${
        hasEnoughSpace && canBookThisCell ? 'cursor-pointer' : 'cursor-not-allowed'
      } ${getAvailableCellBaseStyle()}`}
      onClick={effectiveOnAvailableClick}
      onContextMenu={handleAvailableContextMenu}
      onTouchStart={handleAvailableTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* On request label for empty cells */}
      {isOnRequest && !isOver && (
        <div className="text-xs text-amber-700 dark:text-amber-300">{pilotId.toLowerCase()} on request</div>
      )}

      {/* Empty booking cell - available for booking */}
      {isOver && !hasEnoughSpace && (
        <div className="flex items-center justify-center h-full text-xs text-red-600 dark:text-red-400">
          Not enough space
        </div>
      )}

      {/* Multi-column drop zone indicator */}
      {showMultiColumnOverlay && (
        <div
          className="absolute top-0 left-0 h-full bg-green-600/40 border-2 border-green-500 rounded-lg pointer-events-none"
          style={{
            width: `calc(${dropZoneWidth * 100}% + ${(dropZoneWidth - 1) * 8}px)`,
          }}
        />
      )}
    </div>
  );
});

import { useRef, useState } from "react";
import { Phone, Mail, Users, Calendar, Clock, PhoneCall, AlertTriangle } from "lucide-react";
import type { BookingRequest } from "../types/index";
import { useDraggable } from "@dnd-kit/core";

interface BookingRequestItemProps {
  request: BookingRequest;
  onContextMenu: (request: BookingRequest, position: { x: number; y: number }) => void;
  onDateClick: (date: string) => void;
  canDrag?: boolean; // Whether this request can be dragged (admin only)
  availableSpots?: number; // Number of available spots at this time slot
  // Move mode props (admin only)
  onEnterMoveMode?: (request: BookingRequest) => void; // Callback to enter move mode
  isInMoveMode?: boolean; // Whether this specific request is in move mode
}

export function BookingRequestItem({ request, onContextMenu, onDateClick, canDrag = false, availableSpots, onEnterMoveMode, isInMoveMode = false }: BookingRequestItemProps) {
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const moveModeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [pressGlow, setPressGlow] = useState<'none' | 'light' | 'intense'>('none');
  const preventClickRef = useRef(false);

  // Check if this booking would cause overbooking
  const wouldOverbook = availableSpots !== undefined && request.numberOfPeople > availableSpots;

  // Set up draggable for booking requests (admin only)
  const draggableId = request.id ? `request-${request.id}` : null;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId || 'disabled',
    disabled: !canDrag || !request.id,
  });

  // Apply drag transform
  const dragStyle = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
  } : {};

  const handleContextMenuEvent = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(request, { x: e.clientX, y: e.clientY });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    // Stage 1: 500ms - context menu + light glow
    longPressTimerRef.current = setTimeout(() => {
      const touch = e.touches[0];
      setPressGlow('light');
      onContextMenu(request, { x: touch.clientX, y: touch.clientY });
    }, 500); // 500ms for context menu

    // Stage 2: 1000ms - move mode + intense glow (admin only)
    if (onEnterMoveMode && canDrag && request.id) {
      moveModeTimerRef.current = setTimeout(() => {
        setPressGlow('intense');

        // Trigger haptic feedback if supported
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }

        // Prevent click event from firing after this long press
        preventClickRef.current = true;

        onEnterMoveMode(request);
      }, 1000); // 1000ms for move mode
    }
  };

  const handleTouchMove = () => {
    // For simplicity, cancel both timers on any move
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
      {...(canDrag && request.id ? { ...attributes, ...listeners } : {})}
      onContextMenu={handleContextMenuEvent}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      className={`bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-800 rounded-lg p-3 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all select-none ${canDrag && request.id ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ ...dragStyle, boxShadow }}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left side: Customer name and badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-gray-900 dark:text-white font-medium">{request.customerName}</p>
          <span className="px-2 py-0.5 bg-gray-900 dark:bg-white text-white dark:text-black text-xs font-medium rounded-full flex items-center gap-1">
            <Users className="w-3 h-3" />
            {request.numberOfPeople}
          </span>
          {request.flightType && request.flightType !== "sensational" && (
            <span className="px-2 py-0.5 bg-blue-600 text-white text-xs font-medium rounded-full capitalize">
              {request.flightType}
            </span>
          )}
        </div>

        {/* Right side: Date and time */}
        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-zinc-400">
          {wouldOverbook && (
            <div
              className="flex items-center gap-1 text-orange-400"
              title={`Would overbook: ${request.numberOfPeople} requested, only ${availableSpots} available`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDateClick(request.date);
            }}
            className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer"
            title="Go to this date"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{request.date}</span>
          </button>
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>{request.time}</span>
          </div>
        </div>
      </div>

      {/* Contact information */}
      <div className="mt-2 space-y-1.5">
        {request.email && (
          <div className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-gray-500 dark:text-zinc-500 flex-shrink-0" />
            <span className="text-xs text-gray-700 dark:text-zinc-300 flex-1 truncate">{request.email}</span>
            <a
              href={`mailto:${request.email}`}
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-md bg-blue-100 dark:bg-blue-600 hover:bg-blue-200 dark:hover:bg-blue-700 text-blue-700 dark:text-white transition-colors"
              title="Send Email"
            >
              <Mail className="w-4 h-4" />
            </a>
          </div>
        )}
        {request.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-gray-500 dark:text-zinc-500 flex-shrink-0" />
            <span className="text-xs text-gray-700 dark:text-zinc-300 flex-1 truncate">
              {request.phone}
            </span>
            <div className="flex gap-1">
              <a
                href={`tel:${request.phone.replace(/\s/g, '')}`}
                onClick={(e) => e.stopPropagation()}
                className="p-2 rounded-md bg-blue-100 dark:bg-blue-600 hover:bg-blue-200 dark:hover:bg-blue-700 text-blue-700 dark:text-white transition-colors"
                title="Call"
              >
                <PhoneCall className="w-4 h-4" />
              </a>
              <a
                href={`https://wa.me/${request.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-2 rounded-md bg-green-100 dark:bg-[#25D366] hover:bg-green-200 dark:hover:bg-[#20BA5A] text-green-700 dark:text-white transition-colors"
                title="WhatsApp"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      {request.notes && (
        <p className="mt-2 text-xs text-gray-600 dark:text-zinc-500 italic truncate">"{request.notes}"</p>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Calendar, CalendarClock, ListPlus, ListMinus, Trash2 } from "lucide-react";

interface ScheduleBookingRequestContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onBook: () => void;
  onBookForAnotherTime: () => void;
  onAddToWaitingList?: () => void;
  onRemoveFromWaitingList?: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ScheduleBookingRequestContextMenu({
  isOpen,
  position,
  onBook,
  onBookForAnotherTime,
  onAddToWaitingList,
  onRemoveFromWaitingList,
  onDelete,
  onClose,
}: ScheduleBookingRequestContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isPositioned, setIsPositioned] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  // Reset positioning state when menu opens
  useEffect(() => {
    if (isOpen) {
      setIsPositioned(false);
    }
  }, [isOpen]);

  // Adjust position to keep menu on screen
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Position menu to the left of the touch point (anchor at top-right)
    let adjustedLeft = position.x - rect.width;
    let adjustedTop = position.y;

    // Adjust horizontal position if menu goes off left edge
    if (adjustedLeft < 10) {
      adjustedLeft = position.x;
    }

    // Adjust horizontal position if menu goes off right edge
    if (adjustedLeft + rect.width > viewportWidth - 10) {
      adjustedLeft = viewportWidth - rect.width - 10;
    }

    // Adjust vertical position if menu goes off bottom
    if (rect.bottom > viewportHeight) {
      adjustedTop = viewportHeight - rect.height - 10;
    }

    menu.style.left = `${adjustedLeft}px`;
    menu.style.top = `${adjustedTop}px`;

    // Mark as positioned to make visible
    setIsPositioned(true);
  }, [isOpen, position]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" />

      {/* Context Menu */}
      <div
        ref={menuRef}
        className={`fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[200px] transition-opacity duration-75 ${
          isPositioned ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ left: position.x, top: position.y }}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3 py-1.5 text-xs font-medium text-zinc-400 border-b border-zinc-700">
          Booking Request
        </div>

        {/* Options */}
        <div className="py-1">
          <button
            onClick={() => {
              onBook();
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-sm text-white hover:bg-zinc-700 transition-colors flex items-center gap-2"
          >
            <Calendar className="w-4 h-4" />
            <span>Book This Slot</span>
          </button>

          <button
            onClick={() => {
              onBookForAnotherTime();
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-sm text-white hover:bg-zinc-700 transition-colors flex items-center gap-2"
          >
            <CalendarClock className="w-4 h-4" />
            <span>Book for Another Time</span>
          </button>

          {onAddToWaitingList && (
            <button
              onClick={() => {
                onAddToWaitingList();
                onClose();
              }}
              className="w-full px-3 py-2 text-left text-sm text-white hover:bg-zinc-700 transition-colors flex items-center gap-2"
            >
              <ListPlus className="w-4 h-4" />
              <span>Add to Waiting List</span>
            </button>
          )}

          {onRemoveFromWaitingList && (
            <button
              onClick={() => {
                onRemoveFromWaitingList();
                onClose();
              }}
              className="w-full px-3 py-2 text-left text-sm text-white hover:bg-zinc-700 transition-colors flex items-center gap-2"
            >
              <ListMinus className="w-4 h-4" />
              <span>Remove from Waiting List</span>
            </button>
          )}

          <div className="border-t border-zinc-700 my-1" />

          <button
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-zinc-700 transition-colors flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </>
  );
}

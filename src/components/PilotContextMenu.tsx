import { useEffect, useRef, useState } from "react";
import { X, UserCheck, Check, Copy, ArrowRightToLine } from "lucide-react";
import type { Pilot, AvailabilityStatus } from "../types/index";

interface PilotContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  bookingStatus?: "unconfirmed" | "confirmed" | "pending" | "cancelled" | "deleted" | "no show";
  availablePilots: Pilot[];
  pilotFlightCounts?: Record<string, number>;
  currentPilot?: string;
  currentUserDisplayName?: string;
  isAcknowledged?: boolean;
  nextTimeSlot?: string | null;
  getPilotAvailabilityStatus?: (pilotUid: string, timeSlot: string) => AvailabilityStatus;
  onSelectPilot: (pilotName: string) => void;
  onUnassign: () => void;
  onAcknowledge?: () => void;
  onCopyTo?: () => void;
  onMoveToBack?: () => void;
  onClose: () => void;
  isPilotSelfUnassign?: boolean; // Whether this is a pilot unassigning themselves
}

export function PilotContextMenu({
  isOpen,
  position,
  bookingStatus,
  availablePilots,
  pilotFlightCounts = {},
  currentPilot,
  currentUserDisplayName,
  isAcknowledged = false,
  nextTimeSlot,
  getPilotAvailabilityStatus,
  onSelectPilot,
  onUnassign,
  onAcknowledge,
  onCopyTo,
  onMoveToBack,
  onClose,
  isPilotSelfUnassign = false,
}: PilotContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isPositioned, setIsPositioned] = useState(false);
  const canAssignPilots = bookingStatus !== "cancelled";

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

    // Position menu to the left of the touch point (anchor at top-right)
    let adjustedLeft = position.x - rect.width;
    let adjustedTop = position.y;

    // Adjust horizontal position if menu goes off left edge
    if (adjustedLeft < 10) {
      adjustedLeft = 10;
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
        className={`fixed z-50 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px] max-h-[400px] overflow-y-auto transition-opacity duration-75 ${
          isPositioned ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ left: position.x, top: position.y }}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {!isPilotSelfUnassign && canAssignPilots && (
          <div className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-zinc-400 border-b border-gray-300 dark:border-zinc-700">
            Assign Pilot
          </div>
        )}

        {/* Un-assign Option */}
        {currentPilot && canAssignPilots && (
          <button
            onClick={() => {
              onUnassign();
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            <span>Un-assign</span>
          </button>
        )}

        {/* Acknowledge Option - Show if current user is the assigned pilot and hasn't acknowledged yet */}
        {currentPilot && currentUserDisplayName && currentPilot === currentUserDisplayName && !isAcknowledged && onAcknowledge && canAssignPilots && (
          <button
            onClick={() => {
              onAcknowledge();
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-sm text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>I'm here!</span>
          </button>
        )}

        {/* Available Pilots - Only show if not pilot self-unassign */}
        {!isPilotSelfUnassign && canAssignPilots && (
          <>
            {currentPilot && <div className="border-t border-gray-300 dark:border-zinc-700 my-1" />}
            {availablePilots.length > 0 ? (
              <div className="py-1">
                {availablePilots.map((pilot) => {
                  const isCurrent = currentPilot === pilot.displayName;
                  const flightCount = pilotFlightCounts[pilot.displayName] || 0;
                  // Treat as "signed out next turn" when pilot is available now (this list)
                  // but unavailable in the immediate next time slot.
                  // Do not require signedOutAt, because older records may miss that timestamp.
                  const isSignedOutNextSlot = Boolean(
                    nextTimeSlot &&
                    getPilotAvailabilityStatus?.(pilot.uid, nextTimeSlot) === "unavailable"
                  );

                  const textClass = isCurrent
                    ? "text-green-600 dark:text-green-400"
                    : isSignedOutNextSlot
                      ? "text-orange-600 dark:text-orange-400"
                      : "text-gray-900 dark:text-white";

                  return (
                    <button
                      key={pilot.uid}
                      onClick={() => {
                        onSelectPilot(pilot.displayName);
                        onClose();
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between gap-2 ${textClass}`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{pilot.displayName}</span>
                        {flightCount > 0 && (
                          <span className="bg-blue-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                            {flightCount}
                          </span>
                        )}
                      </div>
                      {isCurrent && <UserCheck className="w-4 h-4" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-zinc-500">
                No pilots available
              </div>
            )}
          </>
        )}

        {/* Bottom Actions */}
        {(onCopyTo || onMoveToBack) && !isPilotSelfUnassign && (
          <>
            <div className="border-t border-gray-300 dark:border-zinc-700 my-1" />
            {onMoveToBack && (
              <button
                onClick={() => {
                  onMoveToBack();
                  onClose();
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
              >
                <ArrowRightToLine className="w-4 h-4" />
                <span>Move to the back</span>
              </button>
            )}
            {onCopyTo && (
              <button
                onClick={() => {
                  onCopyTo();
                  onClose();
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                <span>Copy to</span>
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}

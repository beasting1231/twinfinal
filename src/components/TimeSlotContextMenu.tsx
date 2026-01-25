import { useEffect, useRef } from "react";
import { Clock, LogIn, LogOut } from "lucide-react";
import type { AvailabilityStatus } from "../types/index";

interface TimeSlotContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onAddPilot: () => void;
  onChangeTime: () => void;
  onAddTime: () => void;
  onRemoveTime?: () => void;
  onOnRequest?: () => void; // Handler for setting current user's availability to "on request"
  onSignIn?: () => void; // Handler for signing in (available)
  onSignOut?: () => void; // Handler for signing out (unavailable)
  currentAvailabilityStatus?: AvailabilityStatus; // Current user's availability status for this time slot
  isAdditionalSlot?: boolean;
  canManageAvailability?: boolean; // Whether the current user can sign in/out and set on request (pilots and admins)
  onClose: () => void;
}

export function TimeSlotContextMenu({
  isOpen,
  position,
  onAddPilot,
  onChangeTime,
  onAddTime,
  onRemoveTime,
  onOnRequest,
  onSignIn,
  onSignOut,
  currentAvailabilityStatus = "unavailable",
  isAdditionalSlot = false,
  canManageAvailability = false,
  onClose,
}: TimeSlotContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking/tapping outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use setTimeout to prevent immediate closing from the same click/touch that opened the menu
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="fixed bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <button
        onClick={() => {
          onAddPilot();
          onClose();
        }}
        className="w-full px-4 py-2 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
      >
        Add Pilot
      </button>
      <button
        onClick={() => {
          onChangeTime();
          onClose();
        }}
        className="w-full px-4 py-2 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
      >
        Change Time
      </button>
      <button
        onClick={() => {
          onAddTime();
          onClose();
        }}
        className="w-full px-4 py-2 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
      >
        Add Time
      </button>
      {/* Availability management options for pilots and admins */}
      {canManageAvailability && (
        <>
          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-zinc-700 my-1" />

          {/* Sign In - show when unavailable or on request */}
          {(currentAvailabilityStatus === "unavailable" || currentAvailabilityStatus === "onRequest") && onSignIn && (
            <button
              onClick={() => {
                onSignIn();
                onClose();
              }}
              className="w-full px-4 py-2 text-left text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
          )}

          {/* On Request - show when unavailable or available */}
          {(currentAvailabilityStatus === "unavailable" || currentAvailabilityStatus === "available") && onOnRequest && (
            <button
              onClick={() => {
                onOnRequest();
                onClose();
              }}
              className="w-full px-4 py-2 text-left text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex items-center gap-2"
            >
              <Clock className="w-4 h-4" />
              On request
            </button>
          )}

          {/* Sign Out - show when available or on request */}
          {(currentAvailabilityStatus === "available" || currentAvailabilityStatus === "onRequest") && onSignOut && (
            <button
              onClick={() => {
                onSignOut();
                onClose();
              }}
              className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          )}
        </>
      )}
      {isAdditionalSlot && onRemoveTime && (
        <button
          onClick={() => {
            onRemoveTime();
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          Remove Time
        </button>
      )}
    </div>
  );
}

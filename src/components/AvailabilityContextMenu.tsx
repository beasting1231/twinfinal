import { useEffect, useRef, useState } from "react";
import { LogIn, LogOut } from "lucide-react";

interface AvailabilityContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  isSignedOut: boolean;
  canSignOut: boolean; // Can't sign out if already assigned to a booking
  pilotName?: string; // Optional pilot name to show in menu
  onSignIn: () => void;
  onSignOut: () => void;
  onClose: () => void;
}

export function AvailabilityContextMenu({
  isOpen,
  position,
  isSignedOut,
  canSignOut,
  pilotName,
  onSignIn,
  onSignOut,
  onClose,
}: AvailabilityContextMenuProps) {
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
      console.log("AvailabilityContextMenu opened!", { position, isSignedOut, canSignOut });
      setIsPositioned(false);
    }
  }, [isOpen, position, isSignedOut, canSignOut]);

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
        className={`fixed z-[9999] bg-zinc-800 border-2 border-blue-500 rounded-lg shadow-2xl py-1 min-w-[180px] ${
          isPositioned ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          pointerEvents: 'auto'
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="px-3 py-1.5 text-xs font-medium text-zinc-400 border-b border-zinc-700">
          Availability
        </div>

        {/* Actions */}
        <div className="py-1">
          {isSignedOut ? (
            <button
              onClick={() => {
                onSignIn();
                onClose();
              }}
              className="w-full px-3 py-2 text-left text-sm text-green-400 hover:bg-zinc-700 transition-colors flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign {pilotName ? `${pilotName} ` : ''}In</span>
            </button>
          ) : (
            <button
              onClick={() => {
                onSignOut();
                onClose();
              }}
              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-zinc-700 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign {pilotName ? `${pilotName} ` : ''}Out</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}

import { useEffect, useRef, useState } from "react";

interface DriverVehicleContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onDelete: () => void;
  onFill: () => void;
  onAddSecondDriver?: () => void;
  onDeleteSecondDriver?: () => void;
  onClose: () => void;
}

export function DriverVehicleContextMenu({
  isOpen,
  position,
  onDelete,
  onFill,
  onAddSecondDriver,
  onDeleteSecondDriver,
  onClose,
}: DriverVehicleContextMenuProps) {
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
        className={`fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[150px] transition-opacity duration-75 ${
          isPositioned ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ left: position.x, top: position.y }}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="w-full px-4 py-2 text-left text-sm text-white hover:bg-zinc-800 transition-colors"
      >
        Delete
      </button>
      <button
        onClick={() => {
          onFill();
          onClose();
        }}
        className="w-full px-4 py-2 text-left text-sm text-white hover:bg-zinc-800 transition-colors"
      >
        Fill
      </button>
      {onAddSecondDriver && (
        <button
          onClick={() => {
            onAddSecondDriver();
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm text-white hover:bg-zinc-800 transition-colors"
        >
          Add second driver
        </button>
      )}
      {onDeleteSecondDriver && (
        <button
          onClick={() => {
            onDeleteSecondDriver();
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm text-white hover:bg-zinc-800 transition-colors"
        >
          Delete second driver
        </button>
      )}
    </div>
    </>
  );
}

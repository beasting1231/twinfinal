import { useEffect, useRef } from "react";

interface TimeSlotContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onAddPilot: () => void;
  onChangeTime: () => void;
  onClose: () => void;
}

export function TimeSlotContextMenu({
  isOpen,
  position,
  onAddPilot,
  onChangeTime,
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
    </div>
  );
}

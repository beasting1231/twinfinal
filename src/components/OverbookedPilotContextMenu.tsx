import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Pilot } from "../types/index";

interface OverbookedPilotContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  unavailablePilots: Pilot[]; // Pilots who are NOT signed in at this time
  currentPilot?: string; // Currently assigned pilot for this slot
  onSelectPilot: (pilotName: string) => void;
  onUnassign: () => void;
  onClose: () => void;
}

export function OverbookedPilotContextMenu({
  isOpen,
  position,
  unavailablePilots,
  currentPilot,
  onSelectPilot,
  onUnassign,
  onClose,
}: OverbookedPilotContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPositioned, setIsPositioned] = useState(false);
  const [customName, setCustomName] = useState("");

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

  // Reset positioning state and custom name when menu opens
  useEffect(() => {
    if (isOpen) {
      setIsPositioned(false);
      setCustomName("");
      // Focus input after a brief delay to allow positioning
      setTimeout(() => inputRef.current?.focus(), 100);
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
        className={`fixed z-50 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg shadow-xl py-1 min-w-[200px] max-h-[400px] overflow-y-auto transition-opacity duration-75 ${
          isPositioned ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ left: position.x, top: position.y }}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3 py-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 border-b border-gray-300 dark:border-zinc-700">
          Assign Overbooked Pilot
        </div>

        {/* Custom Name Input */}
        <div className="px-3 py-2 border-b border-gray-300 dark:border-zinc-700">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (customName.trim()) {
                onSelectPilot(customName.trim());
                onClose();
              }
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Type custom name..."
              className="w-full px-2 py-1.5 text-sm bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </form>
        </div>

        {/* Un-assign Option */}
        {currentPilot && (
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

        {/* Unavailable Pilots */}
        {currentPilot && <div className="border-t border-gray-300 dark:border-zinc-700 my-1" />}
        {unavailablePilots.length > 0 ? (
          <div className="py-1">
            {unavailablePilots.map((pilot) => {
              const isCurrent = currentPilot === pilot.displayName;
              return (
                <button
                  key={pilot.uid}
                  onClick={() => {
                    onSelectPilot(pilot.displayName);
                    onClose();
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between gap-2 ${
                    isCurrent ? "text-orange-600 dark:text-orange-400" : "text-gray-900 dark:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{pilot.displayName}</span>
                    <span className="text-xs text-gray-500 dark:text-zinc-500">(not signed in)</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-3 py-2 text-sm text-gray-500 dark:text-zinc-500">
            No pilots to assign
          </div>
        )}
      </div>
    </>
  );
}

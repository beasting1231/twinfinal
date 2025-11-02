import { useEffect, useRef } from "react";
import { X, UserCheck } from "lucide-react";
import type { Pilot } from "../types/index";

interface PilotContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  availablePilots: Pilot[];
  currentPilot?: string;
  onSelectPilot: (pilotName: string) => void;
  onUnassign: () => void;
  onClose: () => void;
}

export function PilotContextMenu({
  isOpen,
  position,
  availablePilots,
  currentPilot,
  onSelectPilot,
  onUnassign,
  onClose,
}: PilotContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
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
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  // Adjust position to keep menu on screen
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedLeft = position.x;
    let adjustedTop = position.y;

    // Adjust horizontal position if menu goes off screen
    if (rect.right > viewportWidth) {
      adjustedLeft = viewportWidth - rect.width - 10;
    }

    // Adjust vertical position if menu goes off screen
    if (rect.bottom > viewportHeight) {
      adjustedTop = viewportHeight - rect.height - 10;
    }

    menu.style.left = `${adjustedLeft}px`;
    menu.style.top = `${adjustedTop}px`;
  }, [isOpen, position]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Context Menu */}
      <div
        ref={menuRef}
        className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px] max-h-[400px] overflow-y-auto"
        style={{ left: position.x, top: position.y }}
      >
        {/* Header */}
        <div className="px-3 py-1.5 text-xs font-medium text-zinc-400 border-b border-zinc-700">
          Assign Pilot
        </div>

        {/* Un-assign Option */}
        {currentPilot && (
          <>
            <button
              onClick={() => {
                onUnassign();
                onClose();
              }}
              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-zinc-700 transition-colors flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              <span>Un-assign</span>
            </button>
            <div className="border-t border-zinc-700 my-1" />
          </>
        )}

        {/* Available Pilots */}
        {availablePilots.length > 0 ? (
          <div className="py-1">
            {availablePilots.map((pilot) => {
              const isCurrent = currentPilot === pilot.displayName;
              return (
                <button
                  key={pilot.uid}
                  onClick={() => {
                    onSelectPilot(pilot.displayName);
                    onClose();
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-zinc-700 transition-colors flex items-center justify-between gap-2 ${
                    isCurrent ? "text-green-400" : "text-white"
                  }`}
                >
                  <span>{pilot.displayName}</span>
                  {isCurrent && <UserCheck className="w-4 h-4" />}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-3 py-2 text-sm text-zinc-500">
            No pilots available
          </div>
        )}
      </div>
    </>
  );
}

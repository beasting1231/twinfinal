import { useEffect, useRef } from "react";

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

  useEffect(() => {
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

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[150px]"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
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
  );
}

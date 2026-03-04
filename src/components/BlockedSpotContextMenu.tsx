import { useEffect, useRef, useState } from "react";

interface BlockedSpotContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onUnblock: () => void;
  onClose: () => void;
}

export function BlockedSpotContextMenu({
  isOpen,
  position,
  onUnblock,
  onClose,
}: BlockedSpotContextMenuProps) {
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

  useEffect(() => {
    if (isOpen) {
      setIsPositioned(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    let adjustedLeft = position.x - rect.width;
    let adjustedTop = position.y;

    if (adjustedLeft < 10) {
      adjustedLeft = 10;
    }

    if (rect.bottom > viewportHeight) {
      adjustedTop = viewportHeight - rect.height - 10;
    }

    menu.style.left = `${adjustedLeft}px`;
    menu.style.top = `${adjustedTop}px`;

    setIsPositioned(true);
  }, [isOpen, position]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" />

      <div
        ref={menuRef}
        className={`fixed z-[9999] bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg shadow-xl py-1 min-w-[150px] transition-opacity duration-75 ${
          isPositioned ? "opacity-100" : "opacity-0"
        }`}
        style={{ left: position.x, top: position.y }}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => {
            onUnblock();
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
        >
          Unblock spots
        </button>
      </div>
    </>
  );
}

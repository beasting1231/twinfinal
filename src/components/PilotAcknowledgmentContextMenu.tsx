import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

interface PilotAcknowledgmentContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  pilotName: string;
  onAcknowledge: () => void;
  onClose: () => void;
}

export function PilotAcknowledgmentContextMenu({
  isOpen,
  position,
  onAcknowledge,
  onClose
}: PilotAcknowledgmentContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg shadow-lg py-1 min-w-[180px]"
      style={{
        top: `${position.y}px`,
        left: `${position.x}px`,
      }}
    >
      <button
        onClick={() => {
          onAcknowledge();
          onClose();
        }}
        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-zinc-800 flex items-center gap-2"
      >
        <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
        <span className="text-gray-900 dark:text-white">I'm here!</span>
      </button>
      <div className="px-4 py-1 text-xs text-gray-500 dark:text-zinc-500">
        Confirms you've seen this assignment
      </div>
    </div>
  );
}

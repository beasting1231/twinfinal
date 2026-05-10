import { memo, useRef } from "react";

interface DeskAssignmentCellProps {
  desk?: string | null;
  onClick?: () => void;
  onContextMenu?: (position: { x: number; y: number }) => void;
}

export const DeskAssignmentCell = memo(function DeskAssignmentCell({
  desk,
  onClick,
  onContextMenu,
}: DeskAssignmentCellProps) {
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const hasDesk = Boolean(desk?.trim());

  const handleContextMenu = (event: React.MouseEvent) => {
    if (!onContextMenu) return;
    event.preventDefault();
    event.stopPropagation();
    onContextMenu({ x: event.clientX, y: event.clientY });
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    if (!onContextMenu) return;
    const touch = event.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    longPressTimerRef.current = setTimeout(() => {
      if (touchStartPosRef.current && onContextMenu) {
        onContextMenu({
          x: touchStartPosRef.current.x,
          y: touchStartPosRef.current.y,
        });
      }
    }, 500);
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (!touchStartPosRef.current) return;

    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);

    if (deltaX > 10 || deltaY > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      touchStartPosRef.current = null;
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
  };

  return (
    <div
      className={`w-full h-full rounded-lg p-2 flex flex-col items-center justify-center transition-colors ${
        onClick ? "cursor-pointer" : "cursor-default"
      } ${
        hasDesk
          ? `bg-blue-500/85 ${onClick ? "hover:bg-blue-400/90" : ""}`
          : `bg-blue-900/55 ${onClick ? "hover:bg-blue-800/70" : ""}`
      }`}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {hasDesk ? (
        <div className="text-xs text-white font-medium truncate w-full text-center">
          {desk}
        </div>
      ) : (
        <div className="text-xs text-blue-100 font-medium">no desk</div>
      )}
    </div>
  );
});

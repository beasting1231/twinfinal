import type { AvailabilityStatus } from "../types/index";

interface AvailabilityCellProps {
  timeSlot: string;
  isAvailable: boolean;
  status?: AvailabilityStatus; // "available", "onRequest", or "unavailable"
  isLocked?: boolean;
  isDisabled?: boolean;
  canOverrideLock?: boolean; // Allows clicking even when locked (for admins)
  isAdditional?: boolean; // True for additional time slots (not default)
  onToggle: () => void;
}

export function AvailabilityCell({ timeSlot, isAvailable, status = "unavailable", isLocked = false, isDisabled = false, canOverrideLock = false, isAdditional = false, onToggle }: AvailabilityCellProps) {
  const handleClick = () => {
    const canClick = canOverrideLock || (!isLocked && !isDisabled);
    if (canClick) {
      onToggle();
    }
  };

  const isInteractionDisabled = isDisabled || (isLocked && !canOverrideLock);
  const isOnRequest = status === "onRequest";

  // Determine cell styling based on status
  const getCellClasses = () => {
    if (isDisabled) {
      if (isOnRequest) {
        return "bg-amber-200/50 dark:bg-amber-900/30 border-amber-300/50 dark:border-amber-800/30 text-amber-600/50 dark:text-amber-500/50 cursor-not-allowed";
      }
      if (isAvailable) {
        return "bg-green-200/50 dark:bg-green-900/30 border-green-300/50 dark:border-green-800/30 text-green-600/50 dark:text-green-500/50 cursor-not-allowed";
      }
      return "bg-red-200/50 dark:bg-red-900/30 border-red-300/50 dark:border-red-800/30 text-red-600/50 dark:text-red-500/50 cursor-not-allowed";
    }

    if (isOnRequest) {
      if (isLocked) {
        if (canOverrideLock) {
          return "bg-amber-400 dark:bg-amber-900/80 border-amber-500 dark:border-amber-800 text-amber-900 dark:text-amber-300 hover:bg-amber-500 dark:hover:bg-amber-800/80 cursor-pointer";
        }
        return "bg-amber-400 dark:bg-amber-900/80 border-amber-500 dark:border-amber-800 text-amber-900 dark:text-amber-300 cursor-not-allowed";
      }
      return "bg-amber-200 dark:bg-amber-700/50 hover:bg-amber-300 dark:hover:bg-amber-600/50 border-amber-400 dark:border-amber-600/70 text-amber-800 dark:text-amber-200";
    }

    if (isAvailable) {
      if (isLocked) {
        if (canOverrideLock) {
          return "bg-green-600 dark:bg-green-950/90 border-green-700 dark:border-green-950 text-green-100 dark:text-green-400 hover:bg-green-700 dark:hover:bg-green-900 cursor-pointer";
        }
        return "bg-green-600 dark:bg-green-950/90 border-green-700 dark:border-green-950 text-green-100 dark:text-green-400 cursor-not-allowed";
      }
      return "bg-green-300 dark:bg-green-700/60 hover:bg-green-400 dark:hover:bg-green-600/60 border-green-500 dark:border-green-600/70 text-green-900 dark:text-green-100";
    }

    return "bg-red-300 dark:bg-red-700/60 hover:bg-red-400 dark:hover:bg-red-600/60 border-red-500 dark:border-red-600/70 text-red-900 dark:text-red-100";
  };

  return (
    <button
      onClick={handleClick}
      disabled={isInteractionDisabled}
      className={`w-full h-14 rounded-lg transition-all font-medium border ${getCellClasses()}`}
    >
      <span className="flex items-center justify-center gap-1">
        {isAdditional && <span className="text-emerald-600 dark:text-emerald-400 font-bold">+</span>}
        <span className={isAdditional ? "text-emerald-700 dark:text-emerald-300" : ""}>{timeSlot}</span>
      </span>
    </button>
  );
}

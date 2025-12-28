interface AvailabilityCellProps {
  timeSlot: string;
  isAvailable: boolean;
  isLocked?: boolean;
  isDisabled?: boolean;
  canOverrideLock?: boolean; // Allows clicking even when locked (for admins)
  onToggle: () => void;
}

export function AvailabilityCell({ timeSlot, isAvailable, isLocked = false, isDisabled = false, canOverrideLock = false, onToggle }: AvailabilityCellProps) {
  const handleClick = () => {
    const canClick = canOverrideLock || (!isLocked && !isDisabled);
    if (canClick) {
      onToggle();
    }
  };

  const isInteractionDisabled = isDisabled || (isLocked && !canOverrideLock);

  return (
    <button
      onClick={handleClick}
      disabled={isInteractionDisabled}
      className={`w-full h-14 rounded-lg transition-all font-medium border ${
        isDisabled
          ? isAvailable
            ? "bg-green-200/50 dark:bg-green-900/30 border-green-300/50 dark:border-green-800/30 text-green-600/50 dark:text-green-500/50 cursor-not-allowed"
            : "bg-red-200/50 dark:bg-red-900/30 border-red-300/50 dark:border-red-800/30 text-red-600/50 dark:text-red-500/50 cursor-not-allowed"
          : isAvailable
          ? isLocked
            ? canOverrideLock
              ? "bg-green-600 dark:bg-green-950/90 border-green-700 dark:border-green-950 text-green-100 dark:text-green-400 hover:bg-green-700 dark:hover:bg-green-900 cursor-pointer"
              : "bg-green-600 dark:bg-green-950/90 border-green-700 dark:border-green-950 text-green-100 dark:text-green-400 cursor-not-allowed"
            : "bg-green-300 dark:bg-green-700/60 hover:bg-green-400 dark:hover:bg-green-600/60 border-green-500 dark:border-green-600/70 text-green-900 dark:text-green-100"
          : "bg-red-300 dark:bg-red-700/60 hover:bg-red-400 dark:hover:bg-red-600/60 border-red-500 dark:border-red-600/70 text-red-900 dark:text-red-100"
      }`}
    >
      {timeSlot}
    </button>
  );
}

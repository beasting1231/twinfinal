interface AvailabilityCellProps {
  timeSlot: string;
  isAvailable: boolean;
  isLocked?: boolean;
  onToggle: () => void;
}

export function AvailabilityCell({ timeSlot, isAvailable, isLocked = false, onToggle }: AvailabilityCellProps) {
  const handleClick = () => {
    if (!isLocked) {
      onToggle();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isLocked}
      className={`w-full h-14 rounded-lg transition-all font-medium text-white border ${
        isAvailable
          ? isLocked
            ? "bg-green-700/30 border-green-500/40 cursor-not-allowed"
            : "bg-green-700/60 hover:bg-green-600/60 border-green-500/70"
          : "bg-red-700/60 hover:bg-red-600/60 border-red-500/70"
      }`}
    >
      {timeSlot}
    </button>
  );
}

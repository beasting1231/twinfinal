interface AvailabilityCellProps {
  timeSlot: string;
  isAvailable: boolean;
  onToggle: () => void;
}

export function AvailabilityCell({ timeSlot, isAvailable, onToggle }: AvailabilityCellProps) {
  return (
    <button
      onClick={onToggle}
      className={`w-full h-14 rounded-lg transition-all font-medium text-white border ${
        isAvailable
          ? "bg-green-700/60 hover:bg-green-600/60 border-green-500/70"
          : "bg-red-700/60 hover:bg-red-600/60 border-red-500/70"
      }`}
    >
      {timeSlot}
    </button>
  );
}

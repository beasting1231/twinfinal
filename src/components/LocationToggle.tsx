import { useState, useEffect } from "react";
import { MapPin, MapPinOff } from "lucide-react";

interface LocationToggleProps {
  onChange?: (enabled: boolean) => void;
}

export function LocationToggle({ onChange }: LocationToggleProps) {
  const [isEnabled, setIsEnabled] = useState(() => {
    return localStorage.getItem("locationTrackingEnabled") === "true";
  });

  useEffect(() => {
    onChange?.(isEnabled);
  }, [isEnabled, onChange]);

  const handleToggle = () => {
    const newValue = !isEnabled;
    setIsEnabled(newValue);
    localStorage.setItem("locationTrackingEnabled", newValue.toString());
    // Force a re-render of components using the location hook
    window.dispatchEvent(new Event("storage"));
  };

  return (
    <button
      onClick={handleToggle}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
        isEnabled
          ? "bg-green-500 hover:bg-green-600 text-white"
          : "bg-gray-200 hover:bg-gray-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-900 dark:text-white"
      }`}
    >
      {isEnabled ? (
        <>
          <MapPin className="w-4 h-4" />
          <span>Location Tracking: ON</span>
        </>
      ) : (
        <>
          <MapPinOff className="w-4 h-4" />
          <span>Location Tracking: OFF</span>
        </>
      )}
    </button>
  );
}

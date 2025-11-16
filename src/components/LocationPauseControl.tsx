import { useState, useEffect } from "react";
import { Clock, MapPin } from "lucide-react";

interface LocationPauseControlProps {
  onPauseChange: (isPaused: boolean, resumeTime: number | null) => void;
}

export function LocationPauseControl({ onPauseChange }: LocationPauseControlProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [resumeTime, setResumeTime] = useState<number | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  // Check for existing pause state on mount
  useEffect(() => {
    const savedResumeTime = localStorage.getItem("locationPauseUntil");
    if (savedResumeTime) {
      const resumeTimestamp = parseInt(savedResumeTime, 10);
      if (resumeTimestamp > Date.now()) {
        setIsPaused(true);
        setResumeTime(resumeTimestamp);
        onPauseChange(true, resumeTimestamp);
      } else {
        // Pause time has expired, clear it
        localStorage.removeItem("locationPauseUntil");
      }
    }
  }, [onPauseChange]);

  // Check if pause has expired
  useEffect(() => {
    if (!isPaused || !resumeTime) return;

    const checkInterval = setInterval(() => {
      if (Date.now() >= resumeTime) {
        setIsPaused(false);
        setResumeTime(null);
        localStorage.removeItem("locationPauseUntil");
        onPauseChange(false, null);
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [isPaused, resumeTime, onPauseChange]);

  const handlePause = (minutes: number) => {
    const resumeTimestamp = Date.now() + minutes * 60 * 1000;
    setIsPaused(true);
    setResumeTime(resumeTimestamp);
    setShowOptions(false);
    localStorage.setItem("locationPauseUntil", resumeTimestamp.toString());
    onPauseChange(true, resumeTimestamp);
  };

  const handleResume = () => {
    setIsPaused(false);
    setResumeTime(null);
    setShowOptions(false);
    localStorage.removeItem("locationPauseUntil");
    onPauseChange(false, null);
  };

  const getTimeRemaining = () => {
    if (!resumeTime) return "";
    const diff = resumeTime - Date.now();
    const minutes = Math.ceil(diff / 60000);
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  };

  return (
    <div className="relative">
      {isPaused ? (
        <button
          onClick={handleResume}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
        >
          <MapPin className="w-4 h-4" />
          <span>Location Paused ({getTimeRemaining()})</span>
        </button>
      ) : (
        <div>
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
          >
            <Clock className="w-4 h-4" />
            <span>Pause Location Tracking</span>
          </button>

          {showOptions && (
            <div className="absolute top-full mt-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg shadow-lg z-10 min-w-[200px]">
              <div className="p-2 space-y-1">
                <button
                  onClick={() => handlePause(5)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded text-sm text-gray-900 dark:text-white"
                >
                  5 minutes
                </button>
                <button
                  onClick={() => handlePause(15)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded text-sm text-gray-900 dark:text-white"
                >
                  15 minutes
                </button>
                <button
                  onClick={() => handlePause(30)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded text-sm text-gray-900 dark:text-white"
                >
                  30 minutes
                </button>
                <button
                  onClick={() => handlePause(60)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded text-sm text-gray-900 dark:text-white"
                >
                  1 hour
                </button>
                <button
                  onClick={() => handlePause(1440)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded text-sm text-gray-900 dark:text-white"
                >
                  1 day
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

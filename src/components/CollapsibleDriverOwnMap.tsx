import { useState } from "react";
import { Map, Minimize2 } from "lucide-react";
import { DriverOwnLocationMap } from "./DriverOwnLocationMap";

export function CollapsibleDriverOwnMap() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="relative">
      {!isExpanded ? (
        // Collapsed state - Map icon button
        <button
          onClick={() => setIsExpanded(true)}
          className="relative p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-lg"
        >
          <Map className="w-6 h-6" />
        </button>
      ) : (
        // Expanded state - Full map with minimize button inside
        <div className="w-full max-w-4xl relative">
          {/* Map content */}
          <div className="w-full h-[400px]">
            <DriverOwnLocationMap />
          </div>

          {/* Minimize button inside map */}
          <button
            onClick={() => setIsExpanded(false)}
            className="absolute top-4 right-4 z-[1000] p-2 bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors shadow-lg border border-gray-300 dark:border-zinc-700"
            title="Minimize"
          >
            <Minimize2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      )}
    </div>
  );
}

import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import { Icon } from "leaflet";
import { useDriverLocations } from "../hooks/useDriverLocations";
import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";

// Fix for default marker icons in React Leaflet
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (Icon.Default.prototype as any)._getIconUrl;
Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Component to auto-fit map bounds to show all markers
function AutoFitBounds({ locations }: { locations: Array<{ latitude: number; longitude: number }> }) {
  const map = useMap();

  useEffect(() => {
    if (locations.length > 0) {
      const bounds = locations.map(loc => [loc.latitude, loc.longitude] as [number, number]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [locations, map]);

  return null;
}

// Component to handle marker updates properly
function DriverMarkers({
  locations,
  currentTime
}: {
  locations: Array<{
    id?: string;
    displayName: string;
    latitude: number;
    longitude: number;
    timestamp: Date;
  }>;
  currentTime: number;
}) {
  useEffect(() => {
    console.log("DriverMarkers rendering with", locations.length, "locations:", locations.map(l => l.displayName).join(", "));
  }, [locations]);

  return (
    <>
      {locations.map((location) => {
        // Calculate how long ago the location was updated
        const lastUpdateMs = currentTime - location.timestamp.getTime();
        const minutesAgo = Math.floor(lastUpdateMs / 60000);
        const isStale = minutesAgo > 1;

        let lastUpdatedText = "Active";
        if (minutesAgo < 1) {
          lastUpdatedText = "Just now";
        } else if (minutesAgo === 1) {
          lastUpdatedText = "1 min ago";
        } else if (minutesAgo < 60) {
          lastUpdatedText = `${minutesAgo} mins ago`;
        } else {
          const hoursAgo = Math.floor(minutesAgo / 60);
          lastUpdatedText = hoursAgo === 1 ? "1 hour ago" : `${hoursAgo} hours ago`;
        }

        return (
          <Marker
            key={location.id}
            position={[location.latitude, location.longitude]}
            opacity={isStale ? 0.5 : 1}
          >
            <Tooltip
              permanent
              direction="top"
              offset={[0, -10]}
              className={`bg-white border rounded px-2 py-1 shadow-sm text-sm ${
                isStale
                  ? "border-orange-400 bg-orange-50"
                  : "border-gray-300"
              }`}
            >
              <div className="font-medium text-gray-900">{location.displayName}</div>
              <div className={`text-xs ${isStale ? "text-orange-600" : "text-green-600"}`}>
                {lastUpdatedText}
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}

export function DriverLocationMap() {
  const { driverLocations, loading, error } = useDriverLocations();
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update current time every 10 seconds to refresh "last updated" timestamps
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Default center (Switzerland - approximate center)
  const defaultCenter: [number, number] = [46.8182, 8.2275];
  const defaultZoom = 8;

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg">
        <div className="text-center text-red-600">
          <p className="font-medium">Error loading driver locations</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg">
        <div className="text-center text-gray-600">
          <p>Loading driver locations...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full rounded-lg overflow-hidden border border-gray-200 relative"
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: "100%", width: "100%" }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        <DriverMarkers locations={driverLocations} currentTime={currentTime} />

        {driverLocations.length > 0 && (
          <AutoFitBounds locations={driverLocations} />
        )}
      </MapContainer>

      {driverLocations.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-gray-50/50">
          <div className="bg-white px-6 py-4 rounded-lg shadow-lg border border-gray-300">
            <p className="text-base font-medium text-gray-700">No Active Drivers</p>
            <p className="text-sm text-gray-500 mt-1">Driver locations will appear here when available</p>
          </div>
        </div>
      )}
    </div>
  );
}

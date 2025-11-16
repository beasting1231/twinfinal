import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import { Icon } from "leaflet";
import { useState, useEffect } from "react";
import "leaflet/dist/leaflet.css";
import { useAuth } from "../contexts/AuthContext";

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

// Component to center map on user's location
function CenterOnLocation({ location }: { location: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(location, 13);
  }, [location, map]);

  return null;
}

export function DriverOwnLocationMap() {
  const { currentUser } = useAuth();
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default center (Switzerland - approximate center)
  const defaultCenter: [number, number] = [46.8182, 8.2275];

  useEffect(() => {
    // Get current location
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentLocation([position.coords.latitude, position.coords.longitude]);
        setError(null);
      },
      (err) => {
        console.error("Geolocation error:", err);
        setError(err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg">
        <div className="text-center text-red-600">
          <p className="font-medium">Error getting your location</p>
          <p className="text-sm">{error}</p>
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
        center={currentLocation || defaultCenter}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        {currentLocation && (
          <>
            <Marker position={currentLocation}>
              <Tooltip
                permanent
                direction="top"
                offset={[0, -10]}
                className="bg-white border border-gray-300 rounded px-2 py-1 shadow-sm text-sm font-medium text-gray-900"
              >
                {currentUser?.displayName || "You"}
              </Tooltip>
            </Marker>
            <CenterOnLocation location={currentLocation} />
          </>
        )}
      </MapContainer>

      {!currentLocation && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-gray-50/50">
          <div className="bg-white px-6 py-4 rounded-lg shadow-lg border border-gray-300">
            <p className="text-base font-medium text-gray-700">Getting your location...</p>
          </div>
        </div>
      )}
    </div>
  );
}

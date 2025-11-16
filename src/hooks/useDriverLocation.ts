import { useEffect, useState, useRef } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../contexts/AuthContext";

/**
 * Hook for drivers to track and update their location
 * Only active for users with the "driver" role
 * Can be paused by the user for a specified duration
 */
export function useDriverLocation() {
  const { currentUser, userRole } = useAuth();
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forceUpdate, setForceUpdate] = useState(0);
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Listen for storage changes
  useEffect(() => {
    const handleStorageChange = () => {
      setForceUpdate(prev => prev + 1);
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    // Only track location if user is a driver
    if (userRole !== "driver" || !currentUser) {
      return;
    }

    // Check if location tracking is enabled
    const isEnabled = localStorage.getItem("locationTrackingEnabled") === "true";

    if (!isEnabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTracking(false);
      return;
    }

    // Check if geolocation is supported
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    // Request location permission and start tracking
    const startTracking = () => {
      setError(null);
      setIsTracking(true);

      // Update location immediately
      updateLocation();

      // Then update every 10 seconds
      intervalRef.current = setInterval(() => {
        updateLocation();
      }, 10000);
    };

    const updateLocation = () => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const locationData = {
              id: currentUser.uid,
              displayName: currentUser.displayName || currentUser.email || "Unknown Driver",
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: serverTimestamp(),
            };

            // Update Firestore with the current location
            await setDoc(
              doc(db, "driverLocations", currentUser.uid),
              locationData
            );
          } catch (err) {
            console.error("Error updating location:", err);
            setError("Failed to update location");
          }
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
    };

    startTracking();

    // Cleanup on unmount
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      setIsTracking(false);
    };
  }, [currentUser, userRole, error, forceUpdate]);

  return { isTracking, error };
}

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { db } from "../../firebase/config";
import { useAuth } from "../../contexts/AuthContext";
import { useRole } from "../../hooks/useRole";
import { useTheme } from "../../contexts/ThemeContext";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Button } from "../ui/button";
import { Download } from "lucide-react";
import type { UserProfile } from "../../types/index";

// Type for the beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function Account() {
  const { currentUser } = useAuth();
  const { role } = useRole();
  const { theme, setTheme } = useTheme();
  const [displayName, setDisplayName] = useState("");
  const [femalePilot, setFemalePilot] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // PWA install state
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  // Listen for the beforeinstallprompt event
  useEffect(() => {
    // Check if already installed (standalone mode)
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(iOS);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;

    if (outcome === "accepted") {
      setInstallPrompt(null);
    }
  };

  // Load user profile from Firestore
  useEffect(() => {
    async function loadProfile() {
      if (!currentUser) return;

      try {
        const profileRef = doc(db, "userProfiles", currentUser.uid);
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists()) {
          const data = profileSnap.data() as UserProfile;
          setDisplayName(data.displayName || currentUser.displayName || "");
          setFemalePilot(data.femalePilot || false);
        } else {
          // Initialize with current auth data
          setDisplayName(currentUser.displayName || currentUser.email || "");
          setFemalePilot(false);
        }
      } catch (error) {
        console.error("Error loading profile:", error);
        setDisplayName(currentUser.displayName || currentUser.email || "");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [currentUser]);

  const handleSave = async () => {
    if (!currentUser) return;

    setSaving(true);
    setMessage(null);

    try {
      // Get the old display name from Firestore
      const profileRef = doc(db, "userProfiles", currentUser.uid);
      const profileSnap = await getDoc(profileRef);
      const oldDisplayName = profileSnap.exists() ? (profileSnap.data() as UserProfile).displayName : null;

      // Update Firebase Auth display name
      await updateProfile(currentUser, { displayName });

      // Update Firestore user profile
      await setDoc(
        profileRef,
        {
          uid: currentUser.uid,
          displayName,
          email: currentUser.email,
          femalePilot,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      // If the display name changed, update all bookings with the old name
      if (oldDisplayName && oldDisplayName !== displayName) {
        const bookingsSnapshot = await getDocs(collection(db, "bookings"));

        const updatePromises: Promise<void>[] = [];

        bookingsSnapshot.docs.forEach((bookingDoc) => {
          const bookingData = bookingDoc.data();
          let needsUpdate = false;
          const updates: any = {};

          // Update assignedPilots array
          if (bookingData.assignedPilots && Array.isArray(bookingData.assignedPilots)) {
            const updatedAssignedPilots = bookingData.assignedPilots.map((pilot: string) =>
              pilot === oldDisplayName ? displayName : pilot
            );
            if (JSON.stringify(updatedAssignedPilots) !== JSON.stringify(bookingData.assignedPilots)) {
              updates.assignedPilots = updatedAssignedPilots;
              needsUpdate = true;
            }
          }

          // Update pilotPayments array
          if (bookingData.pilotPayments && Array.isArray(bookingData.pilotPayments)) {
            const updatedPilotPayments = bookingData.pilotPayments.map((payment: any) =>
              payment.pilotName === oldDisplayName
                ? { ...payment, pilotName: displayName }
                : payment
            );
            if (JSON.stringify(updatedPilotPayments) !== JSON.stringify(bookingData.pilotPayments)) {
              updates.pilotPayments = updatedPilotPayments;
              needsUpdate = true;
            }
          }

          if (needsUpdate) {
            updatePromises.push(updateDoc(doc(db, "bookings", bookingDoc.id), updates));
          }
        });

        await Promise.all(updatePromises);
      }

      setMessage({ type: "success", text: "Profile updated successfully! All your bookings have been updated." });
    } catch (error) {
      console.error("Error saving profile:", error);
      setMessage({ type: "error", text: "Failed to update profile. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-600 dark:text-zinc-400">Loading...</div>
      </div>
    );
  }

  const getRoleBadgeColor = () => {
    switch (role) {
      case "admin":
        return "bg-red-900 text-red-200";
      case "driver":
        return "bg-blue-900 text-blue-200";
      case "agency":
        return "bg-purple-900 text-purple-200";
      case "pilot":
        return "bg-green-900 text-green-200";
      default:
        return "bg-zinc-700 text-zinc-300";
    }
  };

  const getRoleDisplayName = () => {
    return role || "No Access";
  };

  return (
    <div className="max-w-2xl mx-auto p-6 pb-24">
      <div className="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800 p-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Account Settings</h1>

        {/* Role Badge */}
        <div className="mb-6">
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getRoleBadgeColor()}`}>
            {getRoleDisplayName()}
          </span>
        </div>

        <div className="space-y-6">
          {/* Theme Toggle Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-zinc-950 rounded-lg border border-gray-200 dark:border-zinc-800">
              <div className="space-y-1">
                <label htmlFor="theme-toggle" className="text-sm font-medium text-gray-900 dark:text-zinc-200 cursor-pointer">
                  {theme === "light" ? "Light Theme" : "Dark Theme"}
                </label>
                <p className="text-xs text-gray-600 dark:text-zinc-500">
                  Switch between light and dark appearance
                </p>
              </div>
              <Switch
                id="theme-toggle"
                checked={theme === "light"}
                onCheckedChange={(checked) => setTheme(checked ? "light" : "dark")}
              />
            </div>
          </div>

          {/* Install App Section */}
          {!isInstalled && (
            <div className="space-y-2">
              <div className="p-4 bg-gray-50 dark:bg-zinc-950 rounded-lg border border-gray-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-900 dark:text-zinc-200">
                      Install App
                    </label>
                    <p className="text-xs text-gray-600 dark:text-zinc-500">
                      Add to your home screen for quick access
                    </p>
                  </div>
                  {installPrompt && (
                    <Button
                      onClick={handleInstallClick}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Install
                    </Button>
                  )}
                </div>
                {!installPrompt && (
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/50 rounded-lg border border-blue-200 dark:border-blue-900">
                    <p className="text-xs text-blue-800 dark:text-blue-300">
                      {isIOS ? (
                        <><strong>iOS:</strong> Tap the share button <span className="inline-block px-1">⎙</span> at the bottom of Safari, then tap "Add to Home Screen"</>
                      ) : (
                        <><strong>Android:</strong> Tap the menu <span className="inline-block px-1">⋮</span> in Chrome, then tap "Add to Home Screen" or "Install App"</>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Username Section */}
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium text-gray-700 dark:text-zinc-200">
              Username
            </label>
            <Input
              id="username"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your username"
              className="text-gray-900 dark:text-white"
            />
            <p className="text-xs text-gray-600 dark:text-zinc-500">This is the name that will be displayed throughout the app.</p>
          </div>

          {/* Female Pilot Toggle Section - Only show for pilots and admin */}
          {role !== "agency" && role !== "driver" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-zinc-950 rounded-lg border border-gray-200 dark:border-zinc-800">
                <div className="space-y-1">
                  <label htmlFor="female-pilot" className="text-sm font-medium text-gray-900 dark:text-zinc-200 cursor-pointer">
                    Female Pilot
                  </label>
                  <p className="text-xs text-gray-600 dark:text-zinc-500">
                    Enable this if you identify as a female pilot
                  </p>
                </div>
                <Switch
                  id="female-pilot"
                  checked={femalePilot}
                  onCheckedChange={setFemalePilot}
                />
              </div>
            </div>
          )}

          {/* Email (Read-only) */}
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-zinc-200">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={currentUser?.email || ""}
              disabled
              className="text-gray-500 dark:text-zinc-500 cursor-not-allowed"
            />
            <p className="text-xs text-gray-600 dark:text-zinc-500">Your email cannot be changed.</p>
          </div>

          {/* Save Button */}
          <div className="pt-4">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-zinc-200"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>

          {/* Success/Error Message */}
          {message && (
            <div
              className={`p-4 rounded-lg text-sm ${
                message.type === "success"
                  ? "bg-green-950 text-green-200 border border-green-800"
                  : "bg-red-950 text-red-200 border border-red-800"
              }`}
            >
              {message.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

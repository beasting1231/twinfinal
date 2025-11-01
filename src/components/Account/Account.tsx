import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { db } from "../../firebase/config";
import { useAuth } from "../../contexts/AuthContext";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Button } from "../ui/button";
import type { UserProfile } from "../../types/index";

export function Account() {
  const { currentUser } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [femalePilot, setFemalePilot] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
      // Update Firebase Auth display name
      await updateProfile(currentUser, { displayName });

      // Update Firestore user profile
      const profileRef = doc(db, "userProfiles", currentUser.uid);
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

      setMessage({ type: "success", text: "Profile updated successfully!" });
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
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-8">
        <h1 className="text-3xl font-bold text-white mb-8">Account Settings</h1>

        <div className="space-y-6">
          {/* Username Section */}
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium text-zinc-200">
              Username
            </label>
            <Input
              id="username"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your username"
              className="text-white"
            />
            <p className="text-xs text-zinc-500">This is the name that will be displayed throughout the app.</p>
          </div>

          {/* Female Pilot Toggle Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between p-4 bg-zinc-950 rounded-lg border border-zinc-800">
              <div className="space-y-1">
                <label htmlFor="female-pilot" className="text-sm font-medium text-zinc-200 cursor-pointer">
                  Female Pilot
                </label>
                <p className="text-xs text-zinc-500">
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

          {/* Email (Read-only) */}
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-zinc-200">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={currentUser?.email || ""}
              disabled
              className="text-zinc-500 cursor-not-allowed"
            />
            <p className="text-xs text-zinc-500">Your email cannot be changed.</p>
          </div>

          {/* Save Button */}
          <div className="pt-4">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-white text-black hover:bg-zinc-200"
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

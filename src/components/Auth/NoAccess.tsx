import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { db } from "../../firebase/config";
import { useAuth } from "../../contexts/AuthContext";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import type { UserProfile } from "../../types/index";

export function NoAccess() {
  const { logout, currentUser } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load existing profile data
  useEffect(() => {
    async function loadProfile() {
      if (!currentUser) return;

      try {
        const profileRef = doc(db, "userProfiles", currentUser.uid);
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists()) {
          const data = profileSnap.data() as UserProfile;
          setDisplayName(data.displayName || currentUser.displayName || "");
        } else {
          setDisplayName(currentUser.displayName || "");
        }
      } catch (error) {
        console.error("Error loading profile:", error);
        setDisplayName(currentUser.displayName || "");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [currentUser]);

  const handleSave = async () => {
    if (!currentUser) return;
    if (!displayName.trim()) {
      setMessage({ type: "error", text: "Username cannot be empty." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      // Update Firebase Auth display name
      await updateProfile(currentUser, { displayName: displayName.trim() });

      // Update Firestore user profile
      const profileRef = doc(db, "userProfiles", currentUser.uid);
      await setDoc(
        profileRef,
        {
          uid: currentUser.uid,
          displayName: displayName.trim(),
          email: currentUser.email,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      setMessage({ type: "success", text: "Username saved successfully!" });
    } catch (error) {
      console.error("Error saving username:", error);
      setMessage({ type: "error", text: "Failed to save username. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 dark p-4">
      <div className="max-w-md w-full p-8 bg-zinc-900 rounded-lg border border-zinc-800">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-4">Access Pending</h1>
          <p className="text-zinc-400 mb-2">
            Your account has been created successfully, but you don't have access yet.
          </p>
          <p className="text-zinc-400">
            Please contact an administrator to assign you a role.
          </p>
        </div>

        <div className="space-y-6">
          {/* Email Display */}
          <div className="bg-zinc-800 rounded p-4">
            <p className="text-sm text-zinc-500 mb-1">Logged in as:</p>
            <p className="text-white font-medium">{currentUser?.email}</p>
          </div>

          {/* Username Input */}
          {!loading && (
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium text-zinc-200 block">
                Username
              </label>
              <Input
                id="username"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your username"
                className="text-white"
                disabled={saving}
              />
              <p className="text-xs text-zinc-500">
                Set your username while you wait for access.
              </p>
            </div>
          )}

          {/* Save Button */}
          {!loading && (
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-white text-black hover:bg-zinc-200"
            >
              {saving ? "Saving..." : "Save Username"}
            </Button>
          )}

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

          {/* Sign Out Button */}
          <button
            onClick={logout}
            className="w-full px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

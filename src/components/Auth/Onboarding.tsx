import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { db } from "../../firebase/config";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "@/components/ui/button";

export function Onboarding() {
  const { currentUser } = useAuth();
  const [username, setUsername] = useState("");
  const [femalePilot, setFemalePilot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser) return;

    if (!username.trim()) {
      setError("Username is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Update Firebase Auth display name
      await updateProfile(currentUser, { displayName: username.trim() });

      // Update Firestore user profile
      const userDocRef = doc(db, "userProfiles", currentUser.uid);
      await updateDoc(userDocRef, {
        displayName: username.trim(),
        femalePilot: femalePilot,
        onboardingComplete: true,
        updatedAt: new Date().toISOString(),
      });

      console.log("✅ Onboarding completed successfully");

      // Force a page reload to refresh auth state
      window.location.reload();
    } catch (error: any) {
      console.error("❌ Error completing onboarding:", error);
      setError(error.message || "Failed to complete onboarding");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-md p-8 bg-zinc-900 rounded-lg border border-zinc-800">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img
            src="/logo.png"
            alt="Logo"
            className="h-40 w-auto"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>

        <h2 className="text-2xl font-bold text-white mb-2 text-center">
          Welcome!
        </h2>
        <p className="text-zinc-400 text-sm text-center mb-6">
          Please complete your profile to continue
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Username Input */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-zinc-300 mb-2">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your username"
              disabled={loading}
              maxLength={50}
            />
          </div>

          {/* Female Pilot Checkbox */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="femalePilot"
              checked={femalePilot}
              onChange={(e) => setFemalePilot(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <label htmlFor="femalePilot" className="text-sm text-zinc-300">
              I am a female pilot
            </label>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={loading || !username.trim()}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg font-medium transition-colors"
          >
            {loading ? "Saving..." : "Complete Profile"}
          </Button>
        </form>

        <p className="mt-4 text-xs text-zinc-500 text-center">
          Your account will be pending approval by an administrator
        </p>
      </div>
    </div>
  );
}

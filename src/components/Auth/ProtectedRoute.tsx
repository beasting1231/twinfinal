import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Onboarding } from "./Onboarding";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/config";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { currentUser, userRole, loading } = useAuth();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  // Check if user has completed onboarding
  useEffect(() => {
    async function checkOnboarding() {
      if (!currentUser) {
        setCheckingOnboarding(false);
        return;
      }

      try {
        const userDocRef = doc(db, "userProfiles", currentUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          setOnboardingComplete(userData.onboardingComplete ?? true); // Default to true for existing users
        } else {
          setOnboardingComplete(false);
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
        setOnboardingComplete(true); // Fail safe - assume complete
      }

      setCheckingOnboarding(false);
    }

    checkOnboarding();
  }, [currentUser]);

  // Show loading state while checking auth or onboarding
  if (loading || checkingOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-zinc-700 border-t-white rounded-full animate-spin"></div>
          <p className="text-zinc-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Show onboarding if not completed
  if (onboardingComplete === false) {
    return <Onboarding />;
  }

  // Show no access screen if no role (but onboarding complete)
  if (!userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-full max-w-md p-8 bg-zinc-900 rounded-lg border border-zinc-800">
          <h2 className="text-2xl font-bold text-white mb-4 text-center">
            Access Pending
          </h2>
          <p className="text-zinc-400 text-center mb-6">
            Your account is being reviewed. Please check back later or contact an administrator.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import type { UserRole } from "../types";
import { APP_VERSION } from "../version";

type Theme = "light" | "dark";

interface UserProfile {
  displayName: string;
  theme: Theme;
  onboardingComplete: boolean;
  femalePilot?: boolean;
}

interface AuthContextType {
  currentUser: User | null;
  userRole: UserRole;
  userProfile: UserProfile | null;
  loading: boolean;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function signup(email: string, password: string, displayName: string) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    // Update user profile with display name
    if (userCredential.user) {
      await updateProfile(userCredential.user, { displayName });
    }
  }

  async function login(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
      console.log("🔐 Starting Google sign-in with popup...");
      await signInWithPopup(auth, provider);
      console.log("✅ Sign-in successful");
    } catch (error: any) {
      console.error("❌ Sign-in error:", error);
      // Handle popup closed error gracefully
      if (error.code === 'auth/popup-closed-by-user') {
        console.log("Sign-in popup was closed");
      } else if (error.code === 'auth/popup-blocked') {
        console.log("Popup blocked; falling back to redirect sign-in...");
        await signInWithRedirect(auth, provider);
      } else if (error.code === 'auth/unauthorized-domain') {
        console.error("🚨 UNAUTHORIZED DOMAIN - Add this domain to Firebase Console > Authentication > Settings > Authorized domains");
      } else {
        throw error;
      }
    }
  }

  useEffect(() => {
    getRedirectResult(auth).catch((error) => {
      console.error("❌ Redirect sign-in error:", error);
    });
  }, []);

  async function logout() {
    await signOut(auth);
  }

  // Function to fetch and update user profile data
  const fetchUserProfile = async (user: User) => {
    try {
      const userDocRef = doc(db, "userProfiles", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        console.log("✅ User profile loaded:", userData.role);

        // Set all user data at once
        setUserRole(userData.role || null);
        setUserProfile({
          displayName: userData.displayName || user.displayName || user.email?.split('@')[0] || "User",
          theme: (userData.theme === "light" || userData.theme === "dark") ? userData.theme : "dark",
          onboardingComplete: userData.onboardingComplete ?? true,
          femalePilot: userData.femalePilot ?? false,
        });

        // Update app version and last active timestamp (non-blocking)
        // Don't await this - let it happen in background
        setDoc(userDocRef, {
          appVersion: APP_VERSION,
          lastActiveAt: new Date().toISOString(),
        }, { merge: true }).catch(err => {
          console.error('Error updating app version:', err);
        });
      } else {
        console.log("⚠️ No user profile found in Firestore - creating new profile");

        // Default profile values
        const defaultProfile = {
          displayName: user.displayName || user.email?.split('@')[0] || "User",
          theme: "dark" as Theme,
          onboardingComplete: false,
          femalePilot: false,
        };

        // Create a new user profile with default values
        setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
          displayName: defaultProfile.displayName,
          role: null, // Default to no role - admin will need to assign
          femalePilot: defaultProfile.femalePilot,
          onboardingComplete: defaultProfile.onboardingComplete,
          theme: defaultProfile.theme,
          createdAt: new Date().toISOString(),
          appVersion: APP_VERSION,
          lastActiveAt: new Date().toISOString(),
        }).catch(err => {
          console.error('Error creating user profile:', err);
        });

        console.log("✅ User profile created successfully");
        setUserRole(null);
        setUserProfile(defaultProfile);
      }
    } catch (error) {
      console.error("❌ Error fetching user profile:", error);
      setUserRole(null);
      setUserProfile(null);
    }
  };

  // Expose refresh function for updating profile after changes
  const refreshUserProfile = async () => {
    if (currentUser) {
      await fetchUserProfile(currentUser);
    }
  };

  useEffect(() => {
    console.log("🔄 Setting up auth state listener...");
    const authStartTime = performance.now();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log("Auth state changed:", user ? user.email : "No user");
      const authStateTime = performance.now() - authStartTime;
      console.log(`⏱️ Auth state check took ${authStateTime.toFixed(0)}ms`);

      // Keep loading true while we fetch the profile
      setLoading(true);
      setCurrentUser(user);

      // Fetch complete user profile from Firestore
      if (user) {
        const profileStartTime = performance.now();
        await fetchUserProfile(user);
        const profileTime = performance.now() - profileStartTime;
        console.log(`⏱️ User profile fetch took ${profileTime.toFixed(0)}ms`);
      } else {
        setUserRole(null);
        setUserProfile(null);
      }

      setLoading(false);
      const totalTime = performance.now() - authStartTime;
      console.log(`⏱️ Total auth + profile took ${totalTime.toFixed(0)}ms`);
    });

    return () => {
      console.log("🔄 Cleaning up auth state listener");
      unsubscribe();
    };
  }, []);

  const value = {
    currentUser,
    userRole,
    userProfile,
    loading,
    signup,
    login,
    loginWithGoogle,
    logout,
    refreshUserProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

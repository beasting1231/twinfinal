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
  signInWithPopup
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase/config";
import type { UserRole } from "../types";
import { APP_VERSION } from "../version";

interface AuthContextType {
  currentUser: User | null;
  userRole: UserRole;
  loading: boolean;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
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
        console.error("🚨 Popup was blocked - please allow popups for this site");
        alert("Please allow popups for this site and try again.");
      } else if (error.code === 'auth/unauthorized-domain') {
        console.error("🚨 UNAUTHORIZED DOMAIN - Add this domain to Firebase Console > Authentication > Settings > Authorized domains");
      } else {
        throw error;
      }
    }
  }

  async function logout() {
    await signOut(auth);
  }

  useEffect(() => {
    console.log("🔄 Setting up auth state listener...");

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log("Auth state changed:", user ? user.email : "No user");

      // Keep loading true while we fetch the role
      setLoading(true);
      setCurrentUser(user);

      // Fetch user role from Firestore
      if (user) {
        try {
          const userDocRef = doc(db, "userProfiles", user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log("✅ User role found:", userData.role);
            setUserRole(userData.role || null);

            // Update app version and last active timestamp
            await setDoc(userDocRef, {
              appVersion: APP_VERSION,
              lastActiveAt: new Date().toISOString(),
            }, { merge: true });
          } else {
            console.log("⚠️ No user profile found in Firestore - creating new profile");
            // Create a new user profile with default values
            await setDoc(userDocRef, {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || user.email?.split('@')[0] || "User",
              role: null, // Default to no role - admin will need to assign
              femalePilot: false, // Default to false, user can change during onboarding
              onboardingComplete: false, // User needs to complete onboarding
              createdAt: new Date().toISOString(),
              appVersion: APP_VERSION,
              lastActiveAt: new Date().toISOString(),
            });
            console.log("✅ User profile created successfully");
            setUserRole(null);
          }
        } catch (error) {
          console.error("❌ Error fetching user role:", error);
          setUserRole(null);
        }
      } else {
        setUserRole(null);
      }

      setLoading(false);
    });

    return () => {
      console.log("🔄 Cleaning up auth state listener");
      unsubscribe();
    };
  }, []);

  const value = {
    currentUser,
    userRole,
    loading,
    signup,
    login,
    loginWithGoogle,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

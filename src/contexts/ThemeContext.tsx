import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "./AuthContext";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [isInitialized, setIsInitialized] = useState(false);
  const { currentUser } = useAuth();

  // Apply initial theme immediately
  useEffect(() => {
    // Apply dark theme as default on mount
    applyTheme("dark");
  }, []);

  // Load theme from Firestore or localStorage
  useEffect(() => {
    async function loadTheme() {
      let finalTheme: Theme = "dark"; // Default to dark
      console.log("🔍 Loading theme... Current user:", currentUser?.email || "Not logged in");

      if (currentUser) {
        try {
          const profileRef = doc(db, "userProfiles", currentUser.uid);
          const profileSnap = await getDoc(profileRef);

          if (profileSnap.exists()) {
            const data = profileSnap.data();
            const savedTheme = data.theme as Theme | undefined;
            console.log("📱 Theme from Firestore:", savedTheme);
            if (savedTheme === "light" || savedTheme === "dark") {
              finalTheme = savedTheme;
              // Sync localStorage with Firestore to prevent desync issues
              localStorage.setItem("theme", savedTheme);
            }
          }
        } catch (error) {
          console.error("Error loading theme:", error);
          // Fall back to localStorage only on error
          const localTheme = localStorage.getItem("theme") as Theme | null;
          console.log("💾 Theme from localStorage (fallback):", localTheme);
          if (localTheme === "light" || localTheme === "dark") {
            finalTheme = localTheme;
          }
        }
      } else {
        // No user logged in, use localStorage
        const localTheme = localStorage.getItem("theme") as Theme | null;
        console.log("💾 Theme from localStorage:", localTheme);
        if (localTheme === "light" || localTheme === "dark") {
          finalTheme = localTheme;
        }
      }

      console.log("🎯 Final theme to apply:", finalTheme);
      setThemeState(finalTheme);
      applyTheme(finalTheme);
      setIsInitialized(true);
    }

    loadTheme();
  }, [currentUser]);

  const applyTheme = (newTheme: Theme) => {
    const root = document.documentElement;
    console.log("🎨 Applying theme:", newTheme);
    if (newTheme === "dark") {
      root.classList.add("dark");
      console.log("✅ Added 'dark' class to <html>");
    } else {
      root.classList.remove("dark");
      console.log("✅ Removed 'dark' class from <html>");
    }
    console.log("📋 Current classes on <html>:", root.className);
  };

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    localStorage.setItem("theme", newTheme);

    // Save to Firestore if user is logged in
    if (currentUser) {
      try {
        const profileRef = doc(db, "userProfiles", currentUser.uid);
        await setDoc(
          profileRef,
          {
            theme: newTheme,
            updatedAt: new Date(),
          },
          { merge: true }
        );
      } catch (error) {
        console.error("Error saving theme:", error);
      }
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
  };

  const value = {
    theme,
    toggleTheme,
    setTheme,
  };

  // Don't render children until theme is initialized to prevent flash
  if (!isInitialized) {
    return null;
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

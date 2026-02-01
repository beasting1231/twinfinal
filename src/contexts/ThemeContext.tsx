import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { doc, setDoc } from "firebase/firestore";
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
  const { currentUser, userProfile, loading: authLoading } = useAuth();

  // Apply initial theme immediately from localStorage (parallel initialization)
  useEffect(() => {
    const cachedTheme = localStorage.getItem("theme") as Theme | null;
    const initialTheme = (cachedTheme === "light" || cachedTheme === "dark") ? cachedTheme : "dark";
    console.log("🎨 Applying cached theme on mount:", initialTheme);
    setThemeState(initialTheme);
    applyTheme(initialTheme);
  }, []);

  // Sync theme with user profile from AuthContext (no additional Firestore fetch)
  useEffect(() => {
    if (authLoading) return; // Wait for auth to finish loading

    let finalTheme: Theme = "dark";

    if (currentUser && userProfile) {
      // Use theme from user profile (already fetched by AuthContext)
      finalTheme = userProfile.theme;
      console.log("🔄 Syncing theme from user profile:", finalTheme);
      // Sync localStorage with user profile
      localStorage.setItem("theme", finalTheme);
    } else {
      // No user logged in, use localStorage
      const localTheme = localStorage.getItem("theme") as Theme | null;
      console.log("💾 Using theme from localStorage:", localTheme);
      if (localTheme === "light" || localTheme === "dark") {
        finalTheme = localTheme;
      }
    }

    // Only update if theme actually changed
    if (finalTheme !== theme) {
      console.log("🎯 Updating theme to:", finalTheme);
      setThemeState(finalTheme);
      applyTheme(finalTheme);
    }
  }, [currentUser, userProfile, authLoading]);

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

  // No need to block rendering - theme applies immediately via useEffect
  // The dark theme is applied in index.html and synchronized on mount
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

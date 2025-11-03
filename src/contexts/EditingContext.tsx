import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

interface EditingContextType {
  isEditing: boolean;
  startEditing: () => void;
  stopEditing: () => void;
  pendingUpdatesCount: number;
  incrementPendingUpdates: () => void;
  clearPendingUpdates: () => void;
}

const EditingContext = createContext<EditingContextType | undefined>(undefined);

export function useEditing() {
  const context = useContext(EditingContext);
  if (context === undefined) {
    throw new Error("useEditing must be used within an EditingProvider");
  }
  return context;
}

interface EditingProviderProps {
  children: ReactNode;
}

export function EditingProvider({ children }: EditingProviderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [pendingUpdatesCount, setPendingUpdatesCount] = useState(0);

  const startEditing = useCallback(() => {
    console.log("User started editing - pausing real-time updates");
    setIsEditing(true);
  }, []);

  const stopEditing = useCallback(() => {
    console.log("User stopped editing - resuming real-time updates");
    setIsEditing(false);
    setPendingUpdatesCount(0);
  }, []);

  const incrementPendingUpdates = useCallback(() => {
    setPendingUpdatesCount(prev => prev + 1);
  }, []);

  const clearPendingUpdates = useCallback(() => {
    setPendingUpdatesCount(0);
  }, []);

  return (
    <EditingContext.Provider
      value={{
        isEditing,
        startEditing,
        stopEditing,
        pendingUpdatesCount,
        incrementPendingUpdates,
        clearPendingUpdates,
      }}
    >
      {children}
    </EditingContext.Provider>
  );
}

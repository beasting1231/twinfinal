import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

// Firebase configuration using environment variables
// Copy .env.example to .env and fill in your Firebase credentials
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const missingFirebaseEnv = Object.entries({
  VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
  VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
  VITE_FIREBASE_STORAGE_BUCKET: firebaseConfig.storageBucket,
  VITE_FIREBASE_MESSAGING_SENDER_ID: firebaseConfig.messagingSenderId,
  VITE_FIREBASE_APP_ID: firebaseConfig.appId,
})
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingFirebaseEnv.length > 0) {
  throw new Error(
    `Missing Firebase env vars: ${missingFirebaseEnv.join(", ")}. ` +
    "Create .env from .env.example and restart dev server."
  );
}

// Initialize Firebase
const useLocalEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";
if (useLocalEmulators && (!import.meta.env.DEV || firebaseConfig.projectId !== "demo-twin-history" ||
    !["localhost", "127.0.0.1"].includes(window.location.hostname))) {
  throw new Error("Availability testing requires localhost and the demo-twin-history project.");
}

export const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Initialize Firebase Storage
export const storage = getStorage(app);

// Initialize Firebase Functions
export const functions = getFunctions(app, "us-central1");

if (useLocalEmulators) {
  const apiLocal = import.meta.env.VITE_BOOKING_API_LOCAL === "true";
  connectAuthEmulator(auth, apiLocal ? "http://127.0.0.1:9399" : "http://127.0.0.1:9199", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", apiLocal ? 8380 : 8180);
  connectFunctionsEmulator(functions, "127.0.0.1", apiLocal ? 5301 : 5101);
  // Storage is intentionally unavailable in this focused local stack.
  connectStorageEmulator(storage, "127.0.0.1", 9299);
}

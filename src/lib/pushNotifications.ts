import { app, db } from "../firebase/config";
import { doc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

const PUSH_TOKEN_STORAGE_KEY = "twin_push_notification_token";
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

let foregroundListenerInitialized = false;

function isBrowserSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

async function getMessagingModule() {
  const messagingModule = await import("firebase/messaging");
  const supported = await messagingModule.isSupported();

  if (!supported) {
    throw new Error("Push notifications are not supported on this device/browser.");
  }

  return messagingModule;
}

async function getServiceWorkerRegistration() {
  // Register the general app SW (caching, offline) at root scope.
  await navigator.serviceWorker.register("/sw.js");
  // Register the dedicated FCM SW at its own scope so background push events
  // are handled by Firebase's messaging layer. Return this registration for
  // getToken() so FCM binds the push subscription to the right SW.
  return navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    scope: "/firebase-cloud-messaging-push-scope",
  });
}

function getStoredToken() {
  try {
    return localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore localStorage failures.
  }
}

async function getMessagingInstance() {
  if (!isBrowserSupported()) {
    throw new Error("Push notifications are not supported on this device/browser.");
  }

  if (!VAPID_KEY) {
    throw new Error("Missing VITE_FIREBASE_VAPID_KEY.");
  }

  const messagingModule = await getMessagingModule();
  return {
    ...messagingModule,
    messaging: messagingModule.getMessaging(app),
  };
}

export async function initializePushMessaging() {
  if (!isBrowserSupported() || !VAPID_KEY || foregroundListenerInitialized) {
    return;
  }

  try {
    const registration = await getServiceWorkerRegistration();
    const { messaging, onMessage } = await getMessagingInstance();

    onMessage(messaging, (payload) => {
      if (Notification.permission !== "granted") return;

      const title = payload.notification?.title || "Twin Paragliding";
      const body = payload.notification?.body || "New notification";
      const url = payload.fcmOptions?.link || payload.data?.url || "/";

      void registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url },
      });
    });

    foregroundListenerInitialized = true;
  } catch (error) {
    console.error("Error initializing push messaging:", error);
  }
}

export async function enablePushNotifications(userId: string) {
  if (!isBrowserSupported()) {
    throw new Error("Push notifications are not supported on this device/browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const registration = await getServiceWorkerRegistration();
  const { messaging, getToken } = await getMessagingInstance();

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error("Could not get a push notification token.");
  }

  const userRef = doc(db, "userProfiles", userId);
  await setDoc(
    userRef,
    {
      pushNotifications: {
        enabled: true,
        permission,
        updatedAt: new Date().toISOString(),
      },
    },
    { merge: true }
  );
  await updateDoc(userRef, {
    "pushNotifications.tokens": arrayUnion(token),
  });

  storeToken(token);
  return token;
}

export async function disablePushNotifications(userId: string) {
  const userRef = doc(db, "userProfiles", userId);
  const storedToken = getStoredToken();

  if (isBrowserSupported() && VAPID_KEY) {
    try {
      const { messaging, deleteToken } = await getMessagingInstance();
      await deleteToken(messaging);
    } catch (error) {
      console.error("Error deleting push token:", error);
    }
  }

  await setDoc(
    userRef,
    {
      pushNotifications: {
        enabled: false,
        permission: typeof Notification !== "undefined" ? Notification.permission : "default",
        updatedAt: new Date().toISOString(),
      },
    },
    { merge: true }
  );

  if (storedToken) {
    await updateDoc(userRef, {
      "pushNotifications.tokens": arrayRemove(storedToken),
    });
  }

  storeToken(null);
}

export function getPushSupportState() {
  return {
    supported: isBrowserSupported(),
    configured: Boolean(VAPID_KEY),
    permission: typeof Notification !== "undefined" ? Notification.permission : "default",
  };
}

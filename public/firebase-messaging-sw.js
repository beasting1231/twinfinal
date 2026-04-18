importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAWK-LIdsOVV4Kpnxr_pHdaeOO6pU5cFg8',
  authDomain: 'twinscheduler.firebaseapp.com',
  projectId: 'twinscheduler',
  storageBucket: 'twinscheduler.firebasestorage.app',
  messagingSenderId: '302440705715',
  appId: '1:302440705715:web:20c8d09784d1cb88b14ac6',
});

// Initialize so the SDK wires up the push handler. Server sends a `notification`
// payload, which Chrome auto-displays — so we intentionally do NOT re-show in
// onBackgroundMessage to avoid duplicate notifications.
firebase.messaging();

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl =
    event.notification?.data?.FCM_MSG?.notification?.click_action ||
    event.notification?.data?.url ||
    '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

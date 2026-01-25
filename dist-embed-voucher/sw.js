// BUILD_TIMESTAMP: __BUILD_TIME__
const CACHE_NAME = 'twin-scheduler-v3';

self.addEventListener('install', (event) => {
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
  // Don't pre-cache anything - let the fetch handler cache on demand
  event.waitUntil(Promise.resolve());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Don't intercept Firebase API calls, Firestore requests, Cloud Functions, or our API endpoints
  // Let the browser handle them directly
  if (url.hostname.includes('firebaseapp.com') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('cloudfunctions.net') ||
      url.pathname.startsWith('/api/')) {
    return;
  }

  // Use network-first strategy for HTML, JS, and CSS files
  if (event.request.url.includes('.html') ||
      event.request.url.includes('.js') ||
      event.request.url.includes('.css') ||
      event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone the response before caching
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // If network fails, try cache as fallback
          return caches.match(event.request);
        })
    );
    return;
  }

  // Use cache-first strategy for static assets (images, icons, etc.)
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          // Cache the fetched resource for future use
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
  );
});

self.addEventListener('activate', (event) => {
  // Take control of all pages immediately
  event.waitUntil(clients.claim());

  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

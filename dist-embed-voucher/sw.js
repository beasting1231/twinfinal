// BUILD_TIMESTAMP: __BUILD_TIME__
const CACHE_NAME = 'twin-scheduler-v3';

function canHandleRequest(requestUrl, method) {
  if (method !== 'GET') return false;
  const url = new URL(requestUrl);
  // Cache API only supports HTTP(S). Skip extension/browser internal schemes.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('cloudfunctions.net') ||
    url.pathname.startsWith('/api/')
  ) {
    return false;
  }
  return true;
}

async function safeCachePut(request, response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response);
  } catch (_err) {
    // Ignore cache write failures to avoid breaking runtime requests.
  }
}

self.addEventListener('install', (event) => {
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
  // Don't pre-cache anything - let the fetch handler cache on demand
  event.waitUntil(Promise.resolve());
});

self.addEventListener('fetch', (event) => {
  if (!canHandleRequest(event.request.url, event.request.method)) {
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
          void safeCachePut(event.request, responseToCache);
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
          void safeCachePut(event.request, responseToCache);
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

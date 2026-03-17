// Somma Portal - Service Worker
// Provides offline support and caching for the Owner Portal PWA

const CACHE_VERSION = 'somma-portal-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Static assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/offline.html',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/manifest.json',
];

// Install event: pre-cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  // Activate immediately without waiting for existing clients to close
  self.skipWaiting();
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            // Delete caches that don't match current version
            return (name.startsWith('soma-portal-') || name.startsWith('somma-portal-')) && name !== STATIC_CACHE && name !== DYNAMIC_CACHE;
          })
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event: handle requests with appropriate caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // API calls: Network-first strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Portal navigation: Network-first with offline fallback
  if (url.pathname.startsWith('/portal') && request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // Static assets (JS, CSS, images, fonts): Cache-first strategy
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else: Network-first
  event.respondWith(networkFirst(request));
});

// Check if a path is a static asset
function isStaticAsset(pathname) {
  return /\.(js|css|svg|png|jpg|jpeg|webp|gif|ico|woff|woff2|ttf|eot)$/i.test(pathname) ||
    pathname.startsWith('/_next/static/');
}

// Cache-first strategy: serve from cache, fall back to network
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // If both cache and network fail, return a basic error
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Network-first strategy: try network, fall back to cache
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Network-first with offline HTML fallback for navigation requests
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    // Serve the offline fallback page
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) {
      return offlinePage;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

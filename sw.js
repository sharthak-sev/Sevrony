const CACHE_NAME = "sat-practice-cache-v2.1.2";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./styles.css?v=2.1.2",
  "./tailwind.css?v=2.1.2",
  "./app.js?v=2.1.2",
  "./db.js?v=2.1.2",
  "./sync.js?v=2.1.2",
  "./vocab.js?v=2.1.2",
  "./logo.svg"
];

// Install Event
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Force bypass HTTP cache during install by appending a dynamic timestamp
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => {
          const cacheBustedUrl = url.includes('?') 
            ? `${url}&cb=${Date.now()}` 
            : `${url}?cb=${Date.now()}`;
          return fetch(new Request(cacheBustedUrl, { cache: 'no-cache' }))
            .then(response => {
              if (!response.ok) throw new Error("Network response was not ok for " + url);
              return cache.put(url, response);
            });
        })
      );
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch Event (Network-first with Cache fallback)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === location.origin;

  event.respondWith(
    // For same-origin requests, bypass the browser's HTTP cache to ensure we get the latest
    fetch(event.request, isSameOrigin ? { cache: 'no-cache' } : {})
      .then((response) => {
        // Only cache valid HTTP responses
        if (response && response.status === 200 && response.type === "basic") {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, resClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails (offline mode)
        return caches.match(event.request);
      })
  );
});

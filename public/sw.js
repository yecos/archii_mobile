const CACHE_NAME = 'archii-v6';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-384.png'
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Don't fail install if some assets can't be cached
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip Firebase, Google Auth, and API calls (real-time data)
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('googleusercontent.com') ||
    url.hostname.includes('microsoft.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('live.com') ||
    url.hostname.includes('msauth.net') ||
    url.hostname.includes('msftauth.net')
  ) {
    return;
  }

  // Skip Chrome extension requests
  if (url.protocol === 'chrome-extension:') return;

  // For navigation requests, ALWAYS try network first (never serve cached HTML)
  // This ensures Firebase config scripts are always up to date
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('/');
          });
        })
    );
    return;
  }

  // For static assets (images, fonts, scripts), stale-while-revalidate
  if (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.gif') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.ico')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request)
            .then((response) => {
              if (response.status === 200) {
                cache.put(event.request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // Default: network first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || caches.match('/');
        });
      })
  );
});

// Push notification handler
self.addEventListener('push', (event) => {
  let data = { title: 'Archii', body: 'Nueva notificación', icon: '/icon-192.png' };
  if (event.data) {
    try { data = { ...data, ...event.data.json() }; } catch (e) { data.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      data: data.data || {},
      vibrate: [200, 100, 200],
    })
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) {
        const client = clients.sort((a, b) => {
          if (a.focused) return -1;
          if (b.focused) return 1;
          return (a.visibilityState === 'visible' ? -1 : 1);
        })[0];
        client.focus();
        if (event.notification.data?.screen) {
          client.postMessage({ type: 'NAVIGATE', screen: event.notification.data.screen, itemId: event.notification.data.itemId });
        }
      } else {
        self.clients.openWindow('/');
      }
    })
  );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('Cache cleared');
    });
  }
  if (event.data && event.data.type === 'NAVIGATE') {
    // Forward navigation messages to the app
    self.clients.matchAll({ type: 'window' }).then(clients => {
      clients.forEach(client => client.postMessage(event.data));
    });
  }
});

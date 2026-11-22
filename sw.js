// Despentsa · service worker
// Estrategia: la app se abre siempre con la última versión si hay conexión (red primero)
// y, si no la hay, desde la copia guardada. Así las actualizaciones nunca se quedan "atascadas".
const CACHE = 'despentsa-v1';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(req, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const fallback = () => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'));
    const timer = setTimeout(() => {
      fallback().then((r) => { if (r && !settled) { settled = true; resolve(r); } });
    }, timeoutMs);
    fetch(req)
      .then((res) => {
        clearTimeout(timer);
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        if (!settled) { settled = true; resolve(res); }
      })
      .catch(() => {
        clearTimeout(timer);
        fallback().then((r) => { if (!settled) { settled = true; resolve(r || Response.error()); } });
      });
  });
}

function cacheFirst(req) {
  return caches.match(req).then((hit) => {
    if (hit) return hit;
    return fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fuentes y SDK de Firebase: se guardan la primera vez para poder abrir la app sin conexión
  if (/(^|\.)gstatic\.com$/.test(url.hostname) || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(cacheFirst(req));
    return;
  }
  // Todo lo que no sea nuestro (Firestore, etc.) pasa directo
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, 3500));
    return;
  }
  e.respondWith(networkFirst(req, 2500));
});

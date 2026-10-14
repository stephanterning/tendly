/* global self, caches, fetch, URL */
const CACHE = 'tendly-static-v1';
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/offline.html', '/icon.svg']))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('tendly-static-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never cache sessions, task data, files or mutations. Offline editing is deliberately unsupported.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') { event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html'))); return; }
  if (url.pathname.startsWith('/assets/')) event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request); if (cached) return cached;
    const response = await fetch(event.request); if (response.ok) await cache.put(event.request, response.clone()); return response;
  }));
});

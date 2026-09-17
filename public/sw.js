/* Offline shell for the installed app.
   Network-first so parents never see stale event information when they are
   online; the cache is a fallback for a phone in a school gym with no signal. */
const CACHE = 'd44-hub-v1';
const SHELL = ['', 'calendar', 'resources', 'schools', 'settings', 'about']
  .map((p) => new URL(p, self.registration.scope).pathname);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match(SHELL[0]))),
  );
});

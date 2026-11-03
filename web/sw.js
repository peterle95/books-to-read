const CACHE = 'reading-plan-__VERSION__';
const ASSETS = ['./', './index.html', './style.css', './schedule.js', './projection.js', './quarter.js', './bundle-validator.js', './bundle-export.js', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('reading-plan-') && key !== CACHE).map((key) => caches.delete(key))
  )));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

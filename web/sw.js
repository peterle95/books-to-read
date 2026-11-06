const CACHE = 'reading-plan-__VERSION__-android-calendar-v1';
const ASSETS = ['./', './index.html', './style.css', './android-native.css', './android-calendar.css', './assets/android/Roboto-Regular.woff2', './assets/android/ic-menu-manage-api35-xxhdpi.png', './assets/android/LICENSE-Apache-2.0.txt', './assets/android/THIRD-PARTY-NOTICES.md', './schedule.js', './projection.js', './quarter.js', './bundle-validator.js', './bundle-export.js', './history.js', './android-controls.js', './android-calendar.js', './app.js', './editor.js', './csv.js', './charts.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('reading-plan-') && key !== CACHE).map((key) => caches.delete(key))
    )),
    self.clients.claim(),
  ]));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

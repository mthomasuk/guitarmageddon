// Offline support: serve the app shell from cache, refresh it in the background.
const CACHE = 'guitarmageddon-v6';
const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'css/manuscript.css',
  'fonts/unifraktur-maguntia.woff2',
  'fonts/im-fell-english.woff2',
  'fonts/im-fell-english-italic.woff2',
  'fonts/im-fell-english-sc.woff2',
  'fonts/cinzel-numerals.woff2',
  'ornaments/vellum.svg',
  'ornaments/vine.svg',
  'ornaments/corner.svg',
  'ornaments/snail.svg',
  'audio/silence.wav',
  'js/app.js',
  'js/audio.js',
  'js/chords.js',
  'js/editor.js',
  'js/glyphs.js',
  'js/model.js',
  'js/pdf.js',
  'js/storage.js',
  'js/tabtext.js',
  'js/tunings.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

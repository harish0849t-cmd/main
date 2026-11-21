// Service worker — lets the app open and work with no signal.
// App files: network first (so updates arrive), cache as fallback. Firebase library files: cached after first load.
const V = 'aquafarm-v3';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'db.js', 'ctx.js', 'util.js', 'calc.js', 'ops.js', 'panchang.js', 'views-farm.js', 'views-money.js', 'sheets-config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {   // (the Google Sheet script is on another host, so it is never cached here)
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(V).then((x) => x.put(req, c)); return r; }).catch(() => caches.match(req).then((m) => m || caches.match('index.html'))));
  } else if (url.hostname === 'www.gstatic.com') {
    e.respondWith(caches.match(req).then((m) => m || fetch(req).then((r) => { const c = r.clone(); caches.open(V).then((x) => x.put(req, c)); return r; })));
  }
});

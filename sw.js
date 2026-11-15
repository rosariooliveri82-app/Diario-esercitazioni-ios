// Service worker: l'app funziona anche senza rete (cache dei file dell'applicazione).
const VER = 'diario-1.1.0';
const FILES = ['./', './index.html', './app.js', './listino.js', './manifest.webmanifest', './icone/icona-192.png', './icone/icona-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VER).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VER).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('./index.html'))));
});

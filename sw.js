// Guarda la app en el teléfono para que abra rápido. Los datos siempre vienen de internet.
const VERSION = 'dhrutas-v1';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'lib.js', 'state.js', 'ruta.js', 'gastos.js', 'gestion.js', 'finanzas.js', 'admin.js', 'config.js', 'supabase.js', 'manifest.webmanifest', 'icon-192.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // nunca guardar datos de Supabase
  // Primero internet (para que las actualizaciones lleguen), y si no hay, lo guardado
  e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })
    .catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
});

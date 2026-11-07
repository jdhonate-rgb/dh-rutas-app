// Guarda la app en el teléfono para que abra rápido. Los datos siempre vienen de internet.
const VERSION = 'dhrutas-v11';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/lib.js', 'js/state.js', 'js/ruta.js', 'js/gastos.js', 'js/gestion.js', 'js/finanzas.js', 'js/admin.js', 'js/reportes.js', 'js/xlsx.js', 'js/config.js', 'vendor/supabase.js', 'manifest.webmanifest', 'icons/icon-192.png'];

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

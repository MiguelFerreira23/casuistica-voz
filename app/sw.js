// Funciona sem rede: guarda a app e as bibliotecas (os modelos de voz ficam na cache do transformers.js).
const VERSION = 'v7';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/schema.js', 'js/parser.js', 'js/numbers.js', 'js/xlsx.js', 'js/stt.js', 'js/stt-worker.js', 'js/store.js', 'js/gsheets.js', 'js/profiles.js', 'js/ui.js', 'js/xlsx-comments.js', 'template.xlsx', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open('shell-' + VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== 'shell-' + VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    // rede primeiro (para receber logo as atualizações); sem rede, usa a cópia guardada
    e.respondWith(caches.open('shell-' + VERSION).then(async (c) => {
      try {
        const r = await fetch(e.request);
        if (r.ok) c.put(e.request, r.clone());
        return r;
      } catch {
        return (await c.match(e.request, { ignoreSearch: true })) || Response.error();
      }
    }));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open('cdn').then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }));
  }
});

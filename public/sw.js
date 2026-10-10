/* RHC City service worker: app-shell caching for fast start; API calls always go to the network. */
const CACHE = 'rhc-shell-v4';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/icons/icon-192.png', '/icons/icon-512.png', '/favicon.ico']).catch(() => {}))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })));
    return;
  }
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => new Response('<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:system-ui;background:#0d1b2e;color:#fff;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>RHC City is offline</h2><p style="color:#aebcd2">Check your connection to the RHC server and try again.</p><button onclick="location.reload()" style="padding:10px 18px;border-radius:9px;border:0;background:#c8a45c;font-weight:700">Retry</button></div>', { headers: { 'content-type': 'text/html' } })));
  }
});
self.addEventListener('notificationclick', (e) => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs[0] ? cs[0].focus() : self.clients.openWindow('/'))); });

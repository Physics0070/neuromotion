// Offline support. Scripts, the pose model and fonts are cache-first (they are versioned or immutable);
// pages are network-first so a new release is picked up, with the cached copy as the fallback.
const CACHE = 'cc-__BUILD__'
const PAGES = ['/', '/coach/', '/progress/', '/legal/', '/review/', '/validate/', '/login/', '/manifest.webmanifest']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PAGES)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('message', (e) => {
  const urls = (e.data && e.data.cache) || []
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(urls.filter((u) => new URL(u).origin === location.origin).map((u) => c.add(u).catch(() => {})))))
})

const keep = (c, req, res) => { if (res.ok && res.status === 200) c.put(req, res.clone()); return res }

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return // never cache anything about who is signed in
  const versioned = /^\/(assets|models|mediapipe)\//.test(url.pathname)
  e.respondWith(caches.open(CACHE).then(async (c) => {
    if (versioned) return (await c.match(req)) || keep(c, req, await fetch(req))
    try { return keep(c, req, await fetch(req)) } catch (err) {
      const hit = await c.match(req)
      if (hit) return hit
      throw err
    }
  }))
})

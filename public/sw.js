const CACHE = 'fe-gym-shell-v1'
const SHELL = ['/', '/manifest.webmanifest']
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => undefined)))
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))))
self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  // Authenticated APIs and all non-GET traffic are strictly network-only.
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/exercises/')) {
    event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => { if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone())); return response })))
  }
})

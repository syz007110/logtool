const STATIC_CACHE_NAME = 'logtool-static-v1'
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/favicon.ico']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => null)
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== STATIC_CACHE_NAME).map((key) => caches.delete(key)))
      )
      .catch(() => null)
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method === 'GET' && request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE_NAME)
        return cache.match('/index.html')
      })
    )
  } else if (request.method === 'GET' && url.origin === self.location.origin) {
    if (STATIC_ASSETS.includes(url.pathname)) {
      event.respondWith(cacheFirst(request))
    } else if (isAppShellAsset(url)) {
      event.respondWith(cacheFirstAndUpdate(request))
    }
  }
})

async function cacheFirst (request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  const cache = await caches.open(STATIC_CACHE_NAME)
  cache.put(request, response.clone())
  return response
}

async function cacheFirstAndUpdate (request) {
  const cache = await caches.open(STATIC_CACHE_NAME)
  const cached = await cache.match(request)
  try {
    const networkResponse = await fetch(request)
    cache.put(request, networkResponse.clone())
    return networkResponse
  } catch (error) {
    if (cached) return cached
    throw error
  }
}
function isAppShellAsset (url) {
  if (url.origin !== self.location.origin) return false
  return (
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/img/') ||
    url.pathname.startsWith('/fonts/') ||
    /\.((js|css|png|jpg|jpeg|gif|svg|webp|woff2?|ttf))$/i.test(url.pathname)
  )
}

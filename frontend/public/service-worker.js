/* eslint-disable no-restricted-globals */
// __APP_VERSION__ is replaced at build time from repo VERSION via vue.config.js
const APP_VERSION = '__APP_VERSION__'
const STATIC_CACHE_NAME = `logtool-static-${APP_VERSION}`

function scopedUrl (relativePath) {
  return new URL(relativePath, self.registration.scope).href
}

function precacheUrls () {
  return [
    scopedUrl('./'),
    scopedUrl('./index.html'),
    scopedUrl('./manifest.json'),
    scopedUrl('./favicon.ico')
  ]
}

function isHtmlShellRequest (request, url) {
  if (request.mode === 'navigate') return true
  const path = url.pathname
  return path.endsWith('/') || path.endsWith('/index.html')
}

function isAppShellAsset (url) {
  if (url.origin !== self.location.origin) return false
  const path = url.pathname
  return (
    /\/(js|css|img|fonts)\//.test(path) ||
    /\.(?:js|css|png|jpg|jpeg|gif|svg|webp|woff2?|ttf)$/i.test(path)
  )
}

async function networkFirst (request, fallbackUrls = []) {
  const cache = await caches.open(STATIC_CACHE_NAME)
  try {
    const networkResponse = await fetch(request)
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone())
      return networkResponse
    }
  } catch (_) {
    // fall through to cache
  }

  const cached = await cache.match(request)
  if (cached) return cached

  for (const fallback of fallbackUrls) {
    const hit = await cache.match(fallback)
    if (hit) return hit
  }

  return Response.error()
}

async function networkFirstAsset (request) {
  const cache = await caches.open(STATIC_CACHE_NAME)
  try {
    const networkResponse = await fetch(request)
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone())
      return networkResponse
    }
  } catch (_) {
    // fall through to cache
  }
  const cached = await cache.match(request)
  if (cached) return cached
  throw new Error('asset unavailable')
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => cache.addAll(precacheUrls()))
      .catch(() => null)
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
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (isHtmlShellRequest(request, url)) {
    event.respondWith(networkFirst(request, precacheUrls()))
    return
  }

  if (isAppShellAsset(url)) {
    event.respondWith(networkFirstAsset(request))
  }
})

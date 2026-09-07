// Service worker ThéCol : network-first pour les documents HTML, cache-first pour le statique et les CDN épinglés, réseau seul pour les API Firestore.

const CACHE_NAME = 'thecol-static-v8.7';
const APP_SHELL = ['./', './index.html', './app.js?v=8.7', './styles.css?v=2.8', './manifest.webmanifest'];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];
const STATIC_REGEX = /\.(js|css|png|ico|svg|webmanifest|xlsx)(\?.*)?$/;
const HTML_PATH_REGEX = /\/$|\.html$/;

const isCdnRequest = (url) => CDN_HOSTS.includes(url.hostname);

const cacheFirst = async (request) => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
};

const networkFirst = async (request) => {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch (error) {
        const cached = await cache.match(request) || await cache.match(new URL('./index.html', self.registration.scope));
        return cached || Response.error();
    }
};

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(APP_SHELL.map(async (entry) => {
            try {
                const url = new URL(entry, self.registration.scope);
                const response = await fetch(url);
                if (response.ok) await cache.put(url, response);
            } catch (error) {
                console.error('Pré-cache impossible:', entry, error);
            }
        }));
    })());
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
        if (isCdnRequest(url)) event.respondWith(cacheFirst(request));
        return;
    }
    if (request.mode === 'navigate' || HTML_PATH_REGEX.test(url.pathname)) {
        event.respondWith(networkFirst(request));
    } else if (STATIC_REGEX.test(url.pathname)) {
        event.respondWith(cacheFirst(request));
    }
});

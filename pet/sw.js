'use strict';

const CACHE = 'kali-little-dog-v3';
// Resolve relative to the worker so hosting under a GitHub Pages subpath works.
const ASSETS = ['./', './index.html', './pet.css?v=3', './pet.js?v=3', './puppy-world.bundle.js?v=3', './manifest.webmanifest', './icon-192.png', './icon-512.png', './puppy-awake.png', './puppy-asleep.png', '../styles.css?v=3', '../assets/paw.svg'].map((url) => new URL(url, self.location.href).href);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('kali-little-dog-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const home = new URL('./', self.location.href).href;
      try {
        const response = await fetch(event.request, { cache: 'no-cache' });
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(home, response.clone());
        }
        return response;
      } catch { return (await caches.match(home)) || Response.error(); }
    })());
    return;
  }
  if (!ASSETS.includes(event.request.url)) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

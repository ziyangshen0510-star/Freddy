'use strict';

const CACHE = 'kali-little-dog-v2';
// Resolve relative to the worker so hosting under a GitHub Pages subpath works.
const ASSETS = ['./', './index.html', './pet.css?v=2', './pet.js?v=2', './manifest.webmanifest', './icon-192.png', './icon-512.png', './puppy-awake.png', './puppy-asleep.png', '../styles.css', '../assets/paw.svg'].map((url) => new URL(url, self.location.href).href);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('kali-little-dog-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL('./', self.location.href).href)));
    return;
  }
  if (!ASSETS.includes(event.request.url)) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

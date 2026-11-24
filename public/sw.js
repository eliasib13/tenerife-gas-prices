'use strict';

const CACHE = 'tgp-shell-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg'];

function abs(path) {
  return new URL(path, self.registration.scope).href;
}

function assetUrls(html) {
  const found = new Set();
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    let u;
    try {
      u = new URL(m[1], self.registration.scope);
    } catch (e) {
      continue;
    }
    if (u.origin !== self.location.origin) continue;
    const base = new URL('./assets/', self.registration.scope).pathname;
    if (u.pathname.startsWith(base) || u.pathname.startsWith('/assets/')) found.add(u.href);
  }
  return Array.from(found);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(SHELL.map(abs)).then(() =>
          cache.match(abs('./index.html')).then((res) => (res ? res.text() : '')).then((html) => {
            const urls = assetUrls(html);
            return urls.length ? cache.addAll(urls) : undefined;
          }),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith('tgp-shell-') && n !== CACHE)
            .map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(abs('./index.html'), copy));
          }
          return res;
        })
        .catch(() => caches.open(CACHE).then((cache) => cache.match(abs('./index.html')))),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request, { ignoreVary: true }).then((hit) => {
        if (hit) return hit;
        return fetch(request).then((res) => {
          if (res && res.ok) cache.put(request, res.clone());
          return res;
        });
      }),
    ),
  );
});

// Keeps the app working with no signal, e.g. reading a sign in Japan without data.
// Every file still comes fresh from the network when it can, so releases show up as
// before; the last good copy is used only when the network fails or stalls.
// Copies are kept by path without the ?v= release tag, so each path holds its newest copy.
const CACHE = 'jp-trainer';
const STALL_MS = 4000;
// The dictionary and the handwriting kanji are fetched up front, so they work
// offline even if they've never been opened.
const AHEAD = ['./', 'version.json', 'data/dict.json', 'data/write.json'];

const keyOf = (url) => {
  const u = new URL(url);
  return u.origin + u.pathname;
};

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((cache) => Promise.all(AHEAD.map(async (p) => {
    const url = new URL(p, self.registration.scope).href;
    if (await cache.match(keyOf(url))) return;
    const res = await fetch(url).catch(() => null);
    if (res?.ok) await cache.put(keyOf(url), res);
  }))));
});

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function fresh(req) {
  const cache = await caches.open(CACHE);
  const key = keyOf(req.url);
  const net = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') cache.put(key, res.clone()).catch(() => {});
    return res;
  });
  try {
    const first = await Promise.race([net, new Promise((r) => { setTimeout(r, STALL_MS); })]);
    if (first) return first;
  } catch {
    return (await cache.match(key)) || Response.error();
  }
  // A slow network: use the copy if there is one, otherwise keep waiting.
  return (await cache.match(key)) || net;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Audio streams in ranges and lives in its own repo; the build tools are for the PC.
  if (req.method !== 'GET' || url.origin !== location.origin || req.headers.has('range')
    || /\.(m4a|mp3)$/.test(url.pathname) || url.pathname.includes('/tools/')) return;
  e.respondWith(fresh(req));
});

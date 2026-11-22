// Çevrimdışı çalışma: önce internetten ister, başarılı yanıtı saklar; bağlantı yoksa saklanan kopyayı verir.
// Böylece mağaza içinde internet çekmese de uygulama ve alışveriş listesi açılır. Fiyatlar her zaman
// önce internetten istendiği için bağlantı varken eski veri gösterilmez.
const CACHE = "mf-v1";
const CDN = ["cdn.tailwindcss.com", "unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  const own = url.origin === self.location.origin;
  if (!own && !CDN.includes(url.hostname)) return; // ürün görselleri vb. saklanmaz
  e.respondWith(fetch(req).then(res => {
    if (res && (res.ok || res.type === "opaque")) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: own }).then(hit => hit || Response.error())));
});

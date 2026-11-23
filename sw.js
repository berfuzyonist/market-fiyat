// Çevrimdışı çalışma ve hızlı açılış.
// - Sürüm etiketli dosyalar (css/js "?v=<özet>") ve yazı tipleri değişmez: önce önbellekten verilir.
// - Sayfa ve veri dosyaları önce internetten istenir, başarılı yanıt saklanır; bağlantı yoksa saklanan
//   kopya verilir. Böylece bağlantı varken eski fiyat gösterilmez, mağazada internet yoksa liste yine açılır.
const CACHE = "mf-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

const put = (req, res) => { if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)).catch(() => {}); } return res; };

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // ürün görselleri vb. saklanmaz
  const immutable = url.searchParams.has("v") || url.pathname.includes("/fonts/");
  if (immutable) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => put(req, res))));
    return;
  }
  e.respondWith(fetch(req).then(res => put(req, res))
    .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || Response.error())));
});

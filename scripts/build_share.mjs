// Paylaşım önizlemeleri: WhatsApp, Telegram vb. bir bağlantının önizlemesini sayfanın HTML'indeki
// og:title / og:image etiketlerinden çıkarır (JavaScript çalıştırmaz). Uygulama tek sayfa olduğu için
// her paylaşılabilir ürün ve afiş için küçük bir sayfa üretilir:
//   urun/<market>/<kod>.html  → ürün adı + ürün görseli
//   afis/<kimlik>.html        → kampanya adı + afiş görseli
// Sayfa açılınca uygulamadaki ürüne/afişe yönlendirir. Fiyat yazılmaz (önizleme önbellekte kalır,
// eski fiyatı doğruymuş gibi göstermemek için). Dosya yalnızca içeriği değişince yazılır.
// GitHub Pages ".../urun/sok/4934" adresinde "urun/sok/4934.html" dosyasını sunar.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const C = require("../js/core.js");
const SITE = "https://berfuzyonist.github.io/market-fiyat/";
const MARKETS = ["migros", "sok", "bim"], POSTERS = ["bim", "migros", "sok", "a101", "koop"];
const NAMES = { migros: "Migros", sok: "Şok", bim: "BİM", a101: "A101", koop: "Tarım Kredi" };
const load = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
// Önizleme servisleri webp'yi her zaman göstermez; Şok'un görsel servisinden büyük jpeg istenir
const ogImage = (u) => String(u || "").replace(/\/cdn-cgi\/image\/[^/]*\//, "/cdn-cgi/image/width=600,height=600,fit=pad,quality=85,format=jpeg/");
const paused = (load("config.json") || {}).paused_markets || [];

// Küçük tutulur (~23 bin dosya): yalnızca önizlemenin okuduğu etiketler + yönlendirme
function page({ title, desc, image, url, hash, type }) {
  const t = esc(title), to = JSON.stringify(SITE + hash);
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${t}</title>` +
    `<meta property="og:site_name" content="marketfiyat"><meta property="og:type" content="${type}"><meta property="og:title" content="${t}">` +
    `<meta property="og:description" content="${esc(desc)}">${image ? `<meta property="og:image" content="${esc(image)}">` : ""}` +
    `<meta property="og:url" content="${esc(url)}"><meta name="twitter:card" content="summary_large_image">` +
    `<script>location.replace(${to})</script></head><body><a href="${esc(SITE + hash)}">${t}</a></body></html>\n`;
}

let wrote = 0, kept = 0;
const seen = new Set();
const put = (path, html) => {
  seen.add(path);
  if (existsSync(path) && readFileSync(path, "utf8") === html) { kept++; return; }
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, html); wrote++;
};

for (const m of MARKETS) {
  if (paused.includes(m)) continue;
  const rows = C.rowsOf(load(`data/${m}.json`) || {});
  for (const o of rows) {
    const code = o.id.slice(o.id.indexOf(":") + 1);
    if (safe(code) !== code) continue;
    put(`urun/${m}/${code}.html`, page({
      title: o.name, type: "product", image: o.image ? ogImage(o.image) : "",
      desc: `${NAMES[m]} ve diğer marketlerdeki fiyatını marketfiyat'ta karşılaştır.`,
      url: `${SITE}urun/${m}/${code}`, hash: `#urun/${encodeURIComponent(o.id)}`,
    }));
  }
}
for (const m of POSTERS) {
  if (paused.includes(m)) continue;
  const d = load(`data/posters-${m}.json`);
  for (const it of (d && Array.isArray(d.items) ? d.items : [])) {
    if (!it || !it.id || !/^https:\/\//.test(it.image || "")) continue;
    const f = safe(it.id);
    put(`afis/${f}.html`, page({
      title: `${NAMES[m] || m}: ${it.title || "Kampanya"}`, type: "website", image: ogImage(it.image),
      desc: [it.label, "Kampanya ürünleri ve fiyatları marketfiyat'ta."].filter(Boolean).join(" · "),
      url: `${SITE}afis/${f}`, hash: `#afis/${encodeURIComponent(it.id)}`,
    }));
  }
}
// Artık olmayan ürün/afişin sayfası silinir (bağlantı yine 404.html ile uygulamaya gider)
let removed = 0;
const sweep = (dir) => {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) sweep(p);
    else if (e.name.endsWith(".html") && !seen.has(p)) { unlinkSync(p); removed++; }
  }
};
sweep("urun"); sweep("afis");
console.log(`paylaşım sayfaları: ${seen.size} (yeni/değişen ${wrote}, aynı ${kept}, silinen ${removed})`);

// Paylaşım önizlemeleri: WhatsApp, Telegram vb. bir bağlantının önizlemesini sayfanın HTML'indeki
// og:title / og:image etiketlerinden çıkarır (JavaScript çalıştırmaz). Uygulama tek sayfa olduğu için
// her paylaşılabilir ürün ve afiş için küçük bir sayfa üretilir:
//   urun/<market>/<ad>.html   → ürün adı + ürün görseli    (ör. urun/migros/pinar-tam-yagli-sut-1-l)
//   afis/<market>/<ad>.html   → kampanya adı + afiş görseli (ör. afis/migros/barlarda-ayni-urunde-2-al-1-ode)
// Adres ürün/kampanya adından okunur biçimde üretilir; aynı ad iki kez denk gelirse -2, -3 eklenir.
// Bir kez verilen adres değişmez (data/slugs.json: paylaşılmış bağlantılar hep aynı ürünü açar).
// Uygulama paylaşırken adresi data/client/slugs-*.json'dan okur.
// Sayfa açılınca uygulamadaki ürüne/afişe yönlendirir. Fiyat yazılmaz (önizleme önbellekte kalır,
// eski fiyatı doğruymuş gibi göstermemek için). Dosya yalnızca içeriği değişince yazılır.
// GitHub Pages ".../urun/sok/4934" adresinde "urun/sok/4934.html" dosyasını sunar.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, rmdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const C = require("../js/core.js");
const SITE = "https://berfuzyonist.github.io/market-fiyat/";
const MARKETS = ["migros", "sok", "bim"], POSTERS = ["bim", "migros", "sok", "a101", "koop"];
const NAMES = { migros: "Migros", sok: "Şok", bim: "BİM", a101: "A101", koop: "Tarım Kredi" };
const load = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

// Okunur adres parçası: Türkçe harfler sadeleşir, harf/rakam dışı tire olur, en çok 70 karakter (sözcük sınırında)
const TR = { ç: "c", ğ: "g", ı: "i", i̇: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
function slugify(t) {
  let s = String(t || "").toLocaleLowerCase("tr").replace(/[çğıöşüâîû]/g, (c) => TR[c] || c).normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/%/g, " yuzde ").replace(/&/g, " ve ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > 70) s = s.slice(0, 71).replace(/-[^-]*$/, "");
  return s || "urun";
}
// Kalıcı adres kayıtları: { urun: { "migros:01010084": "pinar-sut-1-l" }, afis: { "migros:barlarda-…": "barlarda-…" } }
const REG = load("data/slugs.json") || { urun: {}, afis: {} };
const taken = { urun: {}, afis: {} };
for (const kind of ["urun", "afis"]) for (const [id, sl] of Object.entries(REG[kind])) taken[kind][id.split(":")[0] + "/" + sl] = id;
function slugOf(kind, id, text) {
  if (REG[kind][id]) return REG[kind][id];
  const m = id.split(":")[0], base = slugify(text);
  let sl = base;
  for (let n = 2; taken[kind][m + "/" + sl]; n++) sl = `${base}-${n}`;
  REG[kind][id] = sl; taken[kind][m + "/" + sl] = id;
  return sl;
}

let wrote = 0, kept = 0;
const seen = new Set(), live = { urun: {}, afis: {} };
const put = (path, html) => {
  seen.add(path);
  if (existsSync(path) && readFileSync(path, "utf8") === html) { kept++; return; }
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, html); wrote++;
};

for (const m of MARKETS) {
  if (paused.includes(m)) continue;
  const rows = C.rowsOf(load(`data/${m}.json`) || {}).sort((a, b) => (a.id < b.id ? -1 : 1));
  live.urun[m] = {};
  for (const o of rows) {
    const sl = slugOf("urun", o.id, o.name);
    live.urun[m][o.id] = sl;
    put(`urun/${m}/${sl}.html`, page({
      title: o.name, type: "product", image: o.image ? ogImage(o.image) : "",
      desc: `${NAMES[m]} ve diğer marketlerdeki fiyatını marketfiyat'ta karşılaştır.`,
      url: `${SITE}urun/${m}/${sl}`, hash: `#urun/${encodeURIComponent(o.id)}`,
    }));
  }
}
for (const m of POSTERS) {
  if (paused.includes(m)) continue;
  const d = load(`data/posters-${m}.json`);
  for (const it of (d && Array.isArray(d.items) ? d.items : [])) {
    if (!it || !it.id || !/^https:\/\//.test(it.image || "")) continue;
    // BİM sayfa başlığı "BİM Aktüel · 17 Kasım Salı": market adı adreste zaten var
    const title = String(it.title || "kampanya").replace(new RegExp("^" + (NAMES[m] || m) + "\\s*", "i"), "");
    const sl = slugOf("afis", it.id, title);
    live.afis[it.id] = m + "/" + sl;
    put(`afis/${m}/${sl}.html`, page({
      title: `${NAMES[m] || m}: ${it.title || "Kampanya"}`, type: "website", image: ogImage(it.image),
      desc: [it.label, "Kampanya ürünleri ve fiyatları marketfiyat'ta."].filter(Boolean).join(" · "),
      url: `${SITE}afis/${m}/${sl}`, hash: `#afis/${encodeURIComponent(it.id)}`,
    }));
  }
}
// Artık olmayan ürün/afişin sayfası silinir (adresi kayıtta kalır, başka ürüne verilmez)
let removed = 0;
const sweep = (dir) => {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) { sweep(p); if (!readdirSync(p).length) rmdirSync(p); }
    else if (e.name.endsWith(".html") && !seen.has(p)) { unlinkSync(p); removed++; }
  }
};
sweep("urun"); sweep("afis");
const wr = (p, o) => { const s = JSON.stringify(o); if (!existsSync(p) || readFileSync(p, "utf8") !== s) writeFileSync(p, s); };
wr("data/slugs.json", REG);
mkdirSync("data/client", { recursive: true });
for (const m of Object.keys(live.urun)) wr(`data/client/slugs-${m}.json`, live.urun[m]);
wr("data/client/slugs-afis.json", live.afis);
console.log(`paylaşım sayfaları: ${seen.size} (yeni/değişen ${wrote}, aynı ${kept}, silinen ${removed})`);

// İstemci veri dosyalarını üretir (yayımlama adımında her market yayımından sonra çalışır):
//   data/client/<market>-catalog.json  id, ad, görsel, adres, kategori — ürün sırası id'ye göre sabit;
//                                      içerik değişmedikçe yeniden yazılmaz (v = içerik özeti)
//   data/client/<market>-prices.json   aynı sırada fiyat, etiket fiyatı, stok, kampanya, doğrulama zamanı
//   data/client/groups.json            marketler arası eşleştirme (birden çok teklifli gruplar)
//   data/client/index.json             katalog sürümleri; istemci ilk bunu okur
// Kaynak her zaman data/<market>.json'dur; bu dosyalar yalnızca uygulamayı hızlandırmak içindir.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const MF = require("../js/match.js"), C = require("../js/core.js");
const MARKETS = ["migros", "sok", "bim"], DIR = "data/client";
mkdirSync(DIR, { recursive: true });
const load = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const dump = (o) => JSON.stringify(o, null, 0);
const write = (p, s) => { if (existsSync(p) && readFileSync(p, "utf8") === s) return false; writeFileSync(p + ".tmp", s); renameSync(p + ".tmp", p); return true; };

const index = { built: new Date().toISOString(), markets: {} }, allRows = [];
for (const m of MARKETS) {
  const d = load(`data/${m}.json`);
  if (!d || !Array.isArray(d.products) || !d.products.length) continue;
  const f = d.fields, at = Object.fromEntries(f.map((k, i) => [k, i]));
  const P = [...d.products].sort((a, b) => (a[at.id] < b[at.id] ? -1 : a[at.id] > b[at.id] ? 1 : 0));
  // Markete özgü ek alanlar (ör. Migros: brand, sold) katalogun sonuna eklenir; değerler seyrek değişir.
  const extra = f.filter((k) => !["id", "name", "price", "regular", "in_stock", "image", "url", "cat", "promo", "seen"].includes(k));
  const catBody = { market: m, prefix: d.prefix || {}, cats: d.cats || {}, fields: ["id", "name", "image", "url", "cat", ...extra],
    products: P.map((r) => [r[at.id], r[at.name], r[at.image], r[at.url], r[at.cat], ...extra.map((k) => r[at[k]] ?? null)]) };
  const v = createHash("sha256").update(dump(catBody)).digest("hex").slice(0, 12);
  const seens = P.map((r) => r[at.seen]).filter(Number.isInteger), base = seens.length ? Math.min(...seens) : 0;
  const prices = { market: m, updated: d.updated, catalog: v, base, fields: ["price", "regular0", "in_stock", "promo", "seenOffset"],
    products: P.map((r) => [r[at.price], r[at.regular] > r[at.price] ? r[at.regular] : 0, r[at.in_stock] ? 1 : 0, r[at.promo] || "",
      Number.isInteger(r[at.seen]) ? r[at.seen] - base : null]) };
  write(`${DIR}/${m}-catalog.json`, dump({ v, ...catBody }));
  write(`${DIR}/${m}-prices.json`, dump(prices));
  index.markets[m] = { catalog: v, updated: d.updated, count: P.length };
  allRows.push(...C.rowsOf(d));
}
// Eşleştirme: uygulamanın kendi match.js'iyle, birden çok teklifli gruplar
const groups = MF.group(allRows).filter((g) => g.offers.length > 1).map((g) => g.offers.map((o) => o.id).sort());
groups.sort((a, b) => (a[0] < b[0] ? -1 : 1));
const matchV = createHash("sha256").update(readFileSync("js/match.js")).digest("hex").slice(0, 12);
write(`${DIR}/groups.json`, dump({ match: matchV, catalogs: Object.fromEntries(Object.entries(index.markets).map(([m, x]) => [m, x.catalog])), groups }));
index.match = matchV;
// Barkodlar: Open Food Facts'tan (ODbL) gelen barkod → ad/marka/miktar, bizim ürünlerle eşleştirilir.
// Aday: aynı marka ve aynı boy; puan: benzer ürün puanı (MF.similar). >= 0.9 kesin, 0.5–0.9 "olası".
const off = load("data/off-tr.json");
if (off && Array.isArray(off.products)) {
  const by = new Map();
  for (const o of allRows) { const p = o._p; if (!p || !p.size) continue; const k = p.brand + "|" + p.size; (by.get(k) || by.set(k, []).get(k)).push(o); }
  const codes = {}, names = {};
  for (const [code, name0, brand, qty] of off.products) {
    let nm = name0;
    if (brand && !MF.fold(nm).startsWith(MF.fold(brand))) nm = brand + " " + nm;
    if (qty && !/\d\s*(g|gr|kg|ml|l|lt|cl)\b/i.test(nm)) nm += " " + qty;
    const p = MF.parse(nm); if (!p || !p.size) continue;
    const r = MF.similar({ _p: p, id: "off", market: "off", name: nm, price: 1 }, by.get(p.brand + "|" + p.size) || [], { sameMarket: true, ratio: 1.01 });
    if (r.length && r[0].score >= 0.5) { codes[code] = [r[0].o.id, Math.round(Math.min(1, r[0].score) * 100) / 100]; continue; }
    // Yedek: barkodun adındaki ayırt edici kelimelerin hepsi tek bir adayda geçiyorsa (ya da o marka ve boyda
    // tek ürün varsa) "olası" eşleşme: "Torku Banada 700g" → "Torku Banada Kakaolu Fındık Kreması 700 G"
    const cs = by.get(p.brand + "|" + p.size) || [];
    const own = p.toks.slice(1).filter((t) => !/^[\d.%]/.test(t) && t.length > 2);
    const hit = cs.filter((o) => own.length && own.every((t) => o._p.toks.some((x) => x.startsWith(t) || t.startsWith(x))));
    if (hit.length === 1) codes[code] = [hit[0].id, 0.7];
    else if (cs.length === 1 && own.length <= 1) codes[code] = [cs[0].id, 0.6];
  }
  // Eşleşmeyenlerin adı: okutulunca arama kutusuna yazılır, kullanıcı doğru ürünü seçip barkodu bağlar
  for (const [code, name0, brand, qty] of off.products) {
    if (codes[code]) continue;
    let nm = name0;
    if (brand && !MF.fold(nm).startsWith(MF.fold(brand))) nm = brand + " " + nm;
    if (/[a-zçğıöşü]/i.test(nm)) names[code] = (nm + (qty && !/\d\s*(g|gr|kg|ml|l|lt|cl)\b/i.test(nm) ? " " + qty : "")).slice(0, 80);
  }
  // Kullanıcının öğrettiği barkodlar (takip listesiyle gönderilir, bildirim işi kaydeder): en güvenilir kaynak
  const user = load("data/barcodes-user.json");
  for (const [code, id] of Object.entries((user && user.codes) || {})) if (/^\d{8,14}$/.test(code)) { codes[code] = [id, 1]; delete names[code]; }
  write(`${DIR}/barcodes.json`, dump({ source: "Open Food Facts (ODbL 1.0)", off: off.updated, codes, names }));
  index.barcodes = Object.keys(codes).length;
}
// index.json yalnızca içerik değişince yazılır ("built" alanı karşılaştırmaya girmez)
const prev = load(`${DIR}/index.json`);
if (!prev || dump({ ...prev, built: 0 }) !== dump({ ...index, built: 0 })) write(`${DIR}/index.json`, dump(index));
console.log("client data:", Object.entries(index.markets).map(([m, x]) => `${m} ${x.count} (${x.catalog})`).join(", "), "| groups", groups.length, "| barcodes", index.barcodes || 0);

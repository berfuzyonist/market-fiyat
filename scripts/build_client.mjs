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
  const catBody = { market: m, prefix: d.prefix || {}, cats: d.cats || {}, fields: ["id", "name", "image", "url", "cat"],
    products: P.map((r) => [r[at.id], r[at.name], r[at.image], r[at.url], r[at.cat]]) };
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
// index.json yalnızca içerik değişince yazılır ("built" alanı karşılaştırmaya girmez)
const prev = load(`${DIR}/index.json`);
if (!prev || dump({ ...prev, built: 0 }) !== dump({ ...index, built: 0 })) write(`${DIR}/index.json`, dump(index));
console.log("client data:", Object.entries(index.markets).map(([m, x]) => `${m} ${x.count} (${x.catalog})`).join(", "), "| groups", groups.length);

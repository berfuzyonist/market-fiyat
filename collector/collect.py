#!/usr/bin/env python3
"""Kişisel market fiyat toplayıcı (Migros ve Şok, tüm ürünler).

Kurallar:
- Yalnızca herkese açık ve sitenin robots.txt dosyasının izin verdiği adresler okunur.
- Aynı siteye iki istek arasında beklenir (config.json: delay_seconds).
- Program kendini açıkça tanıtır (User-Agent); tarayıcı taklidi yapmaz.
- Site 403/429 dönerse ya da art arda hata verirse o market için durulur.
- Bir market yarıda kalırsa o marketin eski verisi korunur.
"""
import datetime
import gzip
import html
import json
import os
import pathlib
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser

ROOT = pathlib.Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
UA, DELAY = CFG["user_agent"], CFG["delay_seconds"]
ROBOTS, STATS, ERRORS = {}, {}, []


class Stop(Exception):
    """Site bizi istemiyor ya da hata veriyor: bu market için dur."""


def _fetch(url, accept):
    time.sleep(DELAY)
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": accept, "Accept-Language": "tr", "Accept-Encoding": "gzip"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            size = len(raw)
            if r.headers.get("Content-Encoding") == "gzip":
                raw = gzip.decompress(raw)
            return r.status, raw.decode("utf-8", "replace"), size
    except urllib.error.HTTPError as e:
        return e.code, "", 0
    except Exception as e:  # ağ hatası
        return 0, repr(e), 0


def allowed(url):
    """robots.txt okunamazsa ya da yolu yasaklıyorsa False döner."""
    u = urllib.parse.urlsplit(url)
    base = f"{u.scheme}://{u.netloc}"
    if base not in ROBOTS:
        status, body, _ = _fetch(base + "/robots.txt", "text/plain")
        rp = None
        if status == 200:
            rp = urllib.robotparser.RobotFileParser()
            rp.parse(body.splitlines())
        ROBOTS[base] = rp
    rp = ROBOTS[base]
    return bool(rp) and rp.can_fetch(UA, url)


def get(url, accept="application/json"):
    host = urllib.parse.urlsplit(url).netloc
    st = STATS.setdefault(host, {"requests": 0, "bytes": 0, "errors": 0, "streak": 0})
    if not allowed(url):
        ERRORS.append({"url": url, "status": "robots.txt izin vermiyor, atlandı"})
        return None, ""
    status, body, size = _fetch(url, accept)
    st["requests"] += 1
    st["bytes"] += size
    if status == 200:
        st["streak"] = 0
        return status, body
    if status == 404:  # böyle bir sayfa yok: hata sayılmaz
        return status, ""
    st["errors"] += 1
    st["streak"] += 1
    if len(ERRORS) < 50:
        ERRORS.append({"url": url, "status": status, "detail": body[:120] if status == 0 else ""})
    if status in (403, 429) or st["streak"] >= 3:
        raise Stop(f"{host}: durum {status}")
    return status, ""


# ---------- Migros ----------

def migros_item(p):
    img = ((p.get("images") or [{}])[0].get("urls") or {}).get("PRODUCT_DETAIL")
    return {
        "id": f"migros:{p.get('sku')}",
        "market": "migros",
        "name": p.get("name") or "",
        "price": p.get("shownPrice", 0) / 100,
        "regular": p.get("regularPrice", 0) / 100,
        "in_stock": p.get("status") == "IN_SALE",
        "image": img or "",
        "url": "https://www.migros.com.tr/" + (p.get("prettyName") or ""),
    }


def migros(products, notes):
    c = CFG["migros"]
    covered, crawled = set(), set()

    def page_of(slug, page):
        status, body = get(f"https://www.migros.com.tr/rest/search/screens/{slug}?sayfa={page}")
        if status != 200:
            return None
        try:
            return json.loads(body)["data"]["searchInfo"]
        except Exception:
            return None

    def top_of(info):
        """Sayfadaki ürünlerin çoğunun bağlı olduğu üst kategori."""
        votes = {}
        for p in (info or {}).get("storeProductInfos") or []:
            asc = p.get("categoryAscendants") or []
            top = (asc[-1] if asc else p.get("category") or {}).get("prettyName")
            if top:
                votes[top] = votes.get(top, 0) + 1
        return max(votes, key=votes.get) if votes else None

    def crawl(slug):
        page, pages, prev = 1, 1, None
        while page <= min(pages, c["max_pages"]):
            info = page_of(slug, page)
            items = (info or {}).get("storeProductInfos") or []
            if not items or items[0].get("id") == prev:
                break
            prev, pages = items[0].get("id"), info.get("pageCount", 1)
            if page == 1 and pages * len(items) < 0.9 * info.get("hitCount", 0):
                notes.append(f"{slug}: {info.get('hitCount')} üründen yalnızca {pages} sayfa sunuluyor")
            for p in items:
                products[f"migros:{p.get('sku')}"] = migros_item(p)
                covered.add((p.get("category") or {}).get("prettyName"))
                covered.update(a.get("prettyName") for a in p.get("categoryAscendants") or [])
            page += 1

    def visit(slug):
        top = top_of(page_of(slug, 1))
        covered.add(slug)
        if top and top not in crawled:
            crawled.add(top)
            crawl(top)

    for cid in c["seed_ids"]:  # bilinen üst kategori numaraları
        visit(f"x-c-{cid}")
    # Site haritasındaki kategorilerden hâlâ kapsanmayan varsa onun üst kategorisini de tara
    status, body = get(c["sitemap"], "application/xml")
    slugs = [u.rsplit("/", 1)[-1] for u in re.findall(r"<loc>(.*?)</loc>", body) if "-c-" in u]
    extra = 0
    for slug in slugs:
        if slug in covered:
            continue
        if extra >= c["max_discovery"]:
            notes.append(f"kategori keşfi sınırı ({c['max_discovery']}) doldu, taranmamış kategori kalmış olabilir")
            break
        extra += 1
        visit(slug)
    notes.append(f"{len(crawled)} üst kategori tarandı: " + ", ".join(sorted(crawled)))


# ---------- Şok ----------

SOK_LINK = re.compile(r'<a href="(/[a-z0-9-]+-p-(\d+))"')
TL = r"(\d[\d.]*,\d\d)"


def tl(text):
    return float(text.replace(".", "").replace(",", "."))


def sok_cards(body):
    """Şok kategori sayfasındaki ürün kartlarını ayıklar."""
    out, links = {}, list(SOK_LINK.finditer(body))
    for i, m in enumerate(links):
        blk = body[m.end(): links[i + 1].start() if i + 1 < len(links) else m.end() + 6000]
        title = re.search(r"<h2[^>]*>(.*?)</h2>", blk, re.S)
        prices = [tl(x) for x in re.findall(r">" + TL + r"(?:<!-- -->)?\s*₺", blk)]
        if not title or not prices:
            continue
        named = re.search(r'data-testid="discountedPrice">' + TL, blk)
        price = tl(named.group(1)) if named else min(prices)
        img = (re.search(r'<img src="(https://images\.ceptesok\.com/[^"]*product-assets[^"]+)"', blk)
               or re.search(r'<img src="(https://images\.ceptesok\.com/(?!badge)[^"]+)"', blk))
        out["sok:" + m.group(2)] = {
            "id": "sok:" + m.group(2),
            "market": "sok",
            "name": html.unescape(re.sub(r"<[^>]+>", "", title.group(1))).strip(),
            "price": price,
            "regular": max(prices + [price]),
            "in_stock": "Tükendi" not in blk and "Stokta yok" not in blk,
            "image": img.group(1) if img else "",
            "url": "https://www.sokmarket.com.tr" + m.group(1),
        }
    return list(out.values())


def sok(products, notes):
    c = CFG["sok"]
    for slug in c["categories"]:
        page, pages, got, total, why = 1, 1, 0, None, "son sayfa"
        while page <= min(pages, c["max_pages"]):
            url = f"https://www.sokmarket.com.tr/{slug}" + (f"?page={page}" if page > 1 else "")
            status, body = get(url, "text/html")
            cards = sok_cards(body) if status == 200 else []
            if not cards:
                why = f"sayfa {page}: durum {status}, {len(body)} bayt, kart yok"
                break
            m = re.search(r'totalPages\\*":(\d+)', body)
            if m:
                pages = int(m.group(1))
            m = re.search(r'totalElements\\*":(\d+)', body)
            if m and total is None:
                total = int(m.group(1))
            for x in cards:
                products[x["id"]] = x
            got += len(cards)
            page += 1
        if page > c["max_pages"]:
            why = "sayfa sınırı"
        notes.append(f"{slug}: sitede {total}, okunan {got}, {page - 1}/{pages} sayfa ({why})")


# ---------- Çıktı ----------

FIELDS = ["id", "name", "price", "regular", "in_stock", "image", "url"]
MARKETS = {"migros": migros, "sok": sok}
if os.environ.get("MARKETS"):
    MARKETS = {k: v for k, v in MARKETS.items() if k in os.environ["MARKETS"].split(",")}


def read_old():
    """Önceki veriyi (yeni ya da eski biçimde) id -> ürün sözlüğü olarak okur."""
    try:
        d = json.loads((ROOT / "data" / "products.json").read_text(encoding="utf-8"))
    except Exception:
        return {}
    out = {}
    for row in d.get("products", []):
        if isinstance(row, dict):
            p = {k: row.get(k) for k in FIELDS}
        else:
            p = dict(zip(FIELDS, row))
            pre = d.get("prefix", {}).get(p["id"].split(":")[0], {})
            p["image"] = pre.get("image", "") + p["image"] if p["image"] else ""
            p["url"] = pre.get("url", "") + p["url"] if p["url"] else ""
        p["market"] = p["id"].split(":")[0]
        p["in_stock"] = bool(p["in_stock"])
        out[p["id"]] = p
    return out


def write(products, updated):
    rows = sorted(products.values(), key=lambda p: p["id"])
    prefix = {}
    for m in sorted({p["market"] for p in rows}):
        prefix[m] = {}
        for f in ("image", "url"):
            vals = [p[f] for p in rows if p["market"] == m and p[f]]
            prefix[m][f] = os.path.commonprefix(vals) if len(vals) > 1 else ""
    lines = []
    for p in rows:
        pre = prefix[p["market"]]
        lines.append(json.dumps(
            [p["id"], p["name"], p["price"], p["regular"], int(p["in_stock"]),
             p["image"][len(pre["image"]):] if p["image"] else "", p["url"][len(pre["url"]):] if p["url"] else ""],
            ensure_ascii=False, separators=(",", ":")))
    head = json.dumps({"updated": updated, "prefix": prefix, "fields": FIELDS}, ensure_ascii=False)
    (ROOT / "data" / "products.json").write_text(
        head[:-1] + ',"products":[\n' + ",\n".join(lines) + "\n]}\n", encoding="utf-8")


def main():
    (ROOT / "data").mkdir(exist_ok=True)
    started = time.time()
    old = read_old()
    results = {}

    def run(name, fn):
        prods, notes, state = {}, [], "tamam"
        t0 = time.time()
        try:
            fn(prods, notes)
        except Stop as e:
            state = f"durduruldu: {e}"
        except Exception as e:  # beklenmeyen hata diğer marketi etkilemesin
            state = f"hata: {e!r}"
        results[name] = (prods, notes, state, round(time.time() - t0))

    threads = [threading.Thread(target=run, args=kv) for kv in MARKETS.items()]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    merged, summary = {}, {}
    for name, (prods, notes, state, secs) in results.items():
        old_m = {k: v for k, v in old.items() if v["market"] == name}
        keep_old = state != "tamam" or len(prods) < 0.5 * len(old_m)
        if keep_old and old_m:
            notes.append(f"yeni sonuç eksik ({len(prods)} ürün), eski veri ({len(old_m)} ürün) korundu")
            merged.update(old_m)
            merged.update(prods)
        else:
            merged.update(prods)
        summary[name] = {"status": state, "found": len(prods), "seconds": secs, "notes": notes}
    for k, v in old.items():  # bu çalışmada hiç taranmayan marketlerin verisi kalsın
        if v["market"] not in MARKETS:
            merged.setdefault(k, v)

    updated = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    if merged:
        write(merged, updated)
    status = {
        "updated": updated, "total": len(merged), "seconds": round(time.time() - started),
        "markets": summary,
        "traffic": {h: {"requests": s["requests"], "megabytes": round(s["bytes"] / 1e6, 1), "errors": s["errors"]}
                    for h, s in STATS.items()},
        "errors": ERRORS,
    }
    (ROOT / "data" / "status.json").write_text(json.dumps(status, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(status, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

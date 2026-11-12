#!/usr/bin/env python3
"""Kişisel market fiyat toplayıcı.

Kurallar:
- Yalnızca herkese açık ve sitenin robots.txt dosyasının izin verdiği adresler okunur.
- Her istekten önce beklenir (config.json: delay_seconds).
- Program kendini açıkça tanıtır (User-Agent); tarayıcı taklidi yapmaz.
- Site hata dönerse (403, 429 vb.) o market için durulur, yeniden denenmez.
"""
import datetime
import json
import pathlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser

ROOT = pathlib.Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
UA, DELAY = CFG["user_agent"], CFG["delay_seconds"]
LOG, ROBOTS = [], {}


def _fetch(url, accept):
    time.sleep(DELAY)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept, "Accept-Language": "tr"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:  # ağ hatası
        LOG.append({"url": url, "error": repr(e)})
        return 0, ""


def allowed(url):
    """robots.txt okunamazsa ya da yolu yasaklıyorsa False döner."""
    u = urllib.parse.urlsplit(url)
    base = f"{u.scheme}://{u.netloc}"
    if base not in ROBOTS:
        status, body = _fetch(base + "/robots.txt", "text/plain")
        rp = None
        if status == 200:
            rp = urllib.robotparser.RobotFileParser()
            rp.parse(body.splitlines())
        ROBOTS[base] = rp
        LOG.append({"url": base + "/robots.txt", "status": status})
    rp = ROBOTS[base]
    return bool(rp) and rp.can_fetch(UA, url)


def get(url, accept="application/json"):
    if not allowed(url):
        LOG.append({"url": url, "status": "robots.txt izin vermiyor, atlandı"})
        return None, ""
    status, body = _fetch(url, accept)
    LOG.append({"url": url, "status": status, "bytes": len(body)})
    return status, body


def migros_item(p):
    img = ((p.get("images") or [{}])[0].get("urls") or {}).get("PRODUCT_DETAIL")
    return {
        "id": f"migros:{p.get('sku')}",
        "market": "migros",
        "name": p.get("name"),
        "brand": (p.get("brand") or {}).get("name"),
        "category": (p.get("category") or {}).get("name"),
        "price": p.get("shownPrice", 0) / 100,
        "regular": p.get("regularPrice", 0) / 100,
        "unit_price": p.get("unitPrice"),
        "in_stock": p.get("status") == "IN_SALE",
        "badges": [b.get("name") for b in p.get("badges") or []],
        "image": img,
        "url": "https://www.migros.com.tr/" + (p.get("prettyName") or ""),
    }


def migros():
    products, c = [], CFG["migros"]
    for slug in c["categories"]:
        page, pages, prev = 1, 1, None
        while page <= min(pages, c["max_pages"]):
            status, body = get(f"https://www.migros.com.tr/rest/search/screens/{slug}?sayfa={page}")
            if status != 200:
                return products, f"durduruldu: {slug} sayfa {page}, durum {status}"
            try:
                info = json.loads(body)["data"]["searchInfo"]
            except Exception as e:
                return products, f"beklenmeyen yanıt: {slug}: {e!r}: {body[:200]}"
            items = info.get("storeProductInfos") or []
            if not items or items[0].get("id") == prev:
                break  # sayfalama ilerlemiyor
            prev = items[0].get("id")
            pages = info.get("pageCount", 1)
            products += [migros_item(p) for p in items]
            page += 1
    return products, "tamam"


def sok_probe():
    """Geçici: Şok kategori sayfalarının yapısını öğrenmek için iki istek atar."""
    res = {}
    status, body = get("https://www.sokmarket.com.tr/sitemap/market-category_1.xml", "application/xml")
    locs = re.findall(r"<loc>(.*?)</loc>", body)
    res["categories"] = {"status": status, "count": len(locs), "sample": locs[:40]}
    status, body = get("https://www.sokmarket.com.tr/icecek-c-20505", "text/html")
    links = sorted(set(re.findall(r'href="(/[a-z0-9-]+-p-[0-9]+)"', body)))
    info = {"status": status, "length": len(body), "product_links": len(links), "links_sample": links[:5], "ctx": []}
    for m in list(re.finditer(r'price', body))[:400:80]:
        info["ctx"].append(body[max(0, m.start() - 500): m.start() + 500])
    res["category"] = info
    return res


def dump(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def main():
    out = ROOT / "data"
    out.mkdir(exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    products, mig_status = migros()
    uniq = list({p["id"]: p for p in products}.values())
    probe = sok_probe()
    if uniq:  # boş sonuç eski veriyi silmesin
        dump(out / "products.json", {"updated": now, "products": uniq})
    status = {"updated": now, "migros": {"status": mig_status, "count": len(uniq)}, "requests": LOG}
    dump(out / "status.json", status)
    dump(out / "probe.json", probe)
    print(json.dumps(status, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

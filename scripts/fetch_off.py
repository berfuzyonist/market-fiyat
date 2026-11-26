#!/usr/bin/env python3
"""Open Food Facts'tan Türkiye ürünlerinin barkod, ad, marka ve miktarını indirir (haftada bir).

Kaynak: Open Food Facts toplu dışa aktarımı (ODbL 1.0 açık veri lisansı; https://world.openfoodfacts.org).
Dosya akış halinde okunur (diske yazılmaz), yalnızca Türkiye'de satılan ya da Türk barkodlu (868/869)
ürünler tutulur. Çıktı: data/off-tr.json. Yeni liste öncekinin yarısından azsa eski dosya korunur.
"""
import csv
import gzip
import io
import json
import pathlib
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "off-tr.json"
URL = "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz"
UA = "market-fiyat/1.0 (+https://github.com/berfuzyonist/market-fiyat)"


def keep(row):
    code = (row.get("code") or "").strip()
    if not code.isdigit() or len(code) not in (8, 12, 13):
        return None
    tr = "en:turkey" in (row.get("countries_tags") or "") or code.startswith(("868", "869"))
    name = " ".join((row.get("product_name") or "").split())
    if not tr or not name:
        return None
    brand = " ".join((row.get("brands") or "").split(",")[0].split())
    qty = " ".join((row.get("quantity") or "").split())
    return [code, name[:120], brand[:40], qty[:30]]


def rows(stream):
    csv.field_size_limit(1 << 26)
    text = io.TextIOWrapper(gzip.GzipFile(fileobj=stream), encoding="utf-8", errors="replace", newline="")
    return csv.DictReader(text, delimiter="\t", quoting=csv.QUOTE_NONE)


def main(argv):
    src = argv[0] if argv else URL
    t0 = time.time()
    stream = open(src, "rb") if not src.startswith("http") else urllib.request.urlopen(
        urllib.request.Request(src, headers={"User-Agent": UA}), timeout=120)
    out, n = {}, 0
    with stream:
        for row in rows(stream):
            n += 1
            r = keep(row)
            if r:
                out[r[0]] = r
    prods = sorted(out.values())
    prev = 0
    if OUT.exists():
        try:
            prev = len(json.loads(OUT.read_text(encoding="utf-8")).get("products") or [])
        except ValueError:
            prev = 0
    print(f"{n} satır okundu, {len(prods)} Türkiye ürünü ({time.time() - t0:.0f} sn); önceki {prev}")
    if len(prods) < 1000 or len(prods) < prev * 0.5:
        print("liste beklenenden küçük; eski dosya korunuyor", file=sys.stderr)
        return 1
    OUT.write_text(json.dumps({"source": "Open Food Facts (ODbL 1.0) https://world.openfoodfacts.org",
                               "updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                               "fields": ["code", "name", "brand", "quantity"], "products": prods},
                              ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

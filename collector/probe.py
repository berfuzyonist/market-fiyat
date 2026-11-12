"""Geçici yapı denemesi: sayfalama ve kategori listeleri."""
import json, re
from collect import ROOT, LOG, get, sok_cards, dump

res = {}
st, body = get("https://www.migros.com.tr/hermes/api/sitemaps/sitemap.xml", "application/xml")
idx = re.findall(r"<loc>(.*?)</loc>", body)
res["migros_sitemap"] = {"status": st, "locs": idx[:30], "head": body[:300] if not idx else ""}
for u in [x for x in idx if "categor" in x.lower() or "kategori" in x.lower()][:2]:
    st, b = get(u, "application/xml")
    locs = re.findall(r"<loc>(.*?)</loc>", b)
    short = [x.rsplit("/", 1)[-1] for x in locs if re.search(r"-c-[0-9a-f]{1,2}$", x)]
    res["migros_categories"] = {"url": u, "status": st, "count": len(locs), "short_ids": short, "sample": [x.rsplit("/", 1)[-1] for x in locs[:15]]}
st, b = get("https://www.migros.com.tr/rest/search/screens/x-c-5")
try:
    info = json.loads(b)["data"]["searchInfo"]
    first = (info.get("storeProductInfos") or [{}])[0]
    res["migros_id_only"] = {"status": st, "hits": info.get("hitCount"), "pages": info.get("pageCount"), "asc": [a.get("prettyName") for a in first.get("categoryAscendants") or []], "cat": (first.get("category") or {}).get("prettyName")}
except Exception as e:
    res["migros_id_only"] = {"status": st, "error": repr(e), "head": b[:200]}
pages = {}
for q in ["", "?page=2", "?page=3"]:
    st, b = get("https://www.sokmarket.com.tr/icecek-c-20505" + q, "text/html")
    cards = sok_cards(b)
    pages[q or "1"] = {"status": st, "bytes": len(b), "cards": len(cards), "first": cards[:2], "last": cards[-1:],
                       "discounted": [c for c in cards if c["regular"] > c["price"]][:2],
                       "next": re.findall(r'rel="next" href="([^"]+)"', b)[:2],
                       "page_links": sorted(set(re.findall(r'href="([^"]*[?&](?:page|sayfa)=\\d+[^"]*)"', b)))[:5],
                       "hints": [b[max(0, m.start() - 80): m.start() + 120] for m in list(re.finditer(r"totalPage|pageCount|totalCount|totalElements", b))[:3]]}
res["sok_pages"] = pages
res["requests"] = LOG
dump(ROOT / "data" / "probe.json", res)

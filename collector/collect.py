#!/usr/bin/env python3
"""Kişisel market fiyat toplayıcı.

Kullanım: python3 collector/collect.py <market> <mod>
  migros full | migros deals
  sok full    | sok deals
  bim aktuel
Her market kendi dosyasına yazar: data/<market>.json ve data/status-<market>.json

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
import sys
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
    asc = p.get("categoryAscendants") or []
    top = (asc[-1] if asc else p.get("category") or {}).get("name") or ""
    return {
        "id": f"migros:{p.get('sku')}",
        "market": "migros",
        "name": p.get("name") or "",
        "price": p.get("shownPrice", 0) / 100,
        "regular": p.get("regularPrice", 0) / 100,
        "in_stock": p.get("status") == "IN_SALE",
        "image": img or "",
        "url": "https://www.migros.com.tr/" + (p.get("prettyName") or ""),
        "cat": top,
    }


def migros(products, notes):
    c = CFG["migros"]
    covered_names, visited_slugs, crawled = set(), set(), set()
    page_cache = {}

    def page_of(slug, page):
        key = (slug, page)
        if key in page_cache:
            return page_cache[key]
        status, body = get(f"https://www.migros.com.tr/rest/search/screens/{slug}?sayfa={page}")
        if status != 200:
            page_cache[key] = None
            return None
        try:
            info = json.loads(body)["data"]["searchInfo"]
        except Exception:
            info = None
        page_cache[key] = info
        return info

    def remember_categories(info):
        for p in (info or {}).get("storeProductInfos") or []:
            categories = [p.get("category") or {}] + (p.get("categoryAscendants") or [])
            for category in categories:
                if not isinstance(category, dict):
                    continue
                name = category.get("prettyName") or category.get("name")
                if name:
                    covered_names.add(_category_key(name))

    def top_of(info):
        """Sayfadaki ürünlerin çoğunun bağlı olduğu üst kategori."""
        votes = {}
        for p in (info or {}).get("storeProductInfos") or []:
            asc = p.get("categoryAscendants") or []
            top = (asc[-1] if asc else p.get("category") or {}).get("name") or ""
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
            remember_categories(info)
            if page == 1 and pages * len(items) < 0.9 * info.get("hitCount", 0):
                notes.append(f"{slug}: {info.get('hitCount')} üründen yalnızca {pages} sayfa sunuluyor")
            for p in items:
                products[f"migros:{p.get('sku')}"] = migros_item(p)
            page += 1

    def visit(slug):
        if slug in visited_slugs:
            return
        base_slug = slug.rsplit("-c-", 1)[0] if "-c-" in slug else slug
        if "-c-" in slug and _category_key(base_slug) in covered_names:
            visited_slugs.add(slug)
            return
        visited_slugs.add(slug)
        info = page_of(slug, 1)
        remember_categories(info)
        top = top_of(info)
        if top:
            top_key = _category_key(top)
            if top_key not in crawled:
                crawled.add(top_key)
                crawl(top)

    for cid in c["seed_ids"]:  # bilinen üst kategori numaraları
        visit(f"x-c-{cid}")

    # Site haritasındaki kategorileri, zaten taranan kategori adlarıyla eşleştir.
    status, body = get(c["sitemap"], "application/xml")
    slugs = [u.rsplit("/", 1)[-1] for u in re.findall(r"<loc>(.*?)</loc>", body) if "-c-" in u]
    extra = 0
    for slug in slugs:
        base_slug = slug.rsplit("-c-", 1)[0]
        if _category_key(base_slug) in covered_names or slug in visited_slugs:
            continue
        if extra >= c["max_discovery"]:
            notes.append(f"kategori keşfi sınırı ({c['max_discovery']}) doldu, taranmamış kategori kalmış olabilir")
            break
        extra += 1
        visit(slug)
    notes.append(f"{len(crawled)} üst kategori tarandı; {len(page_cache)} kategori sayfası tekrar istek yapılmadan önbellekten kullanıldı")
# ---------- Şok ----------

SOK_LINK = re.compile(r'<a href="(/[a-z0-9-]+-p-(\d+))"')
TL = r"(\d[\d.]*,\d\d)"


def tl(text):
    return float(text.replace(".", "").replace(",", "."))


def sok_cards(body, cat=""):
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
            "cat": cat,
        }
    return list(out.values())


def sok_pages(slug, cat, products, notes, max_pages):
    page, pages, got, total, why = 1, 1, 0, None, "son sayfa"
    while page <= min(pages, max_pages):
        url = f"https://www.sokmarket.com.tr/{slug}" + (f"?page={page}" if page > 1 else "")
        status, body = get(url, "text/html")
        cards = sok_cards(body, cat) if status == 200 else []
        if not cards:
            why = f"sayfa {page}: durum {status}, kart yok"
            break
        m = re.search(r'totalPages\\*":(\d+)', body)
        if m:
            pages = int(m.group(1))
        m = re.search(r'totalElements\\*":(\d+)', body)
        if m and total is None:
            total = int(m.group(1))
        for x in cards:
            products.setdefault(x["id"], x)
        got += len(cards)
        page += 1
    if page > max_pages:
        why = "sayfa sınırı"
    notes.append(f"{slug}: sitede {total}, okunan {got}, {page - 1}/{pages} sayfa ({why})")


def sok(products, notes):
    c = CFG["sok"]
    for slug, cat in c["categories"].items():
        sok_pages(slug, cat, products, notes, c["max_pages"])


def sok_deals(products, notes):
    sok_pages(CFG["sok"]["deals"], "", products, notes, CFG["sok"]["max_pages"])


def migros_deals(products, notes):
    c, page, pages, prev = CFG["migros"], 1, 1, None
    for slug in c["deals"]:
        page, pages, prev = 1, 1, None
        while page <= min(pages, c["max_pages"]):
            status, body = get(f"https://www.migros.com.tr/rest/search/screens/{slug}?sayfa={page}")
            try:
                info = json.loads(body)["data"]["searchInfo"]
            except Exception:
                break
            items = info.get("storeProductInfos") or []
            if not items or items[0].get("id") == prev:
                break
            prev, pages = items[0].get("id"), info.get("pageCount", 1)
            for p in items:
                products.setdefault(f"migros:{p.get('sku')}", migros_item(p))
            page += 1
        notes.append(f"{slug}: {page - 1}/{pages} sayfa")


# ---------- BİM aktüel ----------

def bim_cards(body, label):
    out, parts = {}, re.split(r'(?=<a[^>]+href="/aktuel-urunler/[^"]+/aktuel\.aspx")', body)
    for blk in parts[1:]:
        m = re.match(r'<a[^>]+href="(/aktuel-urunler/([^"/]+)/aktuel\.aspx)"', blk)
        blk = blk[:5000]
        heads = [html.unescape(re.sub(r"<[^>]+>", " ", h)).strip() for h in re.findall(r"<h2[^>]*>(.*?)</h2>", blk, re.S)]
        heads = [" ".join(h.split()) for h in heads if h.strip()]
        text = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", blk)).split())
        price = re.search(r"(\d{1,3}(?:\.\d{3})*|\d+)\s*(?:,\s*(\d{2}))?\s*₺", text)
        if not m or not heads or not price:
            continue
        size = re.search(r"•\s*([^•₺]{1,25}?)\s+(?=\d[\d.,\s]*₺|Paylaş)", text)
        img = re.search(r'(?:data-src|src)="([^"]+\.(?:jpe?g|png|webp)[^"]*)"', blk)
        src = img.group(1) if img else ""
        if src.startswith("/"):
            src = "https://www.bim.com.tr" + src
        size = size.group(1).strip(" ,") if size else ""
        if re.fullmatch(r"[\d.,\s]*", size):  # boyut yoksa fiyat parçası yakalanmış olabilir
            size = ""
        name = " ".join(heads[:2] + ([size] if size else []))
        value = float(price.group(1).replace(".", "") + "." + (price.group(2) or "00"))
        out["bim:" + m.group(2)] = {
            "id": "bim:" + m.group(2), "market": "bim", "name": name, "price": value, "regular": value,
            "in_stock": True, "image": src if src.startswith("https://") else "",
            "url": "https://www.bim.com.tr" + m.group(1),
            "cat": ("İndirim · " if re.match(r"\d+\s*-\s*\d+", label) else "Aktüel · ") + label,
        }
    return out


def bim(products, notes):
    base = "https://www.bim.com.tr/Categories/100/aktuel-urunler.aspx"
    status, body = get(base, "text/html")
    dates = re.findall(r'href="(/categories/100/aktuel-urunler\.aspx\?Bim_AktuelTarihKey=(\d+))"[^>]*>(.*?)</a>', body, re.S | re.I)
    seen = set()
    for path, key, label in dates[: CFG["bim"]["max_dates"]]:
        if key in seen:
            continue
        seen.add(key)
        label = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", label)).split())
        st, b = get("https://www.bim.com.tr" + path, "text/html")
        cards = bim_cards(b, label) if st == 200 else {}
        for k, v in cards.items():
            products.setdefault(k, v)
        notes.append(f"{label}: {len(cards)} ürün")
    if not products:
        i = body.find("aktuel-urunler/")
        notes.append("ayıklanamadı, örnek: " + body[max(0, i - 600): i + 1400] if i >= 0 else "ürün bağlantısı yok")


# ---------- Çıktı ----------

FIELDS = ["id", "name", "price", "regular", "in_stock", "image", "url", "cat"]
JOBS = {
    ("migros", "full"): migros, ("migros", "deals"): migros_deals,
    ("sok", "full"): sok, ("sok", "deals"): sok_deals,
    ("bim", "aktuel"): bim,
}


# ---------- Kategori tamamlama ----------

_CATEGORY_TRANSLATION = str.maketrans("çğıöşüâîû", "cgiosuaiu")


def _category_key(value):
    value = str(value or "").strip().lower().translate(_CATEGORY_TRANSLATION)
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


CATEGORY_RULES = [
    ("Meyve & Sebze", r"\b(elma|armut|muz|portakal|mandalina|limon|greyfurt|uzum|cilek|kiraz|visne|seftali|kayisi|erik|karpuz|kavun|domates|salatalik|biber|patlican|kabak|patates|sogan|sarimsak|havu[cç]|marul|maydanoz|roka|ispanak|brokoli|karnabahar|lahana|mantar|avokado)\b"),
    ("Et, Tavuk & Şarküteri", r"\b(dana|kuzu|tavuk|hindi|sucuk|salam|sosis|pastirma|kiyma|kofte|biftek|antrikot|pirzola|balik|somon|ton baligi|karides|midye)\b"),
    ("Süt & Süt Ürünleri", r"\b(sut|yogurt|ayran|kefir|peynir|kasar|tereyag|kaymak|krema|labne|mozzarella|lor)\b"),
    ("Kahvaltılık", r"\b(zeytin|bal|recel|pekmez|tahin|helva|yumurta|fistik ezmesi)\b"),
    ("İçecek", r"\b(maden suyu|soda|kola|cola|gazoz|fanta|sprite|ice tea|meyve suyu|limonata|enerji icecegi|kahve|nescafe|espresso|filtre kahve|cay|turk kahvesi|bitki cayi)\b"),
    ("Ekmek & Pastane", r"\b(ekmek|lava[sş]|yufka|bazlama|simit|pogaca|acma|kruvasan|pasta|pastane|unlu mamul)\b"),
    ("Dondurulmuş Ürünler", r"\b(dondurulmus|dondurma|pizza|patates kroket|su boregi)\b"),
    ("Atıştırmalık & Şekerleme", r"\b(cikolata|biskuvi|gofret|cips|kraker|jelibon|sekerleme|lokum|sakiz|kuruyemis|findik|fistik|ceviz|badem|cerez|kek|bar)\b"),
    ("Bakliyat & Temel Gıda", r"\b(pirinc|bulgur|makarna|mercimek|nohut|fasulye|bakliyat|un|irmik|nisasta|salca|ketcap|mayonez|sos|baharat|tuz|toz seker|zeytinyagi|aycicek yagi|sivi yag|konserve|sirke|tursu)\b"),
    ("Temizlik", r"\b(deterjan|camasir suyu|bulasik|yumusatici|yuzey temizleyici|camasir|bulasik makinesi|wc temizleyici|kirec sokucu|sabun tozu)\b"),
    ("Kağıt Ürünleri", r"\b(tuvalet kagidi|kagit havlu|havlu kagit|pecete|mendil|rulo havlu)\b"),
    ("Kişisel Bakım & Kozmetik", r"\b(sampuan|dus jeli|dis macunu|dis fircasi|deodorant|parfum|kolonya|krem|losyon|makyaj|ruj|maskara|tirnak|kozmetik|sac boyasi|tras)\b"),
    ("Anne & Bebek", r"\b(bebek|emzik|biberon|bebek bezi|islak mendil|mama sandalyesi|puset)\b"),
    ("Evcil Hayvan", r"\b(kedi kumu|kedi mamasi|kopek mamasi|kopek tasmasi|kus yemi|akvaryum|evcil hayvan)\b"),
    ("Elektronik", r"\b(telefon|televizyon|tv|notebook|laptop|bilgisayar|tablet|kulaklik|sarj|powerbank|hoparlor|mouse|klavye|yazici|monitor|kamera|akilli saat|elektrikli supurge|blender|kahve makinesi)\b"),
    ("Giyim & Aksesuar", r"\b(corap|tisort|t shirt|pantolon|gomlek|kazak|hirk|mont|ceket|elbise|ayakkabi|terlik|canta|kemer|pijama|havlu|bornoz)\b"),
    ("Oyuncak & Hobi", r"\b(oyuncak|lego|puzzle|kirtasiye|boya kalemi|oyun hamuru|masa oyunu|hobi|kitap)\b"),
    ("Bahçe & Yapı Market", r"\b(matkap|tornavida|mengene|testere|civata|vida|boya|fircasi|hortum|bahce|sulama|alet seti|tamir|yapi market)\b"),
    ("Ev & Mutfak", r"\b(tencere|tava|tabak|bardak|kupa|termos|saklama kabi|saklama kabı|kesme tahtasi|bicak|catal|kasik|masa ortusu|nevresim|yastik|yorgan|aski|duzenleyici|mobilya|lamba|ampul|dekorasyon)\b"),
]


def infer_category(name):
    text = str(name or "").lower().translate(_CATEGORY_TRANSLATION)
    text = " ".join(re.findall(r"[a-z0-9]+", text))
    for category, pattern in CATEGORY_RULES:
        if re.search(pattern, text):
            return category
    return "Diğer"


def complete_categories(products):
    """Boş veya yalnızca kampanya tarihi içeren kategori alanlarını ürün adına göre doldur."""
    changed = False
    for product in products.values():
        current = str(product.get("cat") or "").strip()
        folded = current.lower().translate(_CATEGORY_TRANSLATION)
        if not current or re.match(r"^(aktuel|indirim)\b", folded):
            inferred = infer_category(product.get("name"))
            if inferred != current:
                product["cat"] = inferred
                changed = True
    return changed


def parse_file(path, market=None):
    """Veri dosyasını id -> ürün sözlüğü olarak okur."""
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    out = {}
    for row in d.get("products", []):
        p = dict(zip(d.get("fields", FIELDS), row)) if isinstance(row, list) else dict(row)
        m = p["id"].split(":")[0]
        if market and m != market:
            continue
        pre = d.get("prefix", {}).get(m, {})
        if isinstance(row, list):
            p["image"] = pre.get("image", "") + p["image"] if p.get("image") else ""
            p["url"] = pre.get("url", "") + p["url"] if p.get("url") else ""
        cats = d.get("cats", {}).get(m, [])
        cat = p.get("cat")
        p["cat"] = (cats[cat] if isinstance(cat, int) and cat < len(cats) else cat) or ""
        p["market"], p["in_stock"] = m, bool(p.get("in_stock"))
        out[p["id"]] = {k: p.get(k) for k in FIELDS + ["market"]}
    return out


def read_old(market):
    own = ROOT / "data" / f"{market}.json"
    return parse_file(own) if own.exists() else parse_file(ROOT / "data" / "products.json", market)


def write(market, products, updated):
    rows = sorted(products.values(), key=lambda p: p["id"])
    prefix = {}
    for f in ("image", "url"):
        vals = [p[f] for p in rows if p[f]]
        prefix[f] = os.path.commonprefix(vals) if len(vals) > 1 else ""
    cats = sorted({p.get("cat") or "" for p in rows})
    lines = [json.dumps(
        [p["id"], p["name"], p["price"], p["regular"], int(p["in_stock"]),
         p["image"][len(prefix["image"]):] if p["image"] else "",
         p["url"][len(prefix["url"]):] if p["url"] else "",
         cats.index(p.get("cat") or "")], ensure_ascii=False, separators=(",", ":")) for p in rows]
    head = json.dumps({"updated": updated, "market": market, "prefix": {market: prefix},
                       "cats": {market: cats}, "fields": FIELDS}, ensure_ascii=False)
    (ROOT / "data" / f"{market}.json").write_text(
        head[:-1] + ',"products":[\n' + ",\n".join(lines) + "\n]}\n", encoding="utf-8")


def data_updated(market):
    path = ROOT / "data" / f"{market}.json"
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("updated")
    except Exception:
        return None


def main():
    market, mode = sys.argv[1], sys.argv[2]
    fn = JOBS[(market, mode)]
    (ROOT / "data").mkdir(exist_ok=True)
    t0 = time.time()
    old, fresh, notes, state = read_old(market), {}, [], "tamam"
    previous_data_update = data_updated(market)
    complete = True
    try:
        fn(fresh, notes)
    except Stop as e:
        state = f"durduruldu: {e}"
    except Exception as e:
        state = f"hata: {e!r}"

    if mode == "full":
        if state != "tamam" or len(fresh) < 0.5 * len(old):
            notes.append(f"yeni sonuç eksik ({len(fresh)} ürün), eski veri ({len(old)} ürün) korundu")
            merged = dict(old)
            complete = False
        else:
            merged = fresh
    elif mode == "deals":
        merged = dict(old)
        for k, p in fresh.items():
            merged[k] = {**p, "cat": p.get("cat") or (old.get(k) or {}).get("cat") or ""}
        notes.append(f"{len(fresh)} indirimli ürün güncellendi")
    else:  # aktüel: liste her başarılı taramada baştan oluşturulur
        merged = fresh if (state == "tamam" and fresh) else dict(old)

    if state != "tamam":
        # 403/429 veya ağ hatasında kısmi sonuçları fiyat verisi gibi yayımlama.
        merged = dict(old)
        complete = False

    categories_changed = complete_categories(merged)
    attempted = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    data_file_exists = (ROOT / "data" / f"{market}.json").exists()
    has_new_prices = state == "tamam" and complete and bool(fresh)
    should_write = bool(merged) and (has_new_prices or categories_changed or not data_file_exists)
    last_data_update = previous_data_update
    if should_write:
        last_data_update = attempted if has_new_prices or not previous_data_update else previous_data_update
        write(market, merged, last_data_update)

    status = {
        "updated": attempted,
        "checked_at": attempted,
        "data_updated": last_data_update,
        "market": market,
        "mode": mode,
        "status": state,
        "complete": complete and state == "tamam",
        "found": len(fresh),
        "total": len(merged),
        "seconds": round(time.time() - t0),
        "notes": notes,
        "traffic": {h: {"requests": s["requests"], "megabytes": round(s["bytes"] / 1e6, 1), "errors": s["errors"]}
                    for h, s in STATS.items()},
        "errors": ERRORS,
    }
    (ROOT / "data" / f"status-{market}.json").write_text(
        json.dumps(status, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(status, ensure_ascii=False, indent=1)[:4000])

if __name__ == "__main__":
    main()

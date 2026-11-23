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
import math
import os
import pathlib
import re
import sys
import time
import unicodedata
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


class NotFound(Exception):
    """Kaynak 404 döndü: kategori/ürün kaldırılmış olabilir."""


def _fetch(url, accept):
    """İsteği nazik aralıklarla yap; geçici ağ/5xx hatalarını sınırlı sayıda dene."""
    retries = max(0, int(CFG.get("retry_attempts", 2)))
    backoff = max(1, int(CFG.get("retry_backoff_seconds", 5)))
    status, body, size = 0, "", 0
    for attempt in range(retries + 1):
        time.sleep(DELAY)
        req = urllib.request.Request(url, headers={
            "User-Agent": UA, "Accept": accept, "Accept-Language": "tr", "Accept-Encoding": "gzip"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
                size = len(raw)
                if r.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                status, body = r.status, raw.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            status, body, size = e.code, "", 0
        except Exception as e:
            status, body, size = 0, repr(e), 0
        # 403/429 ve kalıcı 4xx yanıtlarında yeniden deneme veya kısıt aşma yapılmaz.
        if status in (200, 404, 403, 429) or not (status == 0 or 500 <= status <= 599):
            return status, body, size, attempt + 1
        if attempt < retries:
            time.sleep(min(60, backoff * (attempt + 1)))
    return status, body, size, retries + 1


def allowed(url):
    """robots.txt okunamazsa veya yolu yasaklıysa taramayı durdurur."""
    u = urllib.parse.urlsplit(url)
    base = f"{u.scheme}://{u.netloc}"
    if base not in ROBOTS:
        status, body, _, _ = _fetch(base + "/robots.txt", "text/plain")
        if status != 200:
            ERRORS.append({"url": base + "/robots.txt", "status": status,
                           "detail": "robots.txt okunamadı; tarama durduruldu"})
            raise Stop(f"{base}: robots.txt alınamadı (HTTP {status})")
        rp = urllib.robotparser.RobotFileParser()
        rp.parse(body.splitlines())
        ROBOTS[base] = rp
    rp = ROBOTS[base]
    if not rp.can_fetch(UA, url):
        ERRORS.append({"url": url, "status": "robots.txt izin vermiyor"})
        raise Stop(f"robots.txt erişime izin vermiyor: {url}")
    return True


def get(url, accept="application/json"):
    host = urllib.parse.urlsplit(url).netloc
    st = STATS.setdefault(host, {"requests": 0, "bytes": 0, "errors": 0, "streak": 0, "retries": 0})
    if not allowed(url):
        ERRORS.append({"url": url, "status": "robots.txt izin vermiyor, atlandı"})
        return None, ""
    status, body, size, attempts = _fetch(url, accept)
    st["requests"] += attempts
    st["retries"] += max(0, attempts - 1)
    st["bytes"] += size
    if status == 200:
        st["errors"] += max(0, attempts - 1)
        st["streak"] = 0
        return status, body
    if status == 404:
        return status, ""
    st["errors"] += attempts
    st["streak"] += 1
    if len(ERRORS) < 50:
        ERRORS.append({"url": url, "status": status, "detail": body[:160] if status == 0 else ""})
    if status in (403, 429) or st["streak"] >= 3:
        raise Stop(f"{host}: durum {status}")
    return status, ""


# ---------- Migros ----------

def migros_promo(p):
    """Migros ürün kartındaki sepet/ürün kampanyası etiketlerini kaybetmeden çıkar."""
    found = []

    def add(value):
        if isinstance(value, str):
            value = re.sub(r"\s+", " ", value).strip()
            if value and value not in found:
                found.append(value)

    # Ürün sayfasında "2 Al 1 Öde" gibi gösterilen kampanyalar crmDiscountTags alanındadır;
    # bunların çoğu Migros'un "çoklu indirim" listesinde yer almaz, yalnızca tam taramada görülür.
    for tag in p.get("crmDiscountTags") or []:
        if isinstance(tag, dict):
            add(str(tag.get("tag") or ""))
    for badge in p.get("badges") or []:
        if not isinstance(badge, dict):
            continue
        name = str(badge.get("name") or "")
        value = badge.get("value")
        key = name.casefold()
        if name == "CROSS_PROMOTED" or re.search(r"basket|cart|sepet|discount|indirim", key, re.I):
            add(str(value or ""))
            if re.search(r"basket|cart|sepet", key, re.I) and isinstance(value, (int, float)) and 0 < value <= 100:
                add(f"Sepette %{value:g} indirimli")

    def walk(value, key=""):
        if isinstance(value, dict):
            for k, v in value.items():
                walk(v, str(k))
        elif isinstance(value, list):
            for v in value:
                walk(v, key)
        elif isinstance(value, str):
            if re.search(r"sepette.{0,40}%\s*\d{1,2}|%\s*\d{1,2}.{0,40}sepette", value, re.I):
                add(value)
        elif isinstance(value, (int, float)) and re.search(r"basket|cart|sepet", key, re.I) and 0 < value <= 100:
            add(f"Sepette %{value:g} indirimli")

    walk(p)
    return " · ".join(found)


MONEY = "Money kartlı fiyat"  # Migros'ta indirimli fiyat yalnızca Money üyelerine geçerliyse


def migros_item(p):
    img = ((p.get("images") or [{}])[0].get("urls") or {}).get("PRODUCT_DETAIL")
    asc = p.get("categoryAscendants") or []
    top = (asc[-1] if asc else p.get("category") or {}).get("name") or ""
    promo = migros_promo(p)
    shown, regular = p.get("shownPrice") or 0, p.get("regularPrice") or 0
    # loyaltyPromotionId: sitede "Money'siz fiyat / Money ile" diye gösterilen kart fiyatı.
    if p.get("loyaltyPromotionId") and shown < regular and MONEY not in promo:
        promo = " · ".join(x for x in (promo, MONEY) if x)
    return {
        "id": f"migros:{p.get('sku')}",
        "market": "migros",
        "name": p.get("name") or "",
        "price": shown / 100,
        "regular": regular / 100,
        "in_stock": p.get("status") == "IN_SALE",
        "image": img or "",
        "url": "https://www.migros.com.tr/" + (p.get("prettyName") or ""),
        "cat": top,
        "promo": promo,  # çoklu alım kampanyası: "2 Al 1 Öde", "2.si %70" gibi
    }


def migros(products, notes):
    c = CFG["migros"]
    covered_names, visited_slugs, crawled = set(), set(), set()
    page_cache = {}

    def page_of(slug, page):
        key = (slug, page)
        if key in page_cache:
            return page_cache[key]
        safe_slug = urllib.parse.quote(urllib.parse.unquote(slug), safe="-")
        status, body = get(f"https://www.migros.com.tr/rest/search/screens/{safe_slug}?sayfa={page}")
        if status == 404:
            raise NotFound(slug)
        if status != 200:
            raise Stop(f"Migros kategori isteği başarısız: HTTP {status} ({slug})")
        try:
            info = json.loads(body)["data"]["searchInfo"]
        except Exception:
            info = None
        # Boş sayfa önbelleğe yazılmaz: yoksa yeniden deneme siteye gitmeden aynı boş yanıtı okur.
        if info and info.get("storeProductInfos"):
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
            # Adres için görünen ad ("Meyve, Sebze") değil, bağlantı adı ("meyve-sebze-c-2") gerekir.
            top = (asc[-1] if asc else p.get("category") or {}).get("prettyName") or ""
            if top:
                votes[top] = votes.get(top, 0) + 1
        return max(votes, key=votes.get) if votes else None

    gaps = []

    def crawl(slug):
        page, pages, prev, miss = 1, 1, None, 0
        while page <= min(pages, c["max_pages"]):
            info = page_of(slug, page)
            items = (info or {}).get("storeProductInfos") or []
            # Ara sıra tek bir sayfa boş/yinelenen dönüyor (aynı sayfa dakikalar sonra normal geliyor):
            # artan aralıklarla iki kez yeniden dene; yine boşsa yalnızca o sayfayı atla ve sonraki
            # sayfayla devam et. Üst üste 3 sayfa boşsa kategoriyi bırak. Tarama sonunda "kısmi"
            # sayılır, böylece okunamayan ürünler katalogdan silinmez.
            for wait in (20, 60):
                if info and items and items[0].get("id") != prev:
                    break
                time.sleep(wait)
                info = page_of(slug, page)
                items = (info or {}).get("storeProductInfos") or []
            if not info or not items or items[0].get("id") == prev:
                gaps.append(f"{slug} s.{page}")
                miss += 1
                if miss >= 3 or page >= pages:
                    notes.append(f"{slug}: sayfa {page} boş döndü, kategorinin kalanı atlandı")
                    return
                notes.append(f"{slug}: sayfa {page} boş döndü, atlanıp devam edildi")
                page += 1
                continue
            miss = 0
            prev, pages = items[0].get("id"), info.get("pageCount", 1)
            if pages > c["max_pages"]:
                raise Stop(f"Migros sayfa sınırı aşıldı: {slug}, {pages} sayfa")
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
        if not info:
            raise Stop(f"Migros kategori yanıtı çözümlenemedi: {slug}")
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
    if status != 200:
        raise Stop(f"Migros kategori sitemap isteği başarısız: HTTP {status}")
    slugs = [urllib.parse.unquote(urllib.parse.urlsplit(html.unescape(u)).path.rstrip("/").rsplit("/", 1)[-1])
             for u in re.findall(r"<loc>(.*?)</loc>", body) if "-c-" in u]
    extra, gone = 0, []
    for slug in slugs:
        base_slug = slug.rsplit("-c-", 1)[0]
        if _category_key(base_slug) in covered_names or slug in visited_slugs:
            continue
        if extra >= c["max_discovery"]:
            raise Stop(f"kategori keşfi sınırı ({c['max_discovery']}) doldu; tam tarama doğrulanamadı")
        extra += 1
        try:
            visit(slug)
        except NotFound:
            # Site haritasında kalmış ama kaldırılmış kategori (ör. powerbank-c-12090).
            # Ürünleri başka kategoride zaten taranıyor; tüm gece taramasını düşürmez.
            # Taramanın güvenilirliğini okunan ürün oranı belirler (main: full_min_product_ratio);
            # yalnızca keşif denemelerinin yarısından fazlası 404 ise site düzeni değişmiş demektir.
            gone.append(slug)
            if len(gone) > 50 and len(gone) > 0.5 * extra:
                raise Stop(f"site haritası kategorilerinin çoğu 404 döndü ({len(gone)}/{extra}); site düzeni değişmiş olabilir")
    if gone:
        notes.append(f"site haritasındaki {len(gone)} kategori artık yok (404), atlandı: {', '.join(gone[:10])}")
    if gaps:
        raise Stop(f"{len(gaps)} kategori sayfası boş döndü ({', '.join(gaps[:5])}); okunan ürünler kısmi olarak yayımlanır")
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
            "promo": "",
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
            raise Stop(f"Şok kategorisi eksik/boş: {slug} ({why})")
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
    if page > max_pages and page <= pages:
        raise Stop(f"Şok sayfa sınırı aşıldı: {slug} ({pages} sayfa)")
    if pages > 1 and page <= pages:
        raise Stop(f"Şok taraması eksik: {slug}, {page - 1}/{pages} sayfa")
    notes.append(f"{slug}: sitede {total}, okunan {got}, {page - 1}/{pages} sayfa ({why})")


SOK_PROMOS = None  # {"sok:<no>": "kampanya başlığı"}; None = kampanya sayfası okunamadı


def sok_campaigns(notes):
    """Şok kampanyalar sayfasından ürün-kampanya eşlemesini okur (tek istek). Hata taramayı durdurmaz."""
    global SOK_PROMOS
    try:
        status, body = get("https://www.sokmarket.com.tr/" + CFG["sok"]["campaigns"], "text/html")
    except Stop:
        raise
    body = re.sub(r'"\]\)</script><script>self\.__next_f\.push\(\[1,"', "", body).replace('\\"', '"')
    found = {}
    for title, skus in re.findall(r'"campaignId":"[^"]+","campaignUrl":"[^"]*","title":"([^"]*)"(?:(?!"campaignId").)*?"skuIds":\[([^\]]*)\]', body, re.S):
        title = " ".join(html.unescape(title).split())
        for sku in re.findall(r'"(\d+)\.\d+"', skus):
            found.setdefault("sok:" + sku, title)
    if status == 200 and found:
        SOK_PROMOS = found
        notes.append(f"kampanyalar: {len(found)} ürün")
    else:
        notes.append(f"kampanya sayfası okunamadı (durum {status}); eski kampanya bilgisi korundu")


def sok(products, notes):
    sok_campaigns(notes)
    c = CFG["sok"]
    for slug, cat in c["categories"].items():
        sok_pages(slug, cat, products, notes, c["max_pages"])
    if not products:
        raise Stop("Şok tam taraması sıfır ürün döndürdü")


def sok_deals(products, notes):
    sok_campaigns(notes)
    sok_pages(CFG["sok"]["deals"], "", products, notes, CFG["sok"]["max_pages"])


def migros_deals(products, notes):
    c, page, pages, prev = CFG["migros"], 1, 1, None
    for slug in c["deals"]:
        page, pages, prev = 1, 1, None
        while page <= min(pages, c["max_pages"]):
            safe_slug = urllib.parse.quote(urllib.parse.unquote(slug), safe="-")
            status, body = get(f"https://www.migros.com.tr/rest/search/screens/{safe_slug}?sayfa={page}")
            if status != 200:
                raise Stop(f"Migros indirim isteği başarısız: HTTP {status}")
            try:
                info = json.loads(body)["data"]["searchInfo"]
            except Exception as e:
                raise Stop(f"Migros indirim yanıtı çözümlenemedi: {e!r}")
            items = info.get("storeProductInfos") or []
            if not items or items[0].get("id") == prev:
                raise Stop(f"Migros indirim sayfası eksik/boş: {slug}, sayfa {page}")
            prev, pages = items[0].get("id"), info.get("pageCount", 1)
            for p in items:
                products.setdefault(f"migros:{p.get('sku')}", migros_item(p))
            page += 1
        notes.append(f"{slug}: {page - 1}/{pages} sayfa")


# ---------- BİM aktüel ----------

_BIM_NUM = r'<div class="text quantify">\s*([\d.]+)\s*,?\s*(\d{0,2})\s*</div>(?:\s*<div class="kusurArea">\s*<span class="number">\s*(\d{1,2})\s*</span>)?'


def _bim_num(m):
    cents = m.group(2) or m.group(3) or "00"
    return float(m.group(1).replace(".", "") + "." + cents.ljust(2, "0"))


def bim_price(blk):
    """BİM fiyat alanı: indirimli üründe üstü çizili eski fiyat (CountButton strikethrough)
    ve satış fiyatı (gButton) ayrı yazılır. Döner: (satış fiyatı, normal fiyat) veya None."""
    area = blk[blk.find('class="priceArea"'):] if 'class="priceArea"' in blk else blk
    sale = re.search(r'class="gButton triangle"[^>]*>\s*' + _BIM_NUM, area)
    if not sale:
        return None
    price = _bim_num(sale)
    old = re.search(r'strikethrough"[^>]*>\s*' + _BIM_NUM, area)
    regular = _bim_num(old) if old else price
    return price, max(regular, price)


def bim_cards(body, label):
    # Her ürün kutusu '<div class="product ...">' ile başlar; kutuda aynı adrese giden iki bağlantı
    # (görsel ve fiyat düğmesi) vardır, bu yüzden bağlantıdan değil kutudan bölünür.
    out, parts = {}, re.split(r'(?=<div class="product[ "])', body)
    for blk in parts[1:]:
        m = re.search(r'<a[^>]+href="(/aktuel-urunler/([^"/]+)/aktuel\.aspx)"', blk[:3000])
        blk = blk[:6000]
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
        regular = value
        structured = bim_price(blk)
        if structured:
            value, regular = structured
        out["bim:" + m.group(2)] = {
            "id": "bim:" + m.group(2), "market": "bim", "name": name, "price": value, "regular": regular,
            "in_stock": True, "image": src if src.startswith("https://") else "",
            "url": "https://www.bim.com.tr" + m.group(1),
            "cat": ("İndirim · " if re.match(r"\d+\s*-\s*\d+", label) else "Aktüel · ") + label,
            "promo": ("İndirim · " if re.match(r"\d+\s*-\s*\d+", label) else "Aktüel · ") + label,
        }
    return out


def bim(products, notes):
    base = "https://www.bim.com.tr/Categories/100/aktuel-urunler.aspx"
    status, body = get(base, "text/html")
    if status != 200:
        raise Stop(f"BİM aktüel ana sayfa isteği başarısız: HTTP {status}")
    dates = re.findall(r'href="(/categories/100/aktuel-urunler\.aspx\?Bim_AktuelTarihKey=(\d+))"[^>]*>(.*?)</a>', body, re.S | re.I)
    if not dates:
        raise Stop("BİM aktüel sayfasında kampanya tarihleri bulunamadı")
    seen = set()
    for path, key, label in dates[: CFG["bim"]["max_dates"]]:
        if key in seen:
            continue
        seen.add(key)
        label = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", label)).split())
        st, b = get("https://www.bim.com.tr" + path, "text/html")
        if st != 200:
            raise Stop(f"BİM kampanya sayfası başarısız: HTTP {st} ({label})")
        cards = bim_cards(b, label)
        if not cards:
            raise Stop(f"BİM kampanya sayfasında ürün ayıklanamadı: {label}")
        for k, v in cards.items():
            products.setdefault(k, v)
        notes.append(f"{label}: {len(cards)} ürün")
    if not products:
        raise Stop("BİM aktüel taraması sıfır ürün döndürdü")


# ---------- Afişler / kampanya görselleri ----------
# Marketlerin herkese açık yayımladığı afiş ve kampanya görselleri. Görseller indirilmez;
# yalnızca marketin kendi adresleri (görsel + kaynak sayfa) listelenir, arayüz bağlantı verir.

def bim_posters():
    url = "https://www.bim.com.tr/Categories/680/afisler.aspx"
    status, body = get(url, "text/html")
    if status != 200:
        raise Stop(f"BİM afiş sayfası başarısız: HTTP {status}")
    out = []
    parts = re.split(r"(?=<div[^>]+class=\"grup(\d) afis=)", body)
    for blk in parts:
        m = re.match(r"<div[^>]+class=\"grup(\d) afis='?(\d+)", blk)
        if not m:
            continue
        group = {"1": "Aktüel", "2": "İndirim"}.get(m.group(1), "Afiş")
        label = re.search(r'class="subTabArea[^"]*">\s*<span class="text">\s*(.*?)\s*</span>', blk, re.S)
        label = " ".join(html.unescape(label.group(1)).split()) if label else ""
        bigs = re.findall(r'data-bigimg="(https://cdn\d?\.bim\.com\.tr/uploads/afisler/[^"]+)"', blk)
        bigs += re.findall(r'href="(https://cdn\d?\.bim\.com\.tr/uploads/afisler/[^"]+)" class="fancyboxImage"', blk)
        seen = []
        for big in bigs:
            if big not in seen:
                seen.append(big)
        for i, big in enumerate(seen):
            thumb = big.rsplit("/", 1)[0] + "/k_" + big.rsplit("/", 1)[1]
            out.append({"market": "bim", "id": f"bim:{m.group(2)}:{i}", "title": f"BİM {group} · {label}".strip(" ·"),
                        "group": group, "label": label, "image": big, "thumb": thumb, "url": url})
    if not out:
        raise Stop("BİM afiş sayfasında afiş bulunamadı")
    return out


def sok_posters():
    url = "https://www.sokmarket.com.tr/" + CFG["sok"]["campaigns"]
    status, body = get(url, "text/html")
    if status != 200:
        raise Stop(f"Şok kampanya sayfası başarısız: HTTP {status}")
    flat = _flight(body)
    out, seen = [], set()
    for m in re.finditer(r'\{"campaignId":"([^"]+)","campaignUrl":"([^"]*)","title":"([^"]*)","description":"([^"]*)","images":\[(.*?)\]', flat):
        cid, path, title, desc, imgs = m.groups()
        img = re.search(r'"path":"([^"]+)","host":"(https://images\.ceptesok\.com)"', imgs)
        if not img or cid in seen:
            continue
        seen.add(cid)
        # Kampanyadaki ürünler: aynı nesnenin "skuIds" alanı (ürün numaraları; katalogda "sok:<no>")
        rest = flat[m.end(): m.end() + 20000]
        rest = rest[: rest.find('"campaignId"')] if '"campaignId"' in rest else rest
        sku = re.search(r'"skuIds":\[([^\]]*)\]', rest)
        ids = []
        for no in re.findall(r'"(\d+)(?:\.\d+)?"', sku.group(1) if sku else ""):  # "1025.1" → ürün 1025
            if f"sok:{no}" not in ids:
                ids.append(f"sok:{no}")
        out.append({"market": "sok", "id": f"sok:{cid}", "title": " ".join(html.unescape(title).split()), "ids": ids,
                    "group": "Kampanya", "label": " ".join(html.unescape(desc).split()),
                    "image": img.group(2) + "/" + img.group(1).lstrip("/"), "thumb": "",
                    "url": "https://www.sokmarket.com.tr/" + path if re.fullmatch(r"[a-z0-9-]+", path) else url})
    if not out:
        raise Stop("Şok kampanya sayfasında görsel bulunamadı")
    return out


MIGROS_BANNERS = ("main-page-slider", "main-page-under-slider")  # sitenin ana sayfa kampanya görselleri
MIGROS_CAMPAIGN_PAGES = 10  # kampanya başına en çok 10 sayfa (300 ürün); kalanı için Migros'a bağlantı


def migros_posters():
    """Migros ana sayfasındaki kampanya görselleri ve her kampanyanın ürün listesi.

    Ana sayfa kaydırmalı görselleri herkese açık /rest/banners/<yer> yanıtında; her görselin
    bağlantısı bir ürün listesi (".../<ad>-l-<hex>"). Liste, kategori taramasında kullanılan
    /rest/search/screens/<ad> yanıtıyla okunur; başlık ve kampanya metni listenin metaInfo alanındadır.
    """
    banners, seen_slugs = [], set()
    for place in MIGROS_BANNERS:
        status, body = get(f"https://www.migros.com.tr/rest/banners/{place}")
        if status != 200:
            raise Stop(f"Migros kampanya görselleri alınamadı: HTTP {status} ({place})")
        try:
            data = json.loads(body).get("data") or []
        except ValueError:
            raise Stop(f"Migros kampanya görseli yanıtı çözümlenemedi ({place})")
        for b in data:
            link = str(b.get("callToActionUrl") or "")
            m = re.search(r"(?:^|/)([a-z0-9-]+-l-[0-9a-f]+)/?$", link)
            img = str(b.get("imageUrl") or "")
            if not m or not img.startswith("https://images.migrosone.com/") or m.group(1) in seen_slugs:
                continue
            seen_slugs.add(m.group(1))
            banners.append((b, m.group(1), link))
    if not banners:
        raise Stop("Migros ana sayfasında kampanya görseli bulunamadı")
    items, products, titles = [], {}, set()
    now = int(time.time())
    for b, slug, link in banners:
        ids, meta, hits, page, pages = [], {}, 0, 1, 1
        while page <= min(pages, MIGROS_CAMPAIGN_PAGES):
            status, body = get(f"https://www.migros.com.tr/rest/search/screens/{slug}?sayfa={page}")
            if status != 200:
                break  # elektronik gibi ayrı mağaza listeleri burada açılmaz: yalnızca görsel + bağlantı
            try:
                d = json.loads(body)["data"]
                info = d["searchInfo"]
            except (ValueError, KeyError, TypeError):
                break
            meta = d.get("metaInfo") or meta
            pages, hits = info.get("pageCount") or 1, info.get("hitCount") or 0
            for x in info.get("storeProductInfos") or []:
                it = migros_item(x)
                if it["price"] > 0 and it["name"]:
                    it["seen"] = now
                    products[it["id"]] = it
                    if it["id"] not in ids:
                        ids.append(it["id"])
            page += 1
        title = " ".join(str(meta.get("title") or b.get("identifier") or "Migros kampanyası").split())
        desc = " ".join(str(meta.get("description") or "").split())
        when = re.match(r"(\d{1,2}(?: \w+)?\s*-\s*\d{1,2} \w+(?: \d{4})?) tarihleri arasında", desc)
        key = (title.casefold(), hits)
        if key in titles:  # aynı kampanya iki görselle yayımlanabiliyor
            continue
        titles.add(key)
        items.append({"market": "migros", "id": f"migros:{slug}", "slug": slug, "title": title,
                      "group": "Kampanya", "label": when.group(1) if when else "", "desc": desc[:600],
                      "image": b["imageUrl"], "thumb": "", "url": "https://www.migros.com.tr" + (link if link.startswith("/") else "/" + link),
                      "count": hits, "ids": ids})
    return items, products


POSTERS = {"bim": bim_posters, "sok": sok_posters, "migros": migros_posters}


def posters_main(market):
    """collect.py posters <market>: data/posters-<market>.json yazar; hata olursa eskisi korunur."""
    path = ROOT / "data" / f"posters-{market}.json"
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    try:
        items = POSTERS[market]()
    except Stop as e:
        print(f"{market} afişleri alınamadı: {e}; önceki dosya korunuyor")
        raise SystemExit(1)
    if market == "migros":
        # Kampanya ürünleri, ana veriyle aynı sıkıştırılmış biçimde aynı dosyaya yazılır.
        items, products = items
        d = json.loads(encode(market, products, now)) if products else {"updated": now, "market": market}
        d["items"] = items
        atomic_write(path, json.dumps(d, ensure_ascii=False, separators=(",", ":")) + "\n")
        print(f"{market}: {len(items)} kampanya, {len(products)} ürün yazıldı")
        return
    old = {}
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    if old.get("items") == items:
        print(f"{market}: afişler değişmedi ({len(items)})")
        return
    atomic_write(path, json.dumps({"updated": now, "market": market, "items": items},
                                  ensure_ascii=False, indent=1) + "\n")
    print(f"{market}: {len(items)} afiş yazıldı")


# ---------- Tek ürün sorgusu ----------
# "Fiyatı Güncelle" talepleri için: bütün kataloğu taramadan yalnızca hedef ürünü okur.
# Her fonksiyon {"name","price","regular","in_stock","promo"?, "image"?, "source"} döner;
# ürün bulunamazsa NotFound, kaynak yanıtı çözümlenemezse Stop yükseltir.

def _flight(body):
    """Next.js akış verisindeki kaçışlı JSON parçalarını tek metne çevirir."""
    return re.sub(r'"\]\)</script><script>self\.__next_f\.push\(\[1,"', "", body).replace('\\"', '"')


def migros_one(product):
    sku = product["id"].split(":", 1)[1]
    if not sku.isdigit():
        raise Stop("Migros ürün kimliği sayısal değil")
    # Mağaza ürün kimliği = 20000000000000 + SKU (ürün adresindeki "-p-<hex>" de aynı sayıdır).
    store_product_id = 20000000000000 + int(sku)
    url = f"https://www.migros.com.tr/rest/products/screens/{store_product_id}"
    status, body = get(url)
    if status == 404:
        raise NotFound(product["id"])
    if status != 200:
        raise Stop(f"Migros ürün isteği başarısız: HTTP {status}")
    try:
        data = json.loads(body)
    except ValueError:
        raise Stop("Migros ürün yanıtı JSON değil")
    if not data.get("successful", True):
        raise NotFound(product["id"])
    dto = (data.get("data") or {}).get("storeProductInfoDTO") or {}
    if str(dto.get("sku") or "") != sku:
        raise NotFound(product["id"])
    item = migros_item(dto)
    item["in_stock"] = dto.get("status") == "IN_SALE" and dto.get("saleable", True) is not False
    item["source"] = url
    return item


def sok_one(product):
    pid = product["id"].split(":", 1)[1]
    url = str(product.get("url") or "")
    if not re.fullmatch(r"https://www\.sokmarket\.com\.tr/[a-z0-9-]+-p-" + re.escape(pid), url):
        raise Stop("Şok ürün adresi beklenen biçimde değil")
    status, body = get(url, "text/html")
    if status == 404:
        raise NotFound(product["id"])
    if status != 200:
        raise Stop(f"Şok ürün sayfası başarısız: HTTP {status}")
    flat = _flight(body)
    variant = None
    for m in re.finditer(r'"initialVariant":', flat):
        try:
            obj, _ = json.JSONDecoder().raw_decode(flat, m.end())
        except ValueError:
            continue
        if isinstance(obj, dict) and str(obj.get("id", "")).split(".")[0] == pid:
            variant = obj
            break
    if not variant:
        raise NotFound(product["id"])
    prices = variant.get("prices") or {}
    original = (prices.get("original") or {}).get("value")
    discounted = (prices.get("discounted") or {}).get("value")
    price = discounted if discounted is not None else original
    if price is None:
        raise Stop("Şok ürün sayfasında fiyat yok")
    name = re.search(r'\{"id":"' + re.escape(pid) + r'","name":"([^"]+)"', flat)
    return {
        "name": html.unescape(name.group(1)).strip() if name else "",
        "price": float(price),
        "regular": float(max(v for v in (original, price) if v is not None)),
        "in_stock": bool(variant.get("hasStock")),
        "source": url,
    }


def bim_one(product):
    slug = product["id"].split(":", 1)[1]
    url = str(product.get("url") or "")
    if url != f"https://www.bim.com.tr/aktuel-urunler/{slug}/aktuel.aspx":
        raise Stop("BİM ürün adresi beklenen biçimde değil")
    status, body = get(url, "text/html")
    if status == 404:
        raise NotFound(product["id"])
    if status != 200:
        raise Stop(f"BİM ürün sayfası başarısız: HTTP {status}")
    i = body.find('class="productDetailPage"')
    if i < 0:
        raise NotFound(product["id"])
    blk = body[i:i + 8000]
    title = re.search(r'<h2 class="title">\s*(.*?)\s*</h2>', blk, re.S)
    prices = bim_price(blk)
    if not title or not prices:
        raise Stop("BİM ürün sayfasında ad veya fiyat bulunamadı")
    price, regular = prices
    return {
        "name": " ".join(html.unescape(re.sub(r"<[^>]+>", " ", title.group(1))).split()),
        "price": price,
        "regular": regular,
        "in_stock": True,  # BİM stok bilgisi yayımlamaz
        "source": url,
    }


ONE = {"migros": migros_one, "sok": sok_one, "bim": bim_one}


# ---------- Çıktı ----------

# "seen": ürün fiyatının kaynaktan en son doğrulandığı an (Unix saniye, UTC).
# Eski dosyalarda bu sütun yoktur; okuyucular eksik sütunu None kabul eder.
FIELDS = ["id", "name", "price", "regular", "in_stock", "image", "url", "cat", "promo", "seen"]
HOSTS = {"migros": "https://www.migros.com.tr/", "sok": "https://www.sokmarket.com.tr/", "bim": "https://www.bim.com.tr/"}
ID_RE = {"migros": r"migros:\d{4,12}", "sok": r"sok:\d{1,12}", "bim": r"bim:[A-Za-z0-9_.-]{1,160}"}
JOBS = {
    ("migros", "full"): migros, ("migros", "deals"): migros_deals,
    ("sok", "full"): sok, ("sok", "deals"): sok_deals,
    ("bim", "aktuel"): bim,
}


# ---------- Kategori tamamlama ----------

def _fold_tr(value):
    """Türkçe metni aksansız ASCII karşılaştırma biçimine getirir."""
    value = unicodedata.normalize("NFKD", str(value or "").casefold())
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return value.replace("ı", "i")


def _category_key(value):
    return re.sub(r"[^a-z0-9]+", "-", _fold_tr(value)).strip("-")


CATEGORY_RULES = [
    ("Meyve & Sebze", r"\b(elma|armut|muz|portakal|mandalina|limon|greyfurt|uzum|cilek|kiraz|visne|seftali|kayisi|erik|karpuz|kavun|bogurtlen|ahududu|domates|salatalik|biber|patlican|kabak|patates|sogan|sarimsak|havu[cç]|marul|maydanoz|roka|ispanak|brokoli|karnabahar|lahana|mantar|avokado)\b"),
    ("Et, Tavuk & Şarküteri", r"\b(dana|kuzu|tavuk|hindi|sucuk|salam|sosis|pastirma|kiyma|kofte|biftek|antrikot|pirzola|balik|somon|ton baligi|karides|midye)\b"),
    ("Süt & Süt Ürünleri", r"\b(sut|yogurt|ayran|kefir|peynir|kasar|tereyag|kaymak|krema|kremsos|quark|milkshake|labne|mozzarella|lor)\b"),
    ("Kahvaltılık", r"\b(zeytin|bal|recel|pekmez|tahin|helva|yumurta|fistik ezmesi|margarin)\b"),
    ("İçecek", r"\b(maden suyu|soda|kola|cola|gazoz|fanta|sprite|ice tea|meyve suyu|limonata|enerji icecegi|kahve|nescafe|espresso|filtre kahve|cay|turk kahvesi|bitki cayi)\b"),
    ("Ekmek & Pastane", r"\b(ekmek|lava[sş]|yufka|bazlama|simit|pogaca|acma|kruvasan|pasta|pastane|unlu mamul)\b"),
    ("Dondurulmuş Ürünler", r"\b(dondurulmus|dondurma|pizza|patates kroket|su boregi)\b"),
    ("Atıştırmalık & Şekerleme", r"\b(cikolata|biskuvi|gofret|cips|kraker|jelibon|sekerleme|softbons|bonbon|lokum|sakiz|kuruyemis|findik|fistik|ceviz|badem|cerez|kek|kurabiye|granola|pankek|bar)\b"),
    ("Bakliyat & Temel Gıda", r"\b(pirinc|bulgur|makarna|eriste|mercimek|nohut|fasulye|bakliyat|un|irmik|galeta unu|nisasta|salca|ketcap|mayonez|sos|baharat|tuz|toz seker|zeytinyagi|aycicek yagi|sivi yag|konserv\w*|corba|puding|kakao|sirke|tursu)\b"),
    ("Temizlik", r"\b(deterjan|camasir suyu|bulasik|yumusatici|yuzey temizleyici|cam temizleyici|camsil|cam sil|camasir|bulasik makinesi|wc temizleyici|kirec sokucu|sabun tozu)\b"),
    ("Kağıt Ürünleri", r"\b(tuvalet kagidi|kagit havlu|havlu kagit|pecete|mendil\w*|rulo havlu)\b"),
    ("Spor & Takviye", r"\b(kreatin|kolajen|protein tozu|whey|bcaa|takviye edici gida|multivitamin|vitamin)\b"),
    ("Kişisel Bakım & Kozmetik", r"\b(sampuan|dus jeli|dus kopugu|bakim seti|tiras|dis macunu|dis fircasi|deodorant|parfum|kolonya|krem|losyon|makyaj|ruj|gloss|dudak|balm|parlatici|maskara|tirnak|kozmetik|sac boyasi|fon suyu|epilator|epilasyon|tirash|tras|hijyenik ped|gunluk ped|molped|dermokil|yuz maskesi|goz alti|kirpik kivirici|sabun)\b"),
    ("Anne & Bebek", r"\b(bebek|emzik|biberon|bebek bezi|islak mendil|mama sandalyesi|puset)\b"),
    ("Evcil Hayvan", r"\b(kedi kumu|kedi mamasi|kopek mamasi|kopek tasmasi|kus yemi|akvaryum|evcil hayvan)\b"),
    ("Elektronik", r"\b(telefon|televizyon|tv|notebook|laptop|bilgisayar|oyun bilgisayari|tablet|kulaklik|sarj|powerbank|hoparlor|speaker|mouse|klavye|yazici|monitor|kamera|akilli saat|elektrikli supurge|supurge|blender|kahve makinesi|radyator|isitici|fanli isitici|buharli utu|utu|kettle|ketil|dograyici|aksiyon kamera|elektrikli kirpik)\b"),
    ("Giyim & Aksesuar", r"\b(corap|uyku corabi|bere|boxer|slip|fanila|esofman|sweat|polar|bot|tisort|t shirt|pantolon|gomlek|kazak|hirk|mont|ceket|elbise|ayakkabi|terlik|canta|kemer|pijama|havlu|bornoz|kol saati|saat)\b"),
    ("Oyuncak & Hobi", r"\b(oyuncak|oyun\w*|lego|puzzle|kirtasiye|boya kalemi|boyama|oyun hamuru|masa oyunu|kutu oyunu|bowling|pelus|barbie|dollhouse|anahtarlik|araba\w*|arabalar|is makineleri|is araclari|cek birak|denge|blok|doktor seti|balon|kitap\w*|kalem|mezura|dikis seti|dikis)\b"),
    ("Bahçe & Yapı Market", r"\b(matkap|tornavida|mengene|testere|civata|vida|boya|fircasi|hortum|bahce|sulama|alet seti|tamir|yapi market)\b"),
    ("Otomotiv & Aksesuar", r"\b(oto cam suyu|antifriz|silecek suyu|motor yagi|arac ici|arac kokusu|oto aksesuar)\b"),
    ("Ev & Mutfak", r"\b(tencere|tava|tabak|bardak|kupa|termos|saklama kabi|saklama kutusu|kesme tahtasi|bicak|catal|kasik|masa ortusu|nevresim|carsaf|yastik|yorgan|aski|duzenleyici|organizer|mobilya|gardrop|gardirop|dolap|kiler|komodin|vestiyer|koltuk|baza|yatak|masa|sehpa|raf|porselen|yemek takimi|tepsi|sunumluk|kepce|mutfak gereci|sabunluk|fircalik|baharatlik|kavanoz|kirli sepeti|bambu|banyo seti|banyo dolabi|banyo paspasi|paspas|banyo taburesi|tabanlik|valiz|hamur legeni|sicak su torbasi|oda kokusu|cam kase|kase|kase seti|borcam|firin kabi|emaye|bakrac|sosluk|badya|caydanlik|ma[sş]a|bula[sş]iklik|firin tepsi|tepsi seti|havlu|bornoz|semsiye|lamba|ampul|dekorasyon|yemek takimi)\b"),
]


def infer_category(name):
    text = " ".join(re.findall(r"[a-z0-9]+", _fold_tr(name)))
    for category, pattern in CATEGORY_RULES:
        if re.search(pattern, text):
            return category
    return "Diğer"


def complete_categories(products):
    """Boş veya yalnızca kampanya tarihi içeren kategori alanlarını ürün adına göre doldur."""
    changed = False
    for product in products.values():
        current = str(product.get("cat") or "").strip()
        folded = _fold_tr(current)
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
        p["promo"] = p.get("promo") or ""
        p["seen"] = p.get("seen") if isinstance(p.get("seen"), int) else None
        out[p["id"]] = {k: p.get(k) for k in FIELDS + ["market"]}
    return out


def read_old(market):
    return parse_file(ROOT / "data" / f"{market}.json")


def iso_to_ts(value):
    """ISO 8601 zaman damgasını Unix saniyeye çevirir; geçersizse None."""
    try:
        dt = datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return int(dt.timestamp())


def validate_products(market, products):
    """Yayımlanmadan önce kayıtları denetler.

    Döner: (temiz kayıtlar, sorun sayaçları). Geçersiz kayıt yayımlanmaz; normal fiyatı
    güncel fiyattan düşük olan veya şüpheli derecede yüksek indirim gösteren kayıtlarda
    indirim üretilmez (normal fiyat = güncel fiyat).
    """
    issues = {"missing_id": 0, "bad_id": 0, "missing_name": 0, "bad_price": 0,
              "regular_below_price": 0, "suspicious_discount": 0, "bad_url": 0}
    clean = {}
    id_re = re.compile(ID_RE.get(market, r".+") + r"\Z")
    for key, raw in products.items():
        p = dict(raw)
        pid = str(p.get("id") or key or "")
        if not pid:
            issues["missing_id"] += 1
            continue
        if not id_re.match(pid) or pid != key:
            issues["bad_id"] += 1
            continue
        if not str(p.get("name") or "").strip():
            issues["missing_name"] += 1
            continue
        try:
            price = float(p.get("price"))
            regular = float(p.get("regular") if p.get("regular") not in (None, "") else price)
        except (TypeError, ValueError):
            issues["bad_price"] += 1
            continue
        if not (math.isfinite(price) and math.isfinite(regular)) or price <= 0 or price > 1_000_000:
            issues["bad_price"] += 1
            continue
        if regular < price:
            issues["regular_below_price"] += 1
            regular = price
        elif regular > price * 10:  # %90'dan büyük indirim: büyük olasılıkla hatalı normal fiyat
            issues["suspicious_discount"] += 1
            regular = price
        url = str(p.get("url") or "")
        if url and not url.startswith(HOSTS.get(market, "https://")):
            issues["bad_url"] += 1
            url = ""
        p.update(id=pid, name=" ".join(str(p["name"]).split()), price=round(price, 2),
                 regular=round(regular, 2), url=url, in_stock=bool(p.get("in_stock")))
        clean[pid] = p
    return clean, issues


def encode(market, products, updated):
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
         cats.index(p.get("cat") or ""), p.get("promo") or "",
         p.get("seen") if isinstance(p.get("seen"), int) else None],
        ensure_ascii=False, separators=(",", ":")) for p in rows]
    head = json.dumps({"updated": updated, "market": market, "prefix": {market: prefix},
                       "cats": {market: cats}, "fields": FIELDS}, ensure_ascii=False)
    return head[:-1] + ',"products":[\n' + ",\n".join(lines) + "\n]}\n"


def atomic_write(path, text):
    """Geçici dosyaya yaz, JSON olarak doğrula, sonra tek adımda yerine koy."""
    path = pathlib.Path(path)
    json.loads(text)  # bozuk JSON asla yayımlanmaz
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def write(market, products, updated, path=None):
    text = encode(market, products, updated)
    if not json.loads(text).get("products"):
        raise ValueError("boş ürün listesi yazılmaz")
    atomic_write(path or ROOT / "data" / f"{market}.json", text)


def data_updated(market):
    path = ROOT / "data" / f"{market}.json"
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("updated")
    except Exception:
        return None


def category_quality(products):
    """Kategori dağılımını ve sınıflandırma boşluklarını ölç."""
    counts = {}
    empty = 0
    campaign_only = 0
    for product in products.values():
        category = str(product.get("cat") or "").strip()
        if not category:
            empty += 1
        if re.match(r"^(aktuel|indirim)\\s*[·:-]?\\s*\\d", _fold_tr(category)):
            campaign_only += 1
        counts[category or "(boş)"] = counts.get(category or "(boş)", 0) + 1
    total = len(products)
    other = counts.get("Diğer", 0) + counts.get("diger", 0)
    return {
        "category_count": len(counts),
        "empty_category_count": empty,
        "campaign_date_category_count": campaign_only,
        "other_count": other,
        "other_ratio": round(other / total, 4) if total else 0.0,
        "category_counts": counts,
    }


def main():
    if sys.argv[1] == "posters":
        return posters_main(sys.argv[2])
    market, mode = sys.argv[1], sys.argv[2]
    fn = JOBS[(market, mode)]
    (ROOT / "data").mkdir(exist_ok=True)
    t0 = time.time()
    started = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    old, fresh, notes, state = read_old(market), {}, [], "tamam"
    previous_data_update = data_updated(market)
    # Eski dosyalarda ürün bazlı doğrulama zamanı yoksa dosyanın güncellenme zamanı kullanılır.
    fallback_seen = iso_to_ts(previous_data_update)
    for p in old.values():
        if p.get("seen") is None:
            p["seen"] = fallback_seen
    status_path = ROOT / "data" / f"status-{market}.json"
    try:
        previous_status = json.loads(status_path.read_text(encoding="utf-8"))
    except Exception:
        previous_status = {}
    previous_quality = previous_status.get("quality") or {}
    complete = True
    try:
        fn(fresh, notes)
    except Stop as e:
        state = f"durduruldu: {e}"
    except NotFound as e:
        state = f"durduruldu: kaynak 404 döndü ({e})"
    except Exception as e:
        state = f"hata: {e!r}"

    # Kaynaktan gelen kayıtlar yayımlanmadan önce denetlenir; geçersiz kayıt eski haliyle kalır.
    fresh, invalid = validate_products(market, fresh)
    invalid_total = sum(invalid.values()) - invalid["regular_below_price"] - invalid["suspicious_discount"]
    if any(invalid.values()):
        notes.append("veri denetimi: " + ", ".join(f"{k}={v}" for k, v in invalid.items() if v))
    now_ts = int(time.time())
    for p in fresh.values():
        p["seen"] = now_ts

    if state == "tamam" and not fresh:
        state = "hata: tarama sıfır ürün döndürdü"

    quality_cfg = CFG.get("quality", {})
    min_full_ratio = float(quality_cfg.get("full_min_product_ratio", 0.70))
    if mode == "full":
        if state != "tamam" or (old and len(fresh) < min_full_ratio * len(old)):
            if state == "tamam":
                state = f"eksik: {len(fresh)}/{len(old)} ürün; tam tarama eşiği %{min_full_ratio * 100:.0f}"
            notes.append(f"yeni sonuç eksik ({len(fresh)} ürün), eski veri ({len(old)} ürün) korundu")
            merged = dict(old)
            complete = False
        else:
            merged = fresh
    elif mode == "deals":
        merged = dict(old)
        for k, p in fresh.items():
            merged[k] = {**p, "cat": p.get("cat") or (old.get(k) or {}).get("cat") or ""}
            if market == "sok" and not p.get("promo") and (old.get(k) or {}).get("promo"):
                merged[k]["promo"] = old[k]["promo"]  # kampanya eşlemesi aşağıda yeniden uygulanır
        notes.append(f"{len(fresh)} indirimli ürün güncellendi")
    else:
        min_aktuel_ratio = float(quality_cfg.get("aktuel_min_product_ratio", 0.50))
        if state == "tamam" and old and len(fresh) < min_aktuel_ratio * len(old):
            state = f"eksik: {len(fresh)}/{len(old)} ürün; aktüel tarama eşiği %{min_aktuel_ratio * 100:.0f}"
            notes.append(f"aktüel sonuç şüpheli derecede küçük ({len(fresh)} ürün), eski veri ({len(old)} ürün) korundu")
            merged = dict(old)
            complete = False
        else:
            merged = fresh if (state == "tamam" and fresh) else dict(old)

    # Yarıda kalan tam tarama (403, ağ hatası…): kaynaktan okunan ürünler gerçek ve doğrulanmış
    # fiyatlardır; atılmaz. Eski katalogdaki kayıtlar korunur, okunanlar güncellenir (kısmi yayım).
    partial = False
    if state != "tamam":
        merged = dict(old)
        complete = False
        if mode == "full" and fresh and old:
            for k, p in fresh.items():
                merged[k] = {**p, "cat": p.get("cat") or (old.get(k) or {}).get("cat") or ""}
                if not p.get("promo") and (old.get(k) or {}).get("promo") and market == "sok":
                    merged[k]["promo"] = old[k]["promo"]
            partial = True
            notes.append(f"kısmi yayım: {len(fresh)} ürünün fiyatı güncellendi, kalan {len(old) - len(set(old) & set(fresh))} ürün önceki doğrulamasıyla korundu")

    # Uzun süredir hiçbir taramada görülmeyen ürün katalogdan kaldırılmış sayılır.
    stale_days = int(quality_cfg.get("drop_unseen_days", 10))
    if mode == "full" and (state == "tamam" or partial):
        limit = now_ts - stale_days * 86400
        dropped = [k for k, p in merged.items() if isinstance(p.get("seen"), int) and p["seen"] < limit]
        for k in dropped:
            del merged[k]
        if dropped:
            notes.append(f"{len(dropped)} ürün {stale_days} gündür görülmediği için katalogdan çıkarıldı")

    promos_before = {k: p.get("promo") or "" for k, p in merged.items()}
    if state == "tamam":
        # Migros indirim modu yalnızca iki listeyi okur; listede olmayan ürünün kampanyası
        # (crmDiscountTags) burada silinmez, gece tam taramasında yenilenir. Doğrulaması
        # 48 saati geçen ürünün kampanyası arayüzde gösterilmez.
        if market == "sok" and SOK_PROMOS is not None:
            for k, p in merged.items():
                want = SOK_PROMOS.get(k, "")
                if (p.get("promo") or "") != want:
                    merged[k] = {**p, "promo": want}
    promos_changed = promos_before != {k: p.get("promo") or "" for k, p in merged.items()}

    categories_changed = complete_categories(merged)
    attempted = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    data_file_exists = (ROOT / "data" / f"{market}.json").exists()
    has_new_prices = (state == "tamam" and complete and bool(fresh)) or partial
    should_write = bool(merged) and (has_new_prices or categories_changed or promos_changed or not data_file_exists)
    last_data_update = previous_data_update
    if should_write:
        last_data_update = attempted if has_new_prices or not previous_data_update else previous_data_update
        write(market, merged, last_data_update)

    quality = category_quality(merged)
    warnings = []
    for error in ERRORS:
        code = str(error.get("status", ""))
        detail = str(error.get("detail", "")).lower()
        if code in ("403", "429"):
            warnings.append(f"HTTP {code}: erişim sınırı/engeli; tarama durduruldu")
        elif code == "0" or (code.isdigit() and int(code) >= 500):
            warnings.append(f"Ağ veya sunucu hatası: {error.get('url', '')}")
        if "robots" in detail or "robots" in code.lower():
            warnings.append("robots.txt kontrolü başarısız veya erişim izni yok")
    if quality["empty_category_count"]:
        warnings.append(f"{quality['empty_category_count']} üründe kategori boş")
    if quality["campaign_date_category_count"]:
        warnings.append(f"{quality['campaign_date_category_count']} ürünün kategorisi kampanya tarihi olarak kalmış")
    if quality["other_ratio"] > float(quality_cfg.get("other_warn_ratio", 0.35)):
        warnings.append(f"'Diğer' kategorisi yüksek: %{quality['other_ratio'] * 100:.1f}")
    previous_other = previous_quality.get("other_ratio")
    if previous_other is not None and quality["other_ratio"] > float(previous_other) + float(quality_cfg.get("other_increase_warn_ratio", 0.05)):
        warnings.append(f"'Diğer' kategorisi önceki duruma göre belirgin arttı: %{float(previous_other) * 100:.1f} → %{quality['other_ratio'] * 100:.1f}")
    if mode in ("full", "aktuel") and old and len(fresh) < float(quality_cfg.get("product_drop_warn_ratio", 0.85)) * len(old):
        warnings.append(f"Ürün sayısı önceki veri setine göre belirgin düştü: {len(fresh)}/{len(old)}")

    if last_data_update:
        try:
            parsed_update = datetime.datetime.fromisoformat(str(last_data_update).replace("Z", "+00:00"))
            if parsed_update.tzinfo is None:
                parsed_update = parsed_update.replace(tzinfo=datetime.timezone.utc)
            age_hours = (datetime.datetime.now(datetime.timezone.utc) - parsed_update).total_seconds() / 3600
            if age_hours > float(quality_cfg.get("stale_after_hours", 36)):
                warnings.append(f"Son başarılı veri {age_hours:.1f} saattir güncellenmedi")
        except (TypeError, ValueError):
            warnings.append("data_updated geçerli bir ISO zaman damgası değil")
    if state != "tamam" or not complete:
        warnings.insert(0, f"Tarama başarılı değil: {state}")

    discounted = sum(1 for p in merged.values() if p.get("in_stock") and p["regular"] > p["price"])
    status = {
        "updated": attempted,
        "started_at": started,
        "finished_at": attempted,
        "checked_at": attempted,
        "data_updated": last_data_update,
        "last_successful_data_at": last_data_update,
        "market": market,
        "mode": mode,
        "status": state,
        "complete": complete and state == "tamam",
        # Tarama yarıda kaldı ama okunan ürünlerin fiyatları yayımlandı.
        "partial": partial,
        "found": len(fresh),
        "total": len(merged),
        "seconds": round(time.time() - t0),
        "notes": notes,
        "quality": quality,
        "quality_warnings": list(dict.fromkeys(warnings)),
        "traffic": {h: {
            "requests": s["requests"],
            "retries": s.get("retries", 0),
            "megabytes": round(s["bytes"] / 1e6, 1),
            "errors": s["errors"],
        } for h, s in STATS.items()},
        "errors": ERRORS,
        "run_id": os.environ.get("GITHUB_RUN_ID"),
        # Açık adlı özet alanlar (found/total ile aynı anlam): collected = bu denemede
        # kaynaktan okunan, total = yayımlanan katalogdaki ürün sayısı.
        "collected_products": len(fresh),
        "total_products": len(merged),
        "discounted_products": discounted,
        "invalid_products": invalid_total,
        "data_quality": invalid,
        "duration_seconds": round(time.time() - t0),
    }

    # Tek durum dosyasında mod başına son denemeyi sakla.
    last_by_mode = dict(previous_status.get("last_attempt_by_mode") or {})
    old_mode = previous_status.get("mode")
    if old_mode and old_mode not in last_by_mode and previous_status.get("checked_at"):
        last_by_mode[old_mode] = {
            key: previous_status.get(key)
            for key in ("checked_at", "status", "complete", "found", "total", "seconds",
                        "data_updated", "errors", "notes", "quality_warnings", "quality", "traffic")
        }
    last_by_mode[mode] = {
        key: status.get(key)
        for key in ("checked_at", "status", "complete", "found", "total", "seconds",
                    "data_updated", "errors", "notes", "quality_warnings", "quality", "traffic")
    }
    status["last_attempt_by_mode"] = last_by_mode

    atomic_write(status_path, json.dumps(status, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps(status, ensure_ascii=False, indent=1)[:6000])
    if status["status"] != "tamam" or not status["complete"]:
        sys.exit(1)

if __name__ == "__main__":
    main()

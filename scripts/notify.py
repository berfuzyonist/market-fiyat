#!/usr/bin/env python3
"""Telefon bildirimleri (ntfy). GitHub Actions'ta günde birkaç kez çalışır.

Gönderilenler:
  1) Yeni kampanya afişleri (görseliyle)
  2) Takip listesindeki ürünler: indirime girdi, fiyatı düştü ya da hedef fiyata indi
  3) Sabah özeti: yeni başlayan en büyük indirimler (en çok 5)

Takip listesi: deponun sahibinin açtığı, başlığı "Bildirim listesi" ile başlayan en yeni açık GitHub talebi
(uygulamadaki "Takip listesini gönder" düğmesi hazırlar). Başkalarının açtığı talepler yok sayılır.
Konu adı (NTFY_TOPIC) yalnızca GitHub gizli ayarlarındadır; koda ve kayıtlara yazılmaz.
Durum data/notify-state.json'da tutulur: aynı bildirim iki kez gitmez. İlk çalışmada yalnızca durum
kaydedilir ve tek bir "kuruldu" bildirimi gider (eski afişler ve indirimler yağmur gibi gelmesin).
"""
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "collector"))
import collect  # noqa: E402

SITE = "https://berfuzyonist.github.io/market-fiyat/"
NAMES = {"sok": "Şok", "migros": "Migros", "bim": "BİM"}
STATE = ROOT / "data" / "notify-state.json"
REPO = os.environ.get("GITHUB_REPOSITORY", "berfuzyonist/market-fiyat")
OWNER = REPO.split("/")[0]
MAX_POSTERS = 4
MAX_DEALS = 5
DEAL_MIN = 0.30  # özet için en az %30 indirim
DROP_MIN = 0.03  # takipte en az %3 düşüş


def tl(v):
    s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return s + " ₺"


def load_products():
    out = {}
    for m in NAMES:
        path = ROOT / "data" / f"{m}.json"
        if path.exists():
            out.update(collect.parse_file(path, m) or {})
    return out


def load_groups():
    try:
        return json.loads((ROOT / "data" / "client" / "groups.json").read_text(encoding="utf-8")).get("groups") or []
    except (OSError, ValueError):
        return []


def parse_watch(body):
    """Talep metninden takip listesi: her satır 'market:id | ad | hedef=12,50' (hedef isteğe bağlı)."""
    out = {}
    for line in (body or "").splitlines():
        m = re.match(r"\s*[-*]?\s*((?:sok|migros|bim):[\w.\-]+)\s*(?:\|(.*))?$", line)
        if not m:
            continue
        t = re.search(r"hedef\s*=\s*([\d.,]+)", m.group(2) or "")
        target = None
        if t:
            try:
                target = float(t.group(1).replace(".", "").replace(",", ".") if "," in t.group(1) else t.group(1))
            except ValueError:
                target = None
        out[m.group(1)] = {"target": target}
    return out


def watch_issue():
    """Sahibin açtığı en yeni açık 'Bildirim listesi' talebi (numara, metin) ya da (None, '')."""
    token = os.environ.get("GITHUB_TOKEN")
    req = urllib.request.Request(f"https://api.github.com/repos/{REPO}/issues?state=open&per_page=50&creator={OWNER}",
                                 headers={"Accept": "application/vnd.github+json", **({"Authorization": f"Bearer {token}"} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            items = json.load(r)
    except (urllib.error.URLError, ValueError, OSError) as e:
        print(f"takip listesi okunamadı: {e}", file=sys.stderr)
        return None, ""
    for it in items:
        if "pull_request" in it or (it.get("user") or {}).get("login") != OWNER:
            continue
        if (it.get("title") or "").lower().startswith("bildirim listesi"):
            return it["number"], it.get("body") or ""
    return None, ""


def disc(p):
    r, v = p.get("regular") or 0, p.get("price") or 0
    return (r - v) / r if r > v > 0 else 0.0


def expand(watch, groups):
    """Takip edilen her ürünü eşleştirme grubundaki diğer marketlerle genişletir: id -> takip kaydı."""
    gi = {i: g for g in groups for i in g}
    out = {}
    for wid, w in watch.items():
        for i in gi.get(wid, [wid]):
            out[i] = {**w, "root": wid}
    return out


def watch_alerts(watch, products, sent):
    """Takip listesi için bildirim satırları; sent (id -> son bildirilen durum) güncellenir."""
    lines = []
    for pid, w in watch.items():
        p = products.get(pid)
        if not p or not p.get("in_stock") or not (p.get("price") or 0) > 0:
            continue
        price, promo, d = p["price"], p.get("promo") or "", disc(p)
        prev = sent.get(pid)
        sent[pid] = {"price": price, "promo": promo, "disc": round(d, 3)}
        if prev is None:
            continue  # ilk görüş: yalnızca başlangıç değeri
        why = None
        if w.get("target") and price <= w["target"] and prev["price"] > w["target"]:
            why = f"hedef {tl(w['target'])} altına indi"
        elif price <= prev["price"] * (1 - DROP_MIN):
            why = f"önce {tl(prev['price'])}"
        elif d >= 0.05 and prev.get("disc", 0) < 0.05:
            why = f"%{round(d * 100)} indirimde"
        elif promo and promo != prev.get("promo"):
            why = promo
        if why:
            lines.append((pid, f"{p['name']} · {NAMES.get(p['market'], p['market'])} {tl(price)} ({why})"))
    return lines


def new_posters(state):
    seen, out = set(state.get("posters") or []), []
    for m in NAMES:
        try:
            items = json.loads((ROOT / "data" / f"posters-{m}.json").read_text(encoding="utf-8")).get("items") or []
        except (OSError, ValueError):
            continue
        groups = {}
        for it in items:
            if not it.get("id") or it["id"] in seen:
                continue
            if m == "bim":  # BİM bir günün aktüelini birkaç sayfa yayımlar: günde tek bildirim
                k = (it.get("group"), it.get("label"))
                if k in groups:
                    continue
                groups[k] = 1
            out.append(it)
    return out


def poster_message(it):
    title = it.get("title") or ""
    if it.get("market") == "bim":
        title = f"BİM {it.get('group') or ''} · {it.get('label') or ''}"
    return (f"Yeni afiş · {NAMES.get(it.get('market'), '')}: {title}", it.get("label") or it.get("desc") or "Yeni kampanya")


def deal_digest(products, state, now):
    seen = state.get("deals") or {}
    cand = [p for p in products.values() if p.get("in_stock") and disc(p) >= DEAL_MIN and p["id"] not in seen]
    cand.sort(key=lambda p: (-disc(p), p.get("price") or 0))
    return cand


def send(topic, title, message, click=None, attach=None, tags=None, dry=False):
    body = {"topic": topic, "title": title[:120], "message": message[:3500]}
    if click:
        body["click"] = click
    if attach:
        body["attach"] = attach
    if tags:
        body["tags"] = tags
    if dry:
        print("BİLDİRİM:", json.dumps({k: v for k, v in body.items() if k != "topic"}, ensure_ascii=False))
        return True
    req = urllib.request.Request("https://ntfy.sh/", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return 200 <= r.status < 300
    except (urllib.error.URLError, OSError) as e:
        print(f"bildirim gönderilemedi: {e}", file=sys.stderr)
        return False


def main(argv):
    dry = "--dry" in argv
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic and not dry:
        print("NTFY_TOPIC gizli ayarı yok; bildirim gönderilmedi.")
        return 0
    now = int(time.time())
    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    first = not state
    products, groups = load_products(), load_groups()
    if "--ornek" in argv:  # her marketten en yeni afiş: görüntü ve dokunma davranışını denemek için
        for m in NAMES:
            items = [it for it in new_posters({}) if it.get("market") == m]
            if items:
                t, msg = poster_message(items[0])
                send(topic, "Örnek · " + t, msg, click=SITE + "#afis/" + items[0]["id"], attach=items[0].get("image"), tags=["label"], dry=dry)
        return 0
    num, body = watch_issue()
    watch = expand(parse_watch(body), groups)
    sent = state.get("sent") or {}
    sent = {k: v for k, v in sent.items() if k in watch}  # listeden çıkanlar unutulur
    alerts = watch_alerts(watch, products, sent)
    posters = new_posters(state)
    morning = time.gmtime(now).tm_hour in (5, 6, 7)  # TR 08–10 arası çalışma: sabah özeti
    deals = deal_digest(products, state, now) if (morning or first) else []

    if first:
        send(topic, "Market Fiyat bildirimleri kuruldu",
             f"Takipte {len(parse_watch(body))} ürün var. Yeni afişler, takip ettiğin ürünlerin indirimleri ve sabah özeti buraya gelecek.",
             click=SITE, tags=["shopping_cart"], dry=dry)
    else:
        if alerts:
            send(topic, f"Takip ettiğin {len(alerts)} üründe fırsat",
                 "\n".join(t for _, t in alerts[:12]) + (f"\n… ve {len(alerts) - 12} ürün daha" if len(alerts) > 12 else ""),
                 click=SITE + "#urun/" + alerts[0][0], tags=["moneybag"], dry=dry)
        for it in posters[:MAX_POSTERS]:
            t, msg = poster_message(it)
            send(topic, t, msg, click=SITE + "#afis/" + it["id"], attach=it.get("image") or None, tags=["label"], dry=dry)
        if len(posters) > MAX_POSTERS:
            send(topic, f"{len(posters) - MAX_POSTERS} yeni afiş daha", "Tümü uygulamanın Afişler sayfasında.",
                 click=SITE + "#afisler", tags=["label"], dry=dry)
        if deals:
            top = deals[:MAX_DEALS]
            send(topic, "Sabah özeti: yeni büyük indirimler",
                 "\n".join(f"%{round(disc(p) * 100)} · {p['name']} · {NAMES.get(p['market'], '')} {tl(p['price'])}" for p in top),
                 click=SITE + "#kampanya", tags=["sunrise"], dry=dry)

    keep = {p["id"] for p in products.values() if disc(p) >= DEAL_MIN}
    old = state.get("deals") or {}
    if morning or first:
        deals_state = {k: old.get(k, now) for k in keep}   # özet gönderildi: bugünkü indirimler bildirilmiş sayılır
    else:
        deals_state = {k: v for k, v in old.items() if k in keep}  # indirimden çıkan düşer; yeni olanlar sabahı bekler
    state = {"version": 1, "updated": now, "issue": num, "sent": sent, "deals": deals_state,
             "posters": sorted({it["id"] for it in new_posters({})})}
    if not dry:
        STATE.write_text(json.dumps(state, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"takip {len(watch)} · uyarı {len(alerts)} · yeni afiş {len(posters)} · özet {len(deals[:MAX_DEALS])}{' · ilk çalışma' if first else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

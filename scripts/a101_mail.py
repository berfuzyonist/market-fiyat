#!/usr/bin/env python3
"""A101 afişleri: A101'in afiş aboneliğiyle gönderdiği e-postalardan (yalnızca bu iş için açılmış Gmail kutusu).

Siteye istek atılmaz; A101'in kendi gönderdiği e-postalar okunur. Kimlik bilgileri yalnızca GitHub gizli
ayarlarında (A101_MAIL_USER, A101_MAIL_PASS: Google uygulama şifresi). Yalnızca A101 göndericili e-postalar
okunur; e-posta içeriği ve adresler kayda geçmez.

Çıktı: data/posters-a101.json (diğer marketlerin afiş biçimiyle aynı). Okuma başarısız olursa eski dosya
korunur. --deneme: yalnızca bağlantıyı ve bulunan A101 e-postalarının konu/görsel sayısını yazar.
"""
import email
import email.header
import email.utils
import hashlib
import html
import imaplib
import json
import os
import pathlib
import re
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "posters-a101.json"
DAYS = 21
MIN_SIDE = 400  # e-postadaki küçük simge/logo görselleri elenir (boyut yazıyorsa)


def dec(s):
    try:
        return str(email.header.make_header(email.header.decode_header(s or "")))
    except (ValueError, LookupError):
        return s or ""


def html_part(msg):
    for part in msg.walk():
        if part.get_content_type() == "text/html":
            raw = part.get_payload(decode=True) or b""
            return raw.decode(part.get_content_charset() or "utf-8", errors="replace")
    return ""


def poster_images(doc):
    """E-posta HTML'indeki afiş görselleri: https, büyük, logo/simge/izleme pikseli olmayan."""
    out = []
    for tag in re.findall(r"<img\b[^>]*>", doc, flags=re.I):
        src = re.search(r'\bsrc\s*=\s*["\']([^"\']+)', tag, flags=re.I)
        if not src:
            continue
        url = html.unescape(src.group(1)).strip()
        if not url.startswith("https://"):
            continue
        low = url.lower()
        if any(w in low for w in ("logo", "icon", "ikon", "social", "facebook", "instagram", "twitter", "youtube",
                                  "pixel", "track", "open.", "spacer", "appstore", "googleplay", "app-store", "google-play")):
            continue
        dims = [int(x) for x in re.findall(r'\b(?:width|height)\s*=\s*["\']?(\d+)', tag, flags=re.I)]
        if dims and max(dims) < MIN_SIDE:
            continue
        if url not in out:
            out.append(url)
    return out


def links(doc):
    return [html.unescape(u) for u in re.findall(r'<a\b[^>]*href\s*=\s*["\'](https://[^"\']+)', doc, flags=re.I)]


def fetch(user, pwd):
    box = imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=60)
    box.login(user, pwd)
    box.select("INBOX", readonly=True)  # yalnızca okunur: e-postalar okundu işaretlenmez, silinmez
    since = time.strftime("%d-%b-%Y", time.gmtime(time.time() - DAYS * 86400))
    _, data = box.search(None, "SINCE", since, "FROM", "a101")
    mails = []
    for num in (data[0] or b"").split()[-40:]:
        _, parts = box.fetch(num, "(RFC822)")
        raw = next((p[1] for p in parts if isinstance(p, tuple)), None)
        if not raw:
            continue
        msg = email.message_from_bytes(raw)
        frm = email.utils.parseaddr(msg.get("From", ""))[1].lower()
        if not frm.endswith(("a101.com.tr", "a101.com")) and "a101" not in frm.split("@")[-1]:
            continue  # yalnızca A101'in kendi alan adından gelenler
        try:
            ts = email.utils.parsedate_to_datetime(msg.get("Date")).timestamp()
        except (TypeError, ValueError):
            ts = time.time()
        doc = html_part(msg)
        mails.append({"subject": " ".join(dec(msg.get("Subject")).split()), "ts": ts, "images": poster_images(doc),
                      "links": links(doc), "domain": frm.split("@")[-1]})
    box.logout()
    return mails


def build(mails):
    items = []
    for m in sorted(mails, key=lambda m: -m["ts"]):
        title = m["subject"] or "A101 afişi"
        day = time.strftime("%d.%m.%Y", time.gmtime(m["ts"] + 3 * 3600))
        url = next((u for u in m["links"] if "a101.com.tr" in u and ("afis" in u or "aktuel" in u or "kampanya" in u)),
                   "https://www.a101.com.tr/")
        key = hashlib.sha1(title.encode()).hexdigest()[:10]
        for i, img in enumerate(m["images"][:12]):
            items.append({"market": "a101", "id": f"a101:{key}:{i}", "title": title, "group": "Afiş",
                          "label": title, "desc": f"A101 e-postası · {day}", "image": img, "thumb": img, "url": url})
    seen, out = set(), []
    for it in items:  # aynı görsel birden çok e-postada gelirse bir kez
        if it["image"] not in seen:
            seen.add(it["image"])
            out.append(it)
    return out


def main(argv):
    user, pwd = os.environ.get("A101_MAIL_USER", "").strip(), os.environ.get("A101_MAIL_PASS", "").replace(" ", "").strip()
    if not user or not pwd:
        print("A101_MAIL_USER / A101_MAIL_PASS gizli ayarları yok; atlandı.")
        return 0
    try:
        mails = fetch(user, pwd)
    except (imaplib.IMAP4.error, OSError) as e:
        print(f"e-posta kutusuna bağlanılamadı: {type(e).__name__}", file=sys.stderr)
        return 1
    if "--deneme" in argv:
        print(f"bağlantı tamam; son {DAYS} günde A101'den {len(mails)} e-posta")
        for m in mails:
            hosts = sorted({re.sub(r'^https://([^/]+)/.*', r'\1', u) for u in m["images"]})
            print(f"- {m['domain']} · {m['subject'][:80]} · {len(m['images'])} görsel · {', '.join(hosts)}")
        return 0
    items = build(mails)
    if not items:
        print("A101 e-postasında afiş bulunamadı; dosya değişmedi.")
        return 0
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    if old.get("items") == items:
        print("değişiklik yok")
        return 0
    OUT.write_text(json.dumps({"market": "a101", "updated": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()),
                               "source": "A101 afiş aboneliği e-postaları", "items": items},
                              ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(items)} A101 afişi yazıldı")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

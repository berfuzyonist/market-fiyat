#!/usr/bin/env python3
"""E-posta afişleri: marketlerin bülten/afiş aboneliğiyle gönderdiği e-postalardan (yalnızca bu iş için
açılmış Gmail kutusu). Şu an: A101 (afiş aboneliği), Tarım Kredi Kooperatif Market (bülten).

Siteye istek atılmaz; A101'in kendi gönderdiği e-postalar okunur. Kimlik bilgileri yalnızca GitHub gizli
ayarlarında (A101_MAIL_USER, A101_MAIL_PASS: Google uygulama şifresi). Yalnızca A101 göndericili e-postalar
okunur; e-posta içeriği ve adresler kayda geçmez.

Çıktı: data/posters-<market>.json (diğer marketlerin afiş biçimiyle aynı). Okuma başarısız olursa eski dosya
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
# market → (IMAP FROM araması, gönderenin alan adında geçmesi gerekenler, ad)
SENDERS = {
    "a101": (["a101"], ["a101.com.tr", "a101.com"], "A101"),
    "koop": (["tkkoop", "tarimkredi", "koopmarket", "kooperatif"], ["tkkoop.com.tr", "tarimkredi", "koopmarket", "kooperatif"], "Tarım Kredi"),
}
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


def fetch(user, pwd, market):
    froms, domains, _ = SENDERS[market]
    box = imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=60)
    box.login(user, pwd)
    box.select("INBOX", readonly=True)  # yalnızca okunur: e-postalar okundu işaretlenmez, silinmez
    since = time.strftime("%d-%b-%Y", time.gmtime(time.time() - DAYS * 86400))
    nums = []
    for f in froms:
        _, data = box.search(None, "SINCE", since, "FROM", f)
        nums += [n for n in (data[0] or b"").split() if n not in nums]
    mails = []
    for num in sorted(nums, key=int)[-40:]:
        _, parts = box.fetch(num, "(RFC822)")
        raw = next((p[1] for p in parts if isinstance(p, tuple)), None)
        if not raw:
            continue
        msg = email.message_from_bytes(raw)
        frm = email.utils.parseaddr(msg.get("From", ""))[1].lower()
        if not any(d in frm.split("@")[-1] for d in domains):
            continue  # yalnızca marketin kendi alan adından gelenler
        try:
            ts = email.utils.parsedate_to_datetime(msg.get("Date")).timestamp()
        except (TypeError, ValueError):
            ts = time.time()
        doc = html_part(msg)
        mails.append({"subject": " ".join(dec(msg.get("Subject")).split()), "ts": ts, "images": poster_images(doc),
                      "links": links(doc), "domain": frm.split("@")[-1]})
    box.logout()
    return mails


def build(mails, market):
    name = SENDERS[market][2]
    items = []
    for m in sorted(mails, key=lambda m: -m["ts"]):
        title = m["subject"] or f"{name} afişi"
        day = time.strftime("%d.%m.%Y", time.gmtime(m["ts"] + 3 * 3600))
        home = {"a101": "https://www.a101.com.tr/", "koop": "https://www.tkkoop.com.tr/"}[market]
        url = next((u for u in m["links"] if home.split("//")[1].strip("/") in u and ("afis" in u or "aktuel" in u or "kampanya" in u)), home)
        key = hashlib.sha1(title.encode()).hexdigest()[:10]
        for i, img in enumerate(m["images"][:12]):
            items.append({"market": market, "id": f"{market}:{key}:{i}", "title": title, "group": "Afiş",
                          "label": title, "desc": f"{name} e-postası · {day}", "image": img, "thumb": img, "url": url})
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
    rc = 0
    if "--deneme" in argv:  # tanı: kutudaki son e-postaların yalnızca gönderen alan adı ve konusu (adres yazılmaz)
        try:
            box = imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=60)
            box.login(user, pwd)
            for folder in ("INBOX", '"[Gmail]/Spam"'):
                st, _ = box.select(folder, readonly=True)
                if st != "OK":
                    continue
                _, data = box.search(None, "ALL")
                nums = (data[0] or b"").split()
                print(f"{folder}: {len(nums)} e-posta")
                for num in nums[-15:]:
                    _, parts = box.fetch(num, "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])")
                    raw = next((q[1] for q in parts if isinstance(q, tuple)), b"")
                    msg = email.message_from_bytes(raw)
                    dom = email.utils.parseaddr(msg.get("From", ""))[1].split("@")[-1].lower()
                    print(f"  · {dom} · {' '.join(dec(msg.get('Subject')).split())[:70]}")
            box.logout()
        except (imaplib.IMAP4.error, OSError) as e:
            print(f"tanı yapılamadı: {type(e).__name__}")
    for market, (_, _, name) in SENDERS.items():
        try:
            mails = fetch(user, pwd, market)
        except (imaplib.IMAP4.error, OSError) as e:
            print(f"e-posta kutusuna bağlanılamadı: {type(e).__name__}", file=sys.stderr)
            return 1
        if "--deneme" in argv:
            print(f"{name}: son {DAYS} günde {len(mails)} e-posta")
            for m in mails:
                hosts = sorted({re.sub(r'^https://([^/]+)/.*', r'\1', u) for u in m["images"]})
                print(f"- {m['domain']} · {m['subject'][:80]} · {len(m['images'])} görsel · {', '.join(hosts)}")
            continue
        items = build(mails, market)
        out = ROOT / "data" / f"posters-{market}.json"
        if not items:
            print(f"{name}: e-postada afiş bulunamadı; dosya değişmedi.")
            continue
        old = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {}
        if old.get("items") == items:
            print(f"{name}: değişiklik yok")
            continue
        out.write_text(json.dumps({"market": market, "updated": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()),
                                   "source": f"{name} e-posta aboneliği", "items": items},
                                  ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{name}: {len(items)} afiş yazıldı")
    return rc

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

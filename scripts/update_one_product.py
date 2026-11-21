#!/usr/bin/env python3
"""Tek ürün fiyat kontrolü ("Fiyatı Güncelle" talepleri).

İki aşamalıdır; ağ isteği ile depo yazımı ayrıdır:

  check <sonuç.json>
      ISSUE_BODY içindeki gizli işaretten (market, id, ad) talebi okur, depodaki
      kayıtla eşleştirir ve YALNIZCA o ürünü marketin herkese açık kaynağından okur
      (robots.txt + ürün isteği; bütün katalog taranmaz). Sonucu JSON'a yazar.

  apply <sonuç.json> <yorum.md>
      Sonucu o anki ana daldaki veriye uygular: ürün satırı, data/price-checks.json
      ve fiyat geçmişi. Yayımlama döngüsü her denemede bu adımı en güncel ana dal
      üzerinde yeniden çalıştırır; böylece eşzamanlı market taramaları ezilmez.

Doğrulanamayan fiyat hiçbir zaman yayımlanmaz; eski fiyat korunur ve kontrol
"başarısız" olarak kaydedilir.
"""
import datetime
import importlib.util
import json
import math
import os
import pathlib
import re
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import pricehist  # noqa: E402

MARKETS = {"migros": "Migros", "sok": "Şok", "bim": "BİM"}
MARKER = re.compile(r"<!--\s*market-fiyat-price-update\s*(\{.*?\})\s*-->", re.S)
RECENT_SECONDS = 10 * 60
MAX_CHECKS = 1500
TR = datetime.timezone(datetime.timedelta(hours=3))


def collector():
    spec = importlib.util.spec_from_file_location("market_collector", ROOT / "collector" / "collect.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def now_iso(ts=None):
    ts = time.time() if ts is None else ts
    return datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).isoformat(timespec="seconds")


def fold(value):
    table = str.maketrans("çğıöşüâîûÇĞIİÖŞÜ", "cgiosuaiucgiiosu")
    return " ".join(re.findall(r"[a-z0-9]+(?:[.,][0-9]+)?", str(value or "").translate(table).casefold()))


def same_name(a, b):
    return fold(a) == fold(b)


def names_match(stored, fresh):
    """Kaynaktaki ad, depodaki adla aynı ürünü mü anlatıyor?

    BİM ürün sayfası markayı başlıkta göstermez; bu yüzden kaynak adının
    kelimelerinin büyük kısmı depodaki adda geçmelidir.
    """
    s, f = set(fold(stored).split()), set(fold(fresh).split())
    if not s or not f:
        return False
    return len(s & f) / len(f) >= 0.8 and len(s & f) / len(s) >= 0.5


def load_checks(path):
    try:
        data = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    checks = data.get("checks") if isinstance(data.get("checks"), dict) else {
        k: v for k, v in data.items() if isinstance(v, dict) and ":" in k}  # eski düz biçim
    return {"v": 1, "updated": data.get("updated"), "checks": checks}


def save_json(path, data):
    text = json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    json.loads(text)
    path = pathlib.Path(path)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def parse_request(body):
    """Issue gövdesindeki işareti doğrular. Hata metni veya (market, id, ad) döner."""
    match = MARKER.search(body or "")
    if not match:
        return "Talepte ürün bilgisi işareti bulunamadı. Talebi uygulamadaki “Fiyatı Güncelle” bağlantısından açın."
    try:
        request = json.loads(match.group(1))
    except ValueError:
        return "Talepteki ürün bilgisi bozuk (JSON okunamadı)."
    if not isinstance(request, dict):
        return "Talepteki ürün bilgisi geçersiz."
    market = str(request.get("market", "")).lower()
    pid = str(request.get("id", ""))
    name = " ".join(str(request.get("name", "")).split())
    if market not in MARKETS:
        return "Geçersiz market."
    if not pid.startswith(market + ":"):
        return "Ürün kimliği ile market uyuşmuyor."
    c = collector()
    if not re.fullmatch(c.ID_RE[market], pid):
        return "Ürün kimliği biçimi geçersiz."
    if not name or len(name) > 240:
        return "Ürün adı eksik veya geçersiz."
    return market, pid, name


def check(result_path):
    body = os.environ.get("ISSUE_BODY", "")
    issue = os.environ.get("ISSUE_NUMBER", "")
    started = time.time()
    result = {"ok": False, "issue": issue, "checked_at": now_iso(started)}
    parsed = parse_request(body)
    if isinstance(parsed, str):
        result.update(stage="request", message=parsed)
        save_json(result_path, result)
        print(parsed)
        return
    market, pid, name = parsed
    result.update(market=market, id=pid, name=name)
    c = collector()
    current = c.read_old(market).get(pid)
    if not current:
        result.update(stage="request", message="Ürün bu marketin güncel kataloğunda yok; kontrol edilmedi.")
    elif not same_name(current.get("name"), name):
        result.update(stage="request", message="Talepteki ürün adı katalogdaki kayıtla eşleşmedi; kontrol edilmedi.")
    else:
        result["name"] = current["name"]
        last = load_checks(ROOT / "data" / "price-checks.json")["checks"].get(pid) or {}
        last_ts = pricehist._ts(last.get("checked_at")) or 0
        if last.get("status") in ("updated", "unchanged") and started - last_ts < RECENT_SECONDS:
            result.update(ok=True, stage="recent", message="Bu ürün son 10 dakika içinde kontrol edildi; markete yeni istek gönderilmedi.",
                          fresh={"price": last.get("new_price"), "regular": last.get("new_regular"),
                                 "in_stock": last.get("in_stock")}, checked_at=last.get("checked_at"))
        else:
            try:
                fresh = c.ONE[market](current)
            except c.NotFound:
                result.update(stage="source", message="Ürün doğrulanamadı: ürün marketin sitesinde bulunamadı (kaldırılmış olabilir).")
            except c.Stop as e:
                result.update(stage="source", message=f"Ürün doğrulanamadı: {e}")
            except Exception as e:  # noqa: BLE001
                result.update(stage="source", message=f"Ürün doğrulanamadı: beklenmeyen kaynak yanıtı ({type(e).__name__}).")
            else:
                price, regular = fresh.get("price"), fresh.get("regular")
                if fresh.get("name") and not names_match(current["name"], fresh["name"]):
                    result.update(stage="verify", message=f"Ürün doğrulanamadı: kaynaktaki ad farklı (“{fresh['name'][:120]}”).")
                elif not all(isinstance(v, (int, float)) and math.isfinite(v) and v > 0 for v in (price, regular)):
                    result.update(stage="verify", message="Ürün doğrulanamadı: kaynaktaki fiyat geçersiz.")
                else:
                    regular = max(float(regular), float(price))
                    if regular > price * 10:
                        regular = float(price)
                    result.update(ok=True, stage="verified", checked_at=now_iso(), fresh={
                        "price": round(float(price), 2), "regular": round(regular, 2),
                        "in_stock": bool(fresh.get("in_stock")), "promo": fresh.get("promo"),
                        "source_name": fresh.get("name", ""), "source": fresh.get("source", "")})
            result["requests"] = {h: s.get("requests", 0) for h, s in c.STATS.items()}
    result["seconds"] = round(time.time() - started, 1)
    save_json(result_path, result)
    print(json.dumps(result, ensure_ascii=False, indent=1))


def tl(v):
    return "—" if v is None else f"{v:,.2f} TL".replace(",", "X").replace(".", ",").replace("X", ".")


def md(text):
    return re.sub(r"([\\`*_\[\]<>|@#])", r"\\\1", str(text or ""))


def apply(result_path, comment_path):
    result = json.loads(pathlib.Path(result_path).read_text(encoding="utf-8"))
    market, pid = result.get("market"), result.get("id")
    lines = []
    if result.get("stage") == "request" or not market or not pid:
        lines = ["**Fiyat kontrolü yapılmadı.**", "", f"- Sebep: {md(result.get('message'))}",
                 "- Mevcut fiyatlar değiştirilmedi."]
        pathlib.Path(comment_path).write_text("\n".join(lines) + "\n", encoding="utf-8")
        print("\n".join(lines))
        return

    c = collector()
    data_path = ROOT / "data" / f"{market}.json"
    catalog = c.read_old(market)
    current = catalog.get(pid)
    checks_path = ROOT / "data" / "price-checks.json"
    checks = load_checks(checks_path)
    checked_at = result.get("checked_at") or now_iso()
    ts = pricehist._ts(checked_at) or int(time.time())
    when_tr = datetime.datetime.fromtimestamp(ts, TR).strftime("%d.%m.%Y %H:%M")
    name = (current or {}).get("name") or result.get("name") or pid
    old_price = (current or {}).get("price")
    old_regular = (current or {}).get("regular")
    head = [f"- Ürün: {md(name)}", f"- Market: {MARKETS[market]}", f"- Ürün kimliği: `{pid}`"]
    record = {"market": market, "name": name, "checked_at": checked_at, "issue": result.get("issue"),
              "old_price": old_price, "old_regular": old_regular}

    if result.get("stage") == "recent":
        fresh = result.get("fresh") or {}
        lines = ["**Fiyat yakın zamanda kontrol edildi.**", ""] + head + [
            f"- Son doğrulanan fiyat: {tl(fresh.get('price'))}",
            f"- Son kontrol zamanı (TR): {when_tr}",
            "- İşlem sonucu: Markete yeni istek gönderilmedi (10 dakika içinde tekrar sorgulanmaz)."]
        pathlib.Path(comment_path).write_text("\n".join(lines) + "\n", encoding="utf-8")
        print("\n".join(lines))
        return

    if not result.get("ok"):
        record.update(status="failed", message=result.get("message"), new_price=None, new_regular=None)
        checks["checks"][pid] = record
        lines = ["**Ürün doğrulanamadı.**", ""] + head + [
            f"- Kayıtlı fiyat (değiştirilmedi): {tl(old_price)}",
            f"- Kontrol zamanı (TR): {when_tr}",
            f"- Hata: {md(result.get('message'))}",
            "- İşlem sonucu: Eski fiyat korundu; doğrulanamayan fiyat yayımlanmadı."]
    elif not current:
        record.update(status="failed", message="Ürün kontrol sırasında katalogdan çıkarıldı.",
                      new_price=None, new_regular=None)
        checks["checks"][pid] = record
        lines = ["**Ürün doğrulanamadı.**", ""] + head + [
            "- Hata: Ürün, kontrol sürerken güncel katalogdan çıkarıldı.",
            "- İşlem sonucu: Veri değiştirilmedi."]
    else:
        fresh = result["fresh"]
        price, regular, in_stock = fresh["price"], fresh["regular"], fresh["in_stock"]
        changed_price = abs(price - old_price) >= 0.005 or abs(regular - old_regular) >= 0.005
        changed = changed_price or bool(in_stock) != bool(current.get("in_stock"))
        diff = round(price - old_price, 2)
        diff_pct = round(diff / old_price * 100, 1) if old_price else None
        row = dict(current, price=price, regular=regular, in_stock=in_stock, seen=ts)
        if market == "migros" and fresh.get("promo") is not None:
            row["promo"] = fresh.get("promo") or ""
        catalog[pid] = row
        previous = json.loads(data_path.read_text(encoding="utf-8"))
        # "updated" (katalog anlık görüntüsü zamanı) bilerek değiştirilmez; ürün satırındaki
        # "seen" ve price-checks.json bu ürünün daha yeni doğrulandığını gösterir.
        c.write(market, catalog, previous.get("updated"), data_path)
        hist_path = ROOT / "data" / f"history-{market}.json"
        history = pricehist.load(hist_path, market)
        old_seen = current.get("seen") if isinstance(current.get("seen"), int) else pricehist._ts(previous.get("updated"))
        pricehist.add_change(history, pid, (old_price, old_regular, old_seen), (price, regular, ts), ts, "manual")
        pricehist.prune(history)
        pricehist.save(hist_path, history)
        record.update(status="updated" if changed else "unchanged", new_price=price, new_regular=regular,
                      in_stock=in_stock, change=diff, change_pct=diff_pct, message="")
        checks["checks"][pid] = record
        pct_txt = ("+" if diff > 0 else "−") + "%" + f"{abs(diff_pct or 0):.1f}".replace(".", ",")
        verdict = ("Fiyat değişmedi." if not changed_price else
                   f"Fiyat {'arttı' if diff > 0 else 'düştü'}: {tl(abs(diff))} ({pct_txt})")
        discount = f" (normal fiyat {tl(regular)}, %{round((1 - price / regular) * 100)} indirim)" if regular > price else ""
        title = "Fiyat güncellendi" if changed_price else "Stok durumu güncellendi" if changed else "Fiyat değişmedi"
        lines = [f"**{title}.**", ""] + head + [
            f"- Önceki fiyat: {tl(old_price)}",
            f"- Yeni fiyat: {tl(price)}{discount}",
            f"- Fiyat değişimi: {tl(diff) if changed_price else '0,00 TL'}",
            f"- Değişim yüzdesi: {pct_txt if changed_price else '%0'}",
            f"- Stok durumu: {'Stokta' if in_stock else 'Stokta yok'}" + (" (BİM stok bilgisi yayımlamaz)" if market == "bim" else ""),
            f"- Kontrol zamanı (TR): {when_tr}",
            f"- İşlem sonucu: {verdict}",
            f"- Kaynak: {fresh.get('source') or '—'} (tek ürün isteği, katalog taranmadı)"]
    # Kayıt sayısını sınırla: en eski kontroller düşer.
    items = sorted(checks["checks"].items(), key=lambda kv: str(kv[1].get("checked_at") or ""), reverse=True)
    checks["checks"] = dict(items[:MAX_CHECKS])
    checks["updated"] = now_iso()
    save_json(checks_path, checks)
    pathlib.Path(comment_path).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


def main(argv):
    if len(argv) >= 2 and argv[0] == "check":
        check(argv[1])
    elif len(argv) >= 3 and argv[0] == "apply":
        apply(argv[1], argv[2])
    else:
        raise SystemExit("Kullanım: update_one_product.py check <sonuç.json> | apply <sonuç.json> <yorum.md>")


if __name__ == "__main__":
    main(sys.argv[1:])

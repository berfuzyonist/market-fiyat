#!/usr/bin/env python3
"""Ürün fiyat geçmişi: yalnızca gerçek fiyat değişimlerini saklar.

Dosya: data/history-<market>.json
{
  "v": 2, "market": "migros", "updated": "<ISO 8601 UTC>", "since": <takibin başladığı Unix saniye>,
  "items": {"migros:123": [[ts, price, regular, "kaynak", "kampanya"], ...]}
}
- ts: Unix saniye (UTC). kaynak: full | deals | aktuel | manual. kampanya: "2 Al 1 Öde" gibi metin ya da "".
- Her yayımda fiyat, etiket (indirimsiz) fiyatı ve kampanya metni karşılaştırılır; biri değiştiyse nokta eklenir.
  Aynı değerler tekrar eklenmez; bir ürün için ilk değişimde eski durum da (bilinen doğrulama zamanıyla)
  başlangıç noktası olarak yazılır. v1 dosyalarındaki 4 alanlı noktalar kampanyasız sayılır.
- Büyüme sınırı: ürün başına en fazla MAX_POINTS nokta, MAX_AGE_DAYS günden eski
  noktalar silinir (son nokta her zaman kalır); katalogdan çıkan ürünlerin geçmişi
  MAX_AGE_DAYS sonra düşer.
"""
import datetime
import json
import math
import os
import pathlib

MAX_POINTS = 40
MAX_AGE_DAYS = 180


def _now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def _ts(value):
    try:
        dt = datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return int(dt.timestamp())


def _promo(value):
    return " ".join(str(value or "").split())[:80]


def rows(data):
    """Market veri dosyasını id -> (price, regular, seen, promo) sözlüğüne çevirir."""
    out = {}
    if not isinstance(data, dict):
        return out
    fields = data.get("fields") or []
    fallback = _ts(data.get("updated"))
    for row in data.get("products") or []:
        rec = dict(zip(fields, row)) if isinstance(row, list) else dict(row or {})
        try:
            pid, price = str(rec["id"]), float(rec["price"])
            regular = float(rec.get("regular") if rec.get("regular") is not None else price)
        except (KeyError, TypeError, ValueError):
            continue
        if not pid or not math.isfinite(price) or price <= 0:
            continue
        seen = rec.get("seen") if isinstance(rec.get("seen"), int) else fallback
        out[pid] = (round(price, 2), round(max(regular, price), 2), seen, _promo(rec.get("promo")))
    return out


def load(path, market):
    try:
        data = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("items"), dict):
            if data.get("v") != 2:
                data["v"] = 2
                firsts = [p[0] for pts in data["items"].values() for p in _clean(pts)]
                data["since"] = min(firsts) if firsts else _ts(data.get("updated"))
            return data
    except (OSError, ValueError):
        pass
    return {"v": 2, "market": market, "updated": None, "since": None, "items": {}}


def _clean(points):
    good = []
    for p in points or []:
        if (isinstance(p, list) and len(p) >= 3 and isinstance(p[0], int)
                and all(isinstance(x, (int, float)) and math.isfinite(x) and x > 0 for x in p[1:3])):
            good.append([p[0], round(float(p[1]), 2), round(float(p[2]), 2), str(p[3]) if len(p) > 3 else "",
                         _promo(p[4]) if len(p) > 4 else ""])
    good.sort(key=lambda p: p[0])
    return good


def _same(a_price, a_regular, a_promo, b):
    return abs(a_price - b[0]) < 0.005 and abs(a_regular - b[1]) < 0.005 and a_promo == (b[3] if len(b) > 3 else "")


def add_change(history, pid, old, new, ts, source):
    """old/new: (price, regular, seen, promo) veya None. Değişim kaydedildiyse True döner."""
    if not new:
        return False
    new = tuple(new) + ("",) * (4 - len(new))
    points = _clean(history["items"].get(pid))
    last = points[-1] if points else None
    if last and _same(last[1], last[2], last[4], new):
        return False
    if not last and old:
        old = tuple(old) + ("",) * (4 - len(old))
        if _same(old[0], old[1], old[3], new):
            return False
        points.append([int(old[2] or ts), old[0], old[1], "önceki", old[3]])
    elif not last:
        return False  # ilk kez görülen ürün: karşılaştırılacak eski fiyat yok
    points.append([int(ts), new[0], new[1], source, new[3]])
    history["items"][pid] = points
    return True


def prune(history, now_ts=None):
    now_ts = now_ts or int(datetime.datetime.now(datetime.timezone.utc).timestamp())
    limit = now_ts - MAX_AGE_DAYS * 86400
    for pid in list(history["items"]):
        points = _clean(history["items"][pid])
        kept = [p for p in points if p[0] >= limit][-MAX_POINTS:]
        if not kept or len(kept) < 2:
            # Son 180 günde değişim yoksa geçmiş gereksiz; tek nokta da anlamsız.
            if points and points[-1][0] >= limit and len(points) >= 2:
                kept = points[-2:]
            else:
                del history["items"][pid]
                continue
        history["items"][pid] = kept


def save(path, history):
    history["updated"] = _now_iso()
    text = json.dumps(history, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"
    json.loads(text)
    path = pathlib.Path(path)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def record_publish(history_path, market, current_data, incoming_data, source):
    """Yayımlanan iki veri sürümü arasındaki fiyat değişimlerini geçmişe ekler."""
    old_rows, new_rows = rows(current_data), rows(incoming_data)
    history = load(history_path, market)
    ts = _ts(incoming_data.get("updated")) or int(datetime.datetime.now(datetime.timezone.utc).timestamp())
    if not history.get("since"):
        history["since"] = ts
    changed = 0
    for pid, new in new_rows.items():
        old = old_rows.get(pid)
        if old is None:
            continue
        if add_change(history, pid, old, new, new[2] or ts, source):
            changed += 1
    prune(history)
    save(history_path, history)
    return changed

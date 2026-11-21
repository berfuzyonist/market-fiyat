#!/usr/bin/env python3
"""Refresh one product using the repository's public-source collector."""
import datetime
import importlib.util
import json
import math
import os
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODES = {"migros": "full", "sok": "full", "bim": "aktuel"}
MARKER = re.compile(r"<!--\s*market-fiyat-price-update\s*(\{.*?\})\s*-->", re.S)


def output(key, value):
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"{key}={str(value).replace(chr(10), ' ').replace(chr(13), ' ')}\n")


def main():
    match = MARKER.search(os.environ.get("ISSUE_BODY", ""))
    if not match:
        raise SystemExit("Güncelleme talebinde ürün bilgisi bulunamadı.")
    request = json.loads(match.group(1))
    market, product_id = str(request.get("market", "")).lower(), str(request.get("id", ""))
    requested_name = str(request.get("name", "")).strip()
    if market not in MODES or not product_id.startswith(market + ":") or len(product_id) > 180:
        raise SystemExit("Geçersiz market veya ürün kimliği.")
    if not requested_name or len(requested_name) > 240:
        raise SystemExit("Ürün adı eksik veya geçersiz.")

    spec = importlib.util.spec_from_file_location("market_collector", ROOT / "collector" / "collect.py")
    collector = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = collector
    spec.loader.exec_module(collector)

    old = collector.read_old(market)
    current = old.get(product_id)
    norm = lambda value: " ".join(str(value or "").casefold().split())
    if not current or norm(current.get("name")) != norm(requested_name):
        raise SystemExit("Ürün kimliği ve mevcut kayıt eşleşmedi; fiyat korunmuştur.")

    fresh, notes = {}, []
    collector.JOBS[(market, MODES[market])](fresh, notes)
    verified = fresh.get(product_id)
    if not verified or norm(verified.get("name")) != norm(current.get("name")):
        raise SystemExit("Ürün market kaynağında doğrulanamadı; eski fiyat korundu.")
    price = float(verified.get("price") or 0)
    regular = float(verified.get("regular") or price)
    if not math.isfinite(price) or not math.isfinite(regular) or price <= 0 or regular <= 0:
        raise SystemExit("Kaynak fiyatı geçersiz; eski fiyat korundu.")

    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    old_price = float(current.get("price") or 0)
    old_regular = float(current.get("regular") or old_price)
    old_stock, new_stock = bool(current.get("in_stock")), bool(verified.get("in_stock"))
    changed = abs(old_price - price) >= 0.005 or abs(old_regular - regular) >= 0.005 or old_stock != new_stock
    if changed:
        merged = dict(old)
        merged[product_id] = {**current, "price": price, "regular": regular, "in_stock": new_stock}
        collector.write(market, merged, now)

    checks_path = ROOT / "data" / "price-checks.json"
    try:
        checks = json.loads(checks_path.read_text(encoding="utf-8"))
        if not isinstance(checks, dict):
            checks = {}
    except (OSError, ValueError):
        checks = {}
    checks[product_id] = {
        "market": market, "name": current.get("name", ""), "checked_at": now,
        "old_price": old_price, "new_price": price, "changed": changed,
        "status": "updated" if changed else "unchanged",
    }
    checks_path.write_text(json.dumps(checks, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = (
        f"**Kontrol başarılı — {current.get('name', product_id)}**\n\n"
        f"- Market: {market}\n- Önceki fiyat: {old_price:.2f} TL\n"
        f"- Kaynaktan doğrulanan fiyat: {price:.2f} TL\n"
        f"- Sonuç: {'Fiyat/veri güncellendi.' if changed else 'Fiyat zaten güncel; kontrol zamanı kaydedildi.'}\n"
        f"- Kontrol zamanı (UTC): {now}\n- Kaynak taramasında bulunan ürün: {len(fresh)}."
    )
    output("summary", summary.replace("\n", " | "))
    print(summary)


if __name__ == "__main__":
    main()

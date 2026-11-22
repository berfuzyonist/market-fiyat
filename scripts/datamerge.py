#!/usr/bin/env python3
"""Yayımlanan katalog ile yeni tarama sonucunu ürün bazında birleştirir.

Uzun süren bir tarama (Migros tam taraması ~2 saat) bittiğinde, o sırada ana dala
yazılmış daha yeni doğrulamalar (saatlik indirim taraması, "Fiyatı Güncelle")
ezilmemelidir. Kural: aynı ürün iki tarafta da varsa son doğrulama zamanı ("seen")
daha yeni olan satır kalır.

Yalnızca yayımlanmış katalogda olan ürünler:
- tam ve eksiksiz tarama (full/aktuel, complete): taramanın başlangıcından sonra
  doğrulanmamışsa katalogdan çıkmış sayılır ve düşer;
- indirim taraması veya kısmi tam tarama: korunur.
"""
import importlib.util
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def _collector():
    spec = importlib.util.spec_from_file_location("market_collector_merge", ROOT / "collector" / "collect.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def merge_rows(current, incoming, replace_catalog, started_ts):
    """current/incoming: id -> kayıt (seen alanıyla). Döner: (birleşik, sayaçlar)."""
    out, kept_newer, kept_only, dropped = {}, 0, 0, 0
    for pid, row in incoming.items():
        cur = current.get(pid)
        if cur and isinstance(cur.get("seen"), int) and cur["seen"] > (row.get("seen") or 0):
            out[pid] = {**cur, "cat": cur.get("cat") or row.get("cat") or ""}
            kept_newer += 1
        else:
            out[pid] = row
    for pid, cur in current.items():
        if pid in incoming:
            continue
        recent = isinstance(cur.get("seen"), int) and started_ts and cur["seen"] > started_ts
        if replace_catalog and not recent:
            dropped += 1
            continue
        out[pid] = cur
        kept_only += 1
    return out, {"kept_newer": kept_newer, "kept_current_only": kept_only, "dropped": dropped}


def merge_files(market, current_path, incoming_path, out_path, replace_catalog, started_ts):
    c = _collector()
    current_path, incoming_path, out_path = map(pathlib.Path, (current_path, incoming_path, out_path))
    current = c.parse_file(current_path, market) if current_path.exists() else {}
    incoming = c.parse_file(incoming_path, market)
    if not incoming:
        raise ValueError("yeni katalog boş")
    import json
    updated = json.loads(pathlib.Path(incoming_path).read_text(encoding="utf-8")).get("updated")
    merged, stats = merge_rows(current, incoming, replace_catalog, started_ts)
    c.write(market, merged, updated, out_path)
    return stats

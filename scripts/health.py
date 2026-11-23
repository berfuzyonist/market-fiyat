#!/usr/bin/env python3
"""Veri sağlığı denetimi: her marketin verisi ne kadar taze ve ne kadarı yakın zamanda doğrulandı?

Kullanım: health.py <rapor.md> — raporu yazar, son satırda OK ya da PROBLEM basar.
İş akışı (health.yml) buna göre "[SAĞLIK]" başlıklı talebi açar/günceller/kapatır; depoya yazmaz.
"""
import datetime
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
# Marketin verisi bu kadar saatten eskiyse sorun sayılır (zamanlanmış çalıştırma sıklığına göre).
MAX_AGE_HOURS = {"migros": 6, "sok": 6, "bim": 30}
# Ürünlerin en az bu oranı son 48 saatte kaynaktan doğrulanmış olmalı.
MIN_FRESH_RATIO = {"migros": 0.6, "sok": 0.6, "bim": 0.5}
NAMES = {"migros": "Migros", "sok": "Şok", "bim": "BİM"}
# Depo boyutu: GitHub 50 MB üstü dosyada uyarır, 100 MB'ı reddeder; Pages sitesi ve depo için önerilen üst sınır 1 GB.
FILE_WARN_MB = 25
DATA_WARN_MB = 80
PACK_WARN_MB = 700


def sizes(root=ROOT):
    """data/ dosya boyutları ve git deposunun sıkıştırılmış boyutu (MB)."""
    files = {str(f.relative_to(root)): f.stat().st_size / 1e6 for f in (root / "data").rglob("*.json")}
    pack = None
    try:
        out = subprocess.run(["git", "count-objects", "-v"], cwd=root, capture_output=True, text=True, timeout=30).stdout
        kb = {k.strip(): v.strip() for k, v in (line.split(":", 1) for line in out.splitlines() if ":" in line)}
        pack = (int(kb.get("size-pack", 0)) + int(kb.get("size", 0))) / 1000
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    return files, pack


def size_problems(files, pack):
    out = [f"{name}: {mb:.1f} MB (uyarı sınırı {FILE_WARN_MB} MB)" for name, mb in sorted(files.items()) if mb > FILE_WARN_MB]
    total = sum(files.values())
    if total > DATA_WARN_MB:
        out.append(f"data/ toplamı {total:.1f} MB (uyarı sınırı {DATA_WARN_MB} MB)")
    if pack is not None and pack > PACK_WARN_MB:
        out.append(f"git deposu {pack:.0f} MB (uyarı sınırı {PACK_WARN_MB} MB); eski veri geçmişi küçültülmeli")
    return out


def ts(value):
    try:
        dt = datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=datetime.timezone.utc)


def check(now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    report = {"checked_at": now.isoformat(timespec="seconds"), "markets": {}, "problems": []}
    for m in MAX_AGE_HOURS:
        status, data = {}, {}
        try:
            status = json.loads((ROOT / "data" / f"status-{m}.json").read_text(encoding="utf-8"))
            data = json.loads((ROOT / "data" / f"{m}.json").read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            report["problems"].append(f"{NAMES[m]}: veri/durum dosyası okunamadı ({type(e).__name__})")
        updated = ts(data.get("updated"))
        age_h = round((now - updated).total_seconds() / 3600, 1) if updated else None
        fields = data.get("fields") or []
        products = data.get("products") or []
        fresh = None
        if "seen" in fields and products:
            i, limit = fields.index("seen"), now.timestamp() - 48 * 3600
            fresh = round(sum(1 for r in products if isinstance(r[i], int) and r[i] >= limit) / len(products), 3)
        attempts = {k: {"status": v.get("status"), "checked_at": v.get("checked_at")}
                    for k, v in (status.get("last_attempt_by_mode") or {}).items()}
        entry = {"data_updated": data.get("updated"), "age_hours": age_h, "products": len(products),
                 "fresh_ratio_48h": fresh, "last_status": status.get("status"), "attempts": attempts}
        report["markets"][m] = entry
        if age_h is None or age_h > MAX_AGE_HOURS[m]:
            report["problems"].append(f"{NAMES[m]}: veri {age_h if age_h is not None else '?'} saattir güncellenmedi (sınır {MAX_AGE_HOURS[m]} sa); son deneme: {status.get('status')}")
        if fresh is not None and fresh < MIN_FRESH_RATIO[m]:
            report["problems"].append(f"{NAMES[m]}: ürünlerin yalnızca %{fresh * 100:.0f}'i son 48 saatte doğrulandı (beklenen ≥ %{MIN_FRESH_RATIO[m] * 100:.0f})")
        failing = [k for k, v in attempts.items() if str(v.get("status") or "").startswith(("hata", "durduruldu"))]
        entry["failing_modes"] = failing
    files, pack = sizes()
    report["size"] = {"data_mb": round(sum(files.values()), 1), "largest": max(files.items(), key=lambda x: x[1], default=("", 0)),
                      "repo_mb": round(pack, 1) if pack is not None else None}
    report["problems"] += size_problems(files, pack)
    report["ok"] = not report["problems"]
    return report


def main(argv):
    report = check()
    body = ["Otomatik veri sağlığı denetimi.", ""]
    body += [f"- {p}" for p in report["problems"]] or ["- Sorun yok."]
    body += ["", "| Market | Veri yaşı | Ürün | Son 48 sa doğrulanan | Son durum |", "|---|---|---|---|---|"]
    for m, e in report["markets"].items():
        fr = f"%{e['fresh_ratio_48h'] * 100:.0f}" if e["fresh_ratio_48h"] is not None else "—"
        body.append(f"| {NAMES[m]} | {e['age_hours']} sa | {e['products']} | {fr} | {str(e['last_status'])[:80]} |")
    sz = report["size"]
    body += ["", f"Depo boyutu: data/ {sz['data_mb']} MB (en büyük {sz['largest'][0]} {sz['largest'][1]:.1f} MB)"
             + (f", git {sz['repo_mb']} MB" if sz["repo_mb"] is not None else "")]
    if len(argv) > 1:
        pathlib.Path(argv[1]).write_text("\n".join(body) + "\n", encoding="utf-8")
    print("\n".join(body))
    print("OK" if report["ok"] else "PROBLEM")


if __name__ == "__main__":
    main(sys.argv)

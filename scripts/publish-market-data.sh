#!/usr/bin/env bash
# Publish the latest successful market data and every attempt's status safely.
set -euo pipefail

market="${1:?usage: publish-market-data.sh <migros|sok|bim> <mode>}"
mode="${2:?usage: publish-market-data.sh <migros|sok|bim> <mode>}"
case "$market" in
  migros|sok|bim) ;;
  *) echo "Unknown market: $market" >&2; exit 2 ;;
esac

data_rel="data/${market}.json"
status_rel="data/status-${market}.json"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

test -s "$status_rel" || { echo "Missing or empty $status_rel" >&2; exit 1; }
cp "$data_rel" "$tmp/market.json" 2>/dev/null || true
cp "$status_rel" "$tmp/status.json"

# Ensure this status was produced by the current Actions execution.
python3 - "$tmp/status.json" <<'PY'
import json, os, sys
with open(sys.argv[1], encoding="utf-8") as f:
    status = json.load(f)
if not status.get("checked_at") or "complete" not in status:
    raise SystemExit("Refusing to publish: status is missing checked_at/complete")
run_id = os.environ.get("GITHUB_RUN_ID")
if run_id and str(status.get("run_id") or "") != run_id:
    raise SystemExit("Refusing to publish: status does not belong to this Actions run")
PY

git config user.name "fiyat-botu"
git config user.email "actions@users.noreply.github.com"

# Rebuild each attempt on latest main. Failed attempts update only status.
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  echo "Publish attempt $attempt/10 for $market"
  git fetch --no-tags origin main
  git reset --hard origin/main

  python3 - "$tmp/market.json" "$tmp/status.json" "$data_rel" "$status_rel" "$market" "$mode" <<'PY'
import json, shutil, sys
incoming_data_path, incoming_status_path, data_path, status_path, market, mode = sys.argv[1:]
def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}
def stamp(value):
    return str(value or "")
incoming_data = load(incoming_data_path)
incoming = load(incoming_status_path)
current_data = load(data_path)
current = load(status_path)

# Kısmi tam tarama: tarama yarıda kaldı ama okunan ürünlerin doğrulanmış fiyatları dosyaya yazıldı.
incoming_success = ((incoming.get("status") == "tamam" and incoming.get("complete") is True)
                    or incoming.get("partial") is True)
if incoming_success:
    if not incoming_data.get("products"):
        raise SystemExit("Refusing to publish: successful market file has no products")
    if incoming_data.get("updated") != incoming.get("data_updated"):
        raise SystemExit("Refusing to publish: data.updated does not match status.data_updated")

def one_attempt(value):
    if not value or not value.get("checked_at"):
        return None
    keys = ("checked_at", "status", "complete", "found", "total", "seconds",
            "data_updated", "errors", "notes", "quality_warnings", "quality", "traffic")
    return {key: value.get(key) for key in keys}

attempts = {}
for source in (current, incoming):
    for mode_name, record in (source.get("last_attempt_by_mode") or {}).items():
        if not record or not record.get("checked_at"):
            continue
        previous = attempts.get(mode_name)
        if previous is None or stamp(record.get("checked_at")) > stamp(previous.get("checked_at")):
            attempts[mode_name] = record
    legacy = one_attempt(source)
    mode_name = source.get("mode")
    if legacy and mode_name:
        previous = attempts.get(mode_name)
        if previous is None or stamp(legacy.get("checked_at")) > stamp(previous.get("checked_at")):
            attempts[mode_name] = legacy

current_time = stamp(current.get("checked_at"))
incoming_time = stamp(incoming.get("checked_at"))
if incoming_time and (not current_time or incoming_time > current_time):
    merged_status = dict(incoming)
elif current:
    merged_status = dict(current)
else:
    merged_status = dict(incoming)

# Data freshness and attempt freshness are independent.
current_data_time = stamp(current_data.get("updated"))
incoming_data_time = stamp(incoming_data.get("updated"))
publish_data = bool(incoming_success and incoming_data_time and
                    (not current_data_time or incoming_data_time > current_data_time))
if publish_data:
    # Ürün bazında birleştir: yayımlanmış katalogda daha yeni doğrulanmış satır (saatlik indirim,
    # "Fiyatı Güncelle") uzun süren taramanın eski okumasıyla ezilmez.
    sys.path.insert(0, "scripts")
    import datetime, datamerge
    def ts(value):
        try:
            return int(datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp())
        except (TypeError, ValueError):
            return None
    replace_catalog = incoming.get("complete") is True and mode in ("full", "aktuel")
    stats = datamerge.merge_files(market, data_path, incoming_data_path, data_path,
                                  replace_catalog, ts(incoming.get("started_at")))
    print("Merged catalog:", stats)
    # Fiyat geçmişi, önceki yayımlanmış sürüm ile gerçekten yayımlanan birleşik sürüm arasından çıkarılır.
    # Geçmiş yazılamazsa fiyat verisinin yayımlanması engellenmez.
    try:
        import pricehist
        changed = pricehist.record_publish(f"data/history-{market}.json", market,
                                           current_data, load(data_path), mode)
        print("Price history changes:", changed)
    except Exception as exc:  # noqa: BLE001
        print("WARNING: price history not updated:", repr(exc))
    current_data_time = incoming_data_time

status_data_times = [
    stamp(current.get("data_updated")),
    stamp(incoming.get("data_updated")),
]
# The market JSON is the source of truth whenever it has a timestamp.
latest_data_time = current_data_time or max((v for v in status_data_times if v), default=None)
if latest_data_time:
    merged_status["data_updated"] = latest_data_time
    merged_status["last_successful_data_at"] = latest_data_time
merged_status["last_attempt_by_mode"] = attempts

with open(status_path, "w", encoding="utf-8") as f:
    json.dump(merged_status, f, ensure_ascii=False, indent=1)
    f.write("\n")
print("Published status for", incoming.get("market"), "mode", incoming.get("mode"),
      "| data updated:", latest_data_time or "unknown",
      "| market data replaced:", "yes" if publish_data else "no")
PY

  git add "$status_rel" "$data_rel"
  if [ -f "data/history-${market}.json" ]; then git add "data/history-${market}.json"; fi
  if git diff --cached --quiet; then
    echo "No newer status or data to publish for $market."
    exit 0
  fi
  git commit -m "${market}: ${mode} status/data"
  if git push origin HEAD:refs/heads/main; then
    echo "Published $market result successfully."
    exit 0
  fi
  echo "main moved during publish; refreshing and retrying without rebase."
  sleep $((attempt * 3))
done

echo "Unable to publish $market after 10 fresh-main attempts." >&2
exit 1

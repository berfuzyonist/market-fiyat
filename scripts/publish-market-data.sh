#!/usr/bin/env bash
# Conflict-free, freshness-aware publisher for one market's two data files.
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

# Preserve this run's output before moving the checkout to the latest main.
test -s "$data_rel" || { echo "Missing or empty $data_rel" >&2; exit 1; }
test -s "$status_rel" || { echo "Missing or empty $status_rel" >&2; exit 1; }
cp "$data_rel" "$tmp/market.json"
cp "$status_rel" "$tmp/status.json"

# Never publish incomplete, failed, or internally inconsistent collector output.
python3 - "$tmp/market.json" "$tmp/status.json" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
with open(sys.argv[2], encoding="utf-8") as f:
    status = json.load(f)
if status.get("status") != "tamam" or status.get("complete") is not True:
    raise SystemExit("Refusing to publish: collector status is not complete")
if not status.get("checked_at") or not status.get("data_updated"):
    raise SystemExit("Refusing to publish: checked_at/data_updated missing")
if data.get("updated") != status.get("data_updated"):
    raise SystemExit("Refusing to publish: data file updated timestamp does not match status.data_updated")
if not data.get("products"):
    raise SystemExit("Refusing to publish: product list is empty")
PY

git config user.name "fiyat-botu"
git config user.email "actions@users.noreply.github.com"

# Rebuild each attempt on the latest remote main. No rebase means no unresolved
# index state; if another market wins the push race, the next attempt retains it.
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  echo "Publish attempt $attempt/10 for $market"
  git fetch --no-tags origin main
  git reset --hard origin/main

  current_status="$tmp/current-status.json"
  if git show "origin/main:$status_rel" > "$current_status" 2>/dev/null; then
    # Older completions must never overwrite a newer successful run.
    if python3 - "$tmp/status.json" "$current_status" <<'PY'
import datetime, json, sys
def parse(path):
    with open(path, encoding="utf-8") as f:
        value = json.load(f).get("checked_at")
    if not value:
        return None
    return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
incoming, current = parse(sys.argv[1]), parse(sys.argv[2])
raise SystemExit(0 if incoming and current and incoming <= current else 1)
PY
    then
      echo "A newer or equal $market run is already on main; skipping stale publish."
      exit 0
    fi
  fi

  cp "$tmp/market.json" "$data_rel"
  cp "$tmp/status.json" "$status_rel"
  git add "$data_rel" "$status_rel"

  if git diff --cached --quiet; then
    echo "No data changes for $market."
    exit 0
  fi

  git commit -m "${market}: ${mode}"
  if git push origin HEAD:refs/heads/main; then
    echo "Published $market data successfully."
    exit 0
  fi

  echo "main moved during publish; refreshing and retrying without rebase."
  sleep $((attempt * 3))
done

echo "Unable to publish $market after 10 fresh-main attempts." >&2
exit 1

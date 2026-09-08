#!/usr/bin/env bash
# Shell integration test without touching the host filesystem or Telegram.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CASE_DIR="$(mktemp -d)"
trap 'rm -rf "$CASE_DIR"' EXIT
mkdir -p "$CASE_DIR/bin" "$CASE_DIR/state"

cat > "$CASE_DIR/bin/df" <<'EOF'
#!/usr/bin/env bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n'
printf '/dev/test 204800000 %s %s %s%% /\n' "$FAKE_USED_KIB" "$FAKE_AVAIL_KIB" "$FAKE_USED_PCT"
EOF
cat > "$CASE_DIR/bin/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CURL_LOG"
exit "${FAKE_CURL_EXIT:-0}"
EOF
chmod +x "$CASE_DIR/bin/df" "$CASE_DIR/bin/curl"

run_monitor() {
  PATH="$CASE_DIR/bin:$PATH" \
  FAKE_USED_KIB="$1" FAKE_AVAIL_KIB="$2" FAKE_USED_PCT="$3" \
  CURL_LOG="$CASE_DIR/curl.log" TELEGRAM_BOT_TOKEN=x TELEGRAM_CHAT_ID=y \
  SAHAMLENS_DISK_MONITOR_STATE_DIR="$CASE_DIR/state" \
  FAKE_CURL_EXIT="${4:-0}" \
  bash "$ROOT/disk-monitor.sh"
}

# Normal first run establishes local baseline with no Telegram message.
run_monitor 100000000 95000000 51
[[ "$(<"$CASE_DIR/state/state")" == OK ]]
[[ ! -f "$CASE_DIR/curl.log" ]]

# Critical state alerts once, repeated critical does not spam, recovery alerts once.
run_monitor 160000000 15000000 90
run_monitor 160000000 15000000 90
run_monitor 100000000 95000000 51
[[ "$(grep -c -- '--data-urlencode text=' "$CASE_DIR/curl.log")" == 2 ]]
[[ "$(<"$CASE_DIR/state/state")" == OK ]]

# Delivery failure must retain previous state so the next run retries the alert.
printf 'OK\n' > "$CASE_DIR/state/state"
if run_monitor 160000000 15000000 90 1; then
  echo 'expected Telegram delivery failure did not occur' >&2
  exit 1
fi
[[ "$(<"$CASE_DIR/state/state")" == OK ]]

echo 'disk-monitor integration test: PASS'

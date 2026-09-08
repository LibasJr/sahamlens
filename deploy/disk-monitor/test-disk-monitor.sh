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
cat > "$CASE_DIR/bin/python" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$OPS_CALL_LOG"
exit "${FAKE_RENDER_EXIT:-0}"
EOF
chmod +x "$CASE_DIR/bin/df" "$CASE_DIR/bin/python"

run_monitor() {
  PATH="$CASE_DIR/bin:$PATH" \
  FAKE_USED_KIB="$1" FAKE_AVAIL_KIB="$2" FAKE_USED_PCT="$3" \
  OPS_CALL_LOG="$CASE_DIR/renderer.log" TELEGRAM_OPS_BOT_TOKEN=x TELEGRAM_OPS_CHAT_ID=y \
  SAHAMLENS_OPS_PYTHON="$CASE_DIR/bin/python" SAHAMLENS_OPS_RENDERER=/visual-renderer.py \
  SAHAMLENS_DISK_MONITOR_STATE_DIR="$CASE_DIR/state" \
  FAKE_RENDER_EXIT="${4:-0}" \
  bash "$ROOT/disk-monitor.sh"
}

# Normal first run establishes local baseline without an Ops card.
run_monitor 100000000 95000000 51
[[ "$(<"$CASE_DIR/state/state")" == OK ]]
[[ ! -f "$CASE_DIR/renderer.log" ]]

# Critical state alerts once, repeated critical does not spam, recovery alerts once.
run_monitor 160000000 15000000 90
run_monitor 160000000 15000000 90
run_monitor 100000000 95000000 51
[[ "$(wc -l < "$CASE_DIR/renderer.log")" == 2 ]]
grep -q '/visual-renderer.py alert CRITICAL Storage CRITICAL' "$CASE_DIR/renderer.log"
grep -q '/visual-renderer.py alert OK Storage recovered' "$CASE_DIR/renderer.log"
[[ "$(<"$CASE_DIR/state/state")" == OK ]]

# Delivery failure must retain previous state so the next run retries the visual alert.
printf 'OK\n' > "$CASE_DIR/state/state"
if run_monitor 160000000 15000000 90 1; then
  echo 'expected visual renderer failure did not occur' >&2
  exit 1
fi
[[ "$(<"$CASE_DIR/state/state")" == OK ]]
! grep -qE 'sendMessage|TELEGRAM_BOT_TOKEN' "$ROOT/disk-monitor.sh"

echo 'disk-monitor integration test: PASS'

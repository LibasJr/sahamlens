#!/usr/bin/env bash
# Validates the failure alert is routed only through the visual OPS renderer.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CASE_DIR="$(mktemp -d)"
trap 'rm -rf "$CASE_DIR"' EXIT

cat > "$CASE_DIR/journalctl" <<'EOF'
#!/usr/bin/env bash
printf 'Sep 08 12:00:00 host worker[42]: upstream timeout\n'
EOF
cat > "$CASE_DIR/python" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" > "$OPS_CALL_LOG"
EOF
chmod +x "$CASE_DIR/journalctl" "$CASE_DIR/python"

PATH="$CASE_DIR:$PATH" \
TELEGRAM_OPS_BOT_TOKEN=x TELEGRAM_OPS_CHAT_ID=y \
SAHAMLENS_OPS_PYTHON="$CASE_DIR/python" \
SAHAMLENS_OPS_RENDERER=/visual-renderer.py \
OPS_CALL_LOG="$CASE_DIR/call.log" \
bash "$ROOT/cron-failure-alert.sh" sahamlens-test.service

call="$(<"$CASE_DIR/call.log")"
[[ "$call" == *'/visual-renderer.py alert DOWN Cron job failed'* ]]
[[ "$call" == *'sahamlens-test.service'* ]]
! grep -qE 'sendMessage|TELEGRAM_BOT_TOKEN' "$ROOT/cron-failure-alert.sh"
echo 'cron-failure-alert visual routing test: PASS'

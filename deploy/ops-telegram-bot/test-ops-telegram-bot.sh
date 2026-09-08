#!/usr/bin/env bash
# Native Telegram dashboard regression: no image renderer or photo API is permitted.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash -n "$ROOT/install.sh"
/usr/bin/python3 -m py_compile "$ROOT/ops-telegram-bot.py"
output=$(/usr/bin/python3 "$ROOT/ops-telegram-bot.py" native-test)
printf '%s\n' "$output" | grep -q '🛡️ <b>SAHAMLENS OPS</b>'
printf '%s\n' "$output" | grep -q '🖥️ <b>APPLICATION</b>'
printf '%s\n' "$output" | grep -q '💓 <b>API &amp; DATA</b>'
printf '%s\n' "$output" | grep -q '💾 <b>STORAGE</b>'
printf '%s\n' "$output" | grep -q '📊 <b>SCHEDULED JOBS</b>'
# Implementation must use only Telegram-native sendMessage; the test may mention
# forbidden transport names as regression assertions, so scan the Python file only.
! grep -qE 'sendPhoto|PIL|ImageDraw|render_card|\.png|tempfile' "$ROOT/ops-telegram-bot.py"
echo 'ops-telegram-bot native visual test: PASS'

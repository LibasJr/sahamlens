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

# Mode detail: /jobs harus menyebut ke-4 kategori dan jumlah job (bukan cuma
# ringkasan "no failed units" seperti snapshot default). Kalau DATABASE_URL
# tidak ada di lingkungan test, jobs_detail_text() tetap mencetak kategori
# dengan status "tidak ada riwayat run" per job -- jadi assertion ini valid
# baik dengan maupun tanpa akses DB nyata.
jobs_output=$(/usr/bin/python3 -c "
import sys
sys.path.insert(0, '$ROOT')
import importlib.util
spec = importlib.util.spec_from_file_location('bot', '$ROOT/ops-telegram-bot.py')
bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot)
print(bot.dashboard('jobs'))
")
printf '%s\n' "$jobs_output" | grep -q 'PASAR &amp; INTRADAY'
printf '%s\n' "$jobs_output" | grep -q 'FUNDAMENTAL &amp; ALIRAN DANA'
printf '%s\n' "$jobs_output" | grep -q 'SCANNER &amp; RISET'
printf '%s\n' "$jobs_output" | grep -q 'MODEL &amp; PEMELIHARAAN'
printf '%s\n' "$jobs_output" | grep -q 'INFRASTRUKTUR'
printf '%s\n' "$jobs_output" | grep -qE '<code>ai-pick-scan</code>'

health_output=$(/usr/bin/python3 -c "
import sys
sys.path.insert(0, '$ROOT')
import importlib.util
spec = importlib.util.spec_from_file_location('bot', '$ROOT/ops-telegram-bot.py')
bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot)
print(bot.dashboard('health'))
")
printf '%s\n' "$health_output" | grep -q 'POSTGRESQL'
printf '%s\n' "$health_output" | grep -q 'REDIS'
printf '%s\n' "$health_output" | grep -q 'DATA SOURCES'

# Implementation must use only Telegram-native sendMessage; the test may mention
# forbidden transport names as regression assertions, so scan the Python file only.
! grep -qE 'sendPhoto|PIL|ImageDraw|render_card|\.png|tempfile' "$ROOT/ops-telegram-bot.py"
echo 'ops-telegram-bot native visual test: PASS'


#!/usr/bin/env bash
#
# Kirim notifikasi Telegram saat sebuah unit systemd sahamlens gagal.
# Dipanggil oleh sahamlens-cron-alert@.service lewat OnFailure=sahamlens-cron-alert@%n.service
# yang dipasang di tiap unit .service sahamlens (lihat install.sh di direktori ini).
#
# Argumen $1: nama unit yang gagal (sudah didekode dari %I - bentuk manusiawi,
# mis. "sahamlens-idx-financial-sync.service").
#
# Memakai TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID yang SAMA dengan yang dipakai
# lib/telegram.ts untuk notifikasi pembayaran (satu bot, dua pemakai) - tidak
# membuat kredensial baru.
#
# Gagal kirim (network/API Telegram down) TIDAK memicu exit non-zero yang bisa
# menimbulkan OnFailure loop - unit ini sendiri tidak punya OnFailure=, dan
# kegagalan kirim cukup tercatat di journal unit ini sendiri.

set -uo pipefail

UNIT="${1:-<tidak diketahui>}"
APP="${SAHAMLENS_APP_DIR:-/opt/sahamlens/app}"
LOG_LINES="${SAHAMLENS_ALERT_LOG_LINES:-15}"

BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_CHAT_ID:-}"

if [ -z "$BOT_TOKEN" ] || [ -z "$CHAT_ID" ]; then
  echo "cron-failure-alert: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID kosong - lewati pengiriman, unit gagal: $UNIT" >&2
  exit 0
fi

# Nama asli unit systemd mengandung karakter yang tidak aman untuk HTML Telegram
# (mis. '<', '&' tidak muncul di nama unit, tapi tetap escape agar aman kalau
# konvensi penamaan berubah nanti).
html_escape() {
  sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' <<<"$1"
}

UNIT_SAFE="$(html_escape "$UNIT")"

# Ambil baris terakhir journal unit yang gagal supaya isi errornya langsung
# terbaca dari Telegram tanpa perlu login VPS. `--no-pager` wajib - tanpa itu
# journalctl bisa menunggu pager interaktif dan menggantung service ini.
JOURNAL_TAIL="$(journalctl -u "$UNIT" -n "$LOG_LINES" --no-pager 2>/dev/null | tail -c 2500)"
if [ -z "$JOURNAL_TAIL" ]; then
  JOURNAL_TAIL="(tidak bisa membaca journal untuk unit ini)"
fi
JOURNAL_SAFE="$(html_escape "$JOURNAL_TAIL")"

TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S %Z')"

MESSAGE="🔴 <b>SahamLens Cron Gagal</b>
Unit: <code>${UNIT_SAFE}</code>
Waktu: ${TIMESTAMP}

<b>Journal terakhir:</b>
<pre>${JOURNAL_SAFE}</pre>"

# --fail-with-body supaya API Telegram yang menolak (token salah, chat_id salah,
# HTML tidak valid) tidak lolos diam-diam sebagai "terkirim".
if ! curl -s --max-time 15 --fail-with-body \
    "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT_ID}" \
    --data-urlencode "parse_mode=HTML" \
    --data-urlencode "text=${MESSAGE}" >/dev/null; then
  echo "cron-failure-alert: GAGAL mengirim notifikasi Telegram untuk unit: $UNIT" >&2
  exit 1
fi

echo "cron-failure-alert: notifikasi terkirim untuk unit: $UNIT"

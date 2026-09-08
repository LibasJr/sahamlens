#!/usr/bin/env bash
#
# Kirim notifikasi Telegram saat sebuah unit systemd sahamlens gagal.
# Dipanggil oleh sahamlens-cron-alert@.service lewat OnFailure=sahamlens-cron-alert@%n.service
# yang dipasang di tiap unit .service sahamlens (lihat install.sh di direktori ini).
#
# Argumen $1: nama unit yang gagal (sudah didekode dari %I - bentuk manusiawi,
# mis. "sahamlens-idx-financial-sync.service").
#
# Memakai bot OPS yang terpisah dari bot produk/pembayaran. Semua alert dikirim
# sebagai kartu PNG oleh ops-telegram-bot.py; detail lengkap tetap di journalctl.

# Untuk test, Python dapat dioverride dengan mock tanpa mengubah host.
PYTHON_BIN="${SAHAMLENS_OPS_PYTHON:-/usr/bin/python3}"
#
# TELEGRAM_OPS_BOT_TOKEN & TELEGRAM_OPS_CHAT_ID wajib diisi di .env.production.
# TELEGRAM_BOT_TOKEN sengaja tidak dibaca agar notifikasi produk tidak tercampur.
#
# Gagal kirim (network/API Telegram down) TIDAK memicu exit non-zero yang bisa
# menimbulkan OnFailure loop - unit ini sendiri tidak punya OnFailure=, dan
# kegagalan kirim cukup tercatat di journal unit ini sendiri.

set -uo pipefail

UNIT="${1:-<tidak diketahui>}"
APP="${SAHAMLENS_APP_DIR:-/opt/sahamlens/app}"
LOG_LINES="${SAHAMLENS_ALERT_LOG_LINES:-15}"

BOT_TOKEN="${TELEGRAM_OPS_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_OPS_CHAT_ID:-}"
OPS_RENDERER="${SAHAMLENS_OPS_RENDERER:-/opt/sahamlens/scripts/ops-telegram-bot.py}"

if [ -z "$BOT_TOKEN" ] || [ -z "$CHAT_ID" ]; then
  echo "cron-failure-alert: TELEGRAM_OPS_BOT_TOKEN/TELEGRAM_OPS_CHAT_ID kosong - lewati pengiriman, unit gagal: $UNIT" >&2
  exit 0
fi

# Ambil baris terakhir journal unit yang gagal supaya isi errornya langsung
# terbaca dari Telegram tanpa perlu login VPS. `--no-pager` wajib - tanpa itu
# journalctl bisa menunggu pager interaktif dan menggantung service ini.
JOURNAL_TAIL="$(journalctl -u "$UNIT" -n "$LOG_LINES" --no-pager 2>/dev/null | tail -c 2500)"
if [ -z "$JOURNAL_TAIL" ]; then
  JOURNAL_TAIL="(tidak bisa membaca journal untuk unit ini)"
fi
# Konsol Ops WAJIB visual-only. Ringkas journal menjadi satu baris agar tetap
# terbaca pada kartu PNG; detail lengkap tetap ada di journalctl pada VPS.
JOURNAL_ONE_LINE="$(printf '%s' "$JOURNAL_TAIL" | tr '\n' ' ' | tr -s ' ' | cut -c1-220)"
DETAIL="${UNIT}: ${JOURNAL_ONE_LINE}"

if ! "$PYTHON_BIN" "$OPS_RENDERER" alert DOWN 'Cron job failed' "$DETAIL"; then
  echo "cron-failure-alert: GAGAL mengirim kartu visual Telegram untuk unit: $UNIT" >&2
  exit 1
fi

echo "cron-failure-alert: kartu visual terkirim untuk unit: $UNIT"

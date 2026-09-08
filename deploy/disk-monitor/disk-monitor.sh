#!/usr/bin/env bash
# Monitor kapasitas filesystem SahamLens. Alert hanya ketika memasuki kondisi
# rendah/kritis atau berpindah level; kondisi pulih juga diberi satu notifikasi.
# Tidak menghapus data maupun mengubah filesystem.
set -euo pipefail

PATH_TO_CHECK="${SAHAMLENS_DISK_MONITOR_PATH:-/}"
MIN_FREE_GB="${SAHAMLENS_DISK_MONITOR_MIN_FREE_GB:-20}"
MAX_USED_PCT="${SAHAMLENS_DISK_MONITOR_MAX_USED_PCT:-85}"
STATE_DIR="${SAHAMLENS_DISK_MONITOR_STATE_DIR:-/var/lib/sahamlens/disk-monitor}"
STATE_FILE="$STATE_DIR/state"
BOT_TOKEN="${TELEGRAM_OPS_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_OPS_CHAT_ID:-}"
OPS_RENDERER="${SAHAMLENS_OPS_RENDERER:-/opt/sahamlens/scripts/ops-telegram-bot.py}"
PYTHON_BIN="${SAHAMLENS_OPS_PYTHON:-/usr/bin/python3}"

is_uint() { [[ "$1" =~ ^[0-9]+$ ]]; }
for value in "$MIN_FREE_GB" "$MAX_USED_PCT"; do
  is_uint "$value" || { echo "disk-monitor: threshold bukan integer: $value" >&2; exit 2; }
done
(( MAX_USED_PCT <= 100 )) || { echo "disk-monitor: MAX_USED_PCT harus <= 100" >&2; exit 2; }

# POSIX output (-P) mencegah device panjang memecah kolom. Blocks df adalah KiB.
line="$(df -Pk "$PATH_TO_CHECK" | awk 'NR == 2 { print $1 "|" $2 "|" $3 "|" $4 "|" $5 "|" $6 }')"
IFS='|' read -r filesystem total_kib used_kib available_kib used_pct_raw mountpoint <<< "$line"
[[ -n "${mountpoint:-}" ]] || { echo "disk-monitor: df tidak menghasilkan filesystem untuk $PATH_TO_CHECK" >&2; exit 2; }

used_pct="${used_pct_raw%%%}"
is_uint "$available_kib" && is_uint "$used_pct" || { echo "disk-monitor: output df tidak valid: $line" >&2; exit 2; }
free_gb=$(( available_kib / 1024 / 1024 ))

level="OK"
reason=""
if (( available_kib < MIN_FREE_GB * 1024 * 1024 && used_pct >= MAX_USED_PCT )); then
  level="CRITICAL"
  reason="sisa < ${MIN_FREE_GB} GB dan penggunaan >= ${MAX_USED_PCT}%"
elif (( available_kib < MIN_FREE_GB * 1024 * 1024 )); then
  level="LOW"
  reason="sisa < ${MIN_FREE_GB} GB"
elif (( used_pct >= MAX_USED_PCT )); then
  level="LOW"
  reason="penggunaan >= ${MAX_USED_PCT}%"
fi

previous=""
if [[ -r "$STATE_FILE" ]]; then previous="$(<"$STATE_FILE")"; fi
if [[ "$previous" == "$level" ]]; then
  echo "disk-monitor: $mountpoint ${used_pct}% / ${free_gb}GB free ($level; tidak ada perubahan)"
  exit 0
fi

# Kondisi OK awal dicatat tanpa Telegram agar tidak menambah noise. Alert hanya
# dikirim saat LOW/CRITICAL atau saat pulih dari sebelumnya LOW/CRITICAL.
if [[ "$level" == "OK" && -z "$previous" ]]; then
  install -d -m 0750 "$STATE_DIR"
  printf '%s\n' "$level" > "$STATE_FILE"
  chmod 0640 "$STATE_FILE"
  echo "disk-monitor: baseline $mountpoint ${used_pct}% / ${free_gb}GB free (OK)"
  exit 0
fi

if [[ -z "$BOT_TOKEN" || -z "$CHAT_ID" ]]; then
  echo "disk-monitor: TELEGRAM_OPS_BOT_TOKEN/TELEGRAM_OPS_CHAT_ID kosong; status berubah $previous -> $level" >&2
  exit 1
fi

if [[ "$level" == "OK" ]]; then
  card_level="OK"
  heading="Storage recovered"
  detail="${mountpoint}: ${used_pct}% used · ${free_gb} GB free · capacity returned to the safe threshold"
else
  card_level="$level"
  heading="Storage ${level}"
  detail="${mountpoint}: ${used_pct}% used · ${free_gb} GB free · ${reason} · no automatic cleanup"
fi

if ! "$PYTHON_BIN" "$OPS_RENDERER" alert "$card_level" "$heading" "$detail"; then
  echo "disk-monitor: gagal mengirim kartu visual untuk transisi $previous -> $level" >&2
  exit 1
fi

install -d -m 0750 "$STATE_DIR"
printf '%s\n' "$level" > "$STATE_FILE"
chmod 0640 "$STATE_FILE"
echo "disk-monitor: kartu visual terkirim untuk transisi $previous -> $level ($mountpoint ${used_pct}% / ${free_gb}GB free)"

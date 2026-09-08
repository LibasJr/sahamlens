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
BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_CHAT_ID:-}"

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
  echo "disk-monitor: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID kosong; status berubah $previous -> $level" >&2
  exit 1
fi

if [[ "$level" == "OK" ]]; then
  icon="🟢"
  heading="SahamLens Storage Pulih"
  detail="Kapasitas kembali dalam ambang aman."
else
  icon="⚠️"
  heading="SahamLens Storage ${level}"
  detail="Penyebab: ${reason}. Tidak ada cleanup otomatis yang dilakukan."
fi

timestamp="$(date '+%Y-%m-%d %H:%M:%S %Z')"
message="${icon} <b>${heading}</b>
Mount: <code>${mountpoint}</code>
Filesystem: <code>${filesystem}</code>
Terpakai: <b>${used_pct}%</b>
Sisa: <b>${free_gb} GB</b>
Ambang: sisa &lt; ${MIN_FREE_GB} GB atau terpakai &gt;= ${MAX_USED_PCT}%
${detail}
Waktu: ${timestamp}"

if ! curl -s --max-time 15 --fail-with-body \
  "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${CHAT_ID}" \
  --data-urlencode "parse_mode=HTML" \
  --data-urlencode "text=${message}" >/dev/null; then
  echo "disk-monitor: gagal mengirim Telegram untuk transisi $previous -> $level" >&2
  exit 1
fi

install -d -m 0750 "$STATE_DIR"
printf '%s\n' "$level" > "$STATE_FILE"
chmod 0640 "$STATE_FILE"
echo "disk-monitor: Telegram terkirim untuk transisi $previous -> $level ($mountpoint ${used_pct}% / ${free_gb}GB free)"

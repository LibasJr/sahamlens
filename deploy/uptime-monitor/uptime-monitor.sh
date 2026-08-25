#!/usr/bin/env bash
#
# Pemantau ketersediaan SahamLens - BARU (2026-08-25).
#
# KENAPA INI ADA, dan kenapa Sentry tidak cukup. Sentry melaporkan galat yang dikirim
# oleh proses yang MASIH HIDUP. Ia tidak bisa melaporkan proses yang mati total,
# tunnel yang putus, atau - yang paling halus - produksi yang masih menyajikan build
# lama padahal workflow deploy-nya hijau (CLAUDE.md §7, kejadian 23 Agustus 2026:
# `git pull` di checkout produksi membuat deploy berikutnya jadi no-op yang MELAPOR
# SUKSES, dan pengguna dilayani build berumur dua belas jam tanpa satu pun tanda merah).
#
# Skrip ini memeriksa hal-hal yang justru TIDAK terlihat dari mana pun kalau tidak
# diperiksa dari luar:
#
#   1. Aplikasi menjawab HTTP sama sekali          -> proses hidup
#   2. `status` di /api/health                     -> DB & Redis (Redis fail-open, lihat route-nya)
#   3. BUILD_ID yang DISAJIKAN vs yang di disk     -> build lama masih dilayani
#   4. `deployed-sha` vs HEAD repo                 -> deploy "sukses" yang tidak berpindah versi
#   5. Umur & jumlah restart servis                -> restart loop
#
# TIDAK me-restart apa pun. Restart otomatis sudah punya tempatnya sendiri
# (deploy/cloudflared-watchdog/), dan me-restart untuk keadaan yang tidak bisa
# diperbaiki restart cuma menukar satu kegagalan diam dengan kegagalan berisik.
#
# Alternatif eksternal (Uptime Kuma, healthchecks.io, Better Stack) tetap berguna dan
# TIDAK digantikan skrip ini: pemantau yang berjalan di mesin yang sama tidak bisa
# melaporkan mesin itu mati. Pasang salah satunya untuk cek dari luar; skrip ini
# menangkap kelas kegagalan yang justru TIDAK terlihat dari luar - poin 3 dan 4 di atas
# tetap membalas HTTP 200 yang sempurna bagi pemantau eksternal mana pun.

set -uo pipefail

APP="${SAHAMLENS_APP_DIR:-/opt/sahamlens/app}"
STATE_FILE="${SAHAMLENS_DEPLOY_STATE:-/opt/sahamlens/deployed-sha}"
ORIGIN="${SAHAMLENS_ORIGIN:-http://127.0.0.1:3001}"
SERVICE="${SAHAMLENS_SERVICE:-sahamlens}"
TIMEOUT_SEC="${SAHAMLENS_MONITOR_TIMEOUT:-20}"
# Opsional. Kalau kosong, peringatan hanya masuk journal - `journalctl -u
# sahamlens-uptime-monitor` tetap merekam semuanya.
WEBHOOK="${SAHAMLENS_ALERT_WEBHOOK:-}"

problems=()
note() { echo "uptime-monitor: $*"; }
problem() { problems+=("$1"); echo "uptime-monitor: MASALAH - $1" >&2; }

# --- 1. Aplikasi menjawab? ------------------------------------------------------------
#
# SATU permintaan untuk body DAN status. Dua permintaan terpisah bisa mengenai keadaan
# yang berbeda, dan yang dilaporkan lalu menjadi campuran dari dua momen.
health_file="$(mktemp)"
trap 'rm -f "$health_file"' EXIT
health_code="$(curl -s --max-time "$TIMEOUT_SEC" -o "$health_file" -w '%{http_code}' "$ORIGIN/api/health" 2>/dev/null)"
# curl gagal total (DNS/TLS/koneksi ditolak/timeout) -> tidak menulis apa pun ke stdout.
# `|| echo 000` di belakang pipa TIDAK bisa dipakai di sini: -w tetap mencetak "000"
# lebih dulu, sehingga keduanya bergabung jadi "000000" dan tidak cocok dengan cek apa pun.
[ -z "$health_code" ] && health_code=000
health_body="$(cat "$health_file")"

if [ "$health_code" = "000" ]; then
  problem "aplikasi tidak menjawab di $ORIGIN/api/health (proses mati atau port tidak mendengar)"
else
  # --- 2. Status aplikasi -------------------------------------------------------------
  #
  # Diurai dengan parser JSON sungguhan, bukan grep. `grep '"status":"'` diam-diam
  # bergantung pada JSON yang dirapatkan tanpa spasi - ia membaca string kosong (dan
  # melaporkan MASALAH palsu) begitu ada yang menyisipkan pretty-printer di depan
  # endpoint ini. Pemantau yang memberi alarm palsu akan dimatikan orang dalam seminggu.
  parsed="$(printf '%s' "$health_body" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("PARSE_ERROR\t")
else:
    print("%s\t%s" % (d.get("status", ""), ",".join(d.get("degraded", []) or [])))
' 2>/dev/null)"
  app_status="${parsed%%	*}"
  degraded="${parsed#*	}"

  if [ "$app_status" = "PARSE_ERROR" ] || [ -z "$app_status" ]; then
    problem "balasan /api/health bukan JSON yang bisa diurai (HTTP $health_code)"
  elif [ "$app_status" != "ok" ]; then
    problem "health melaporkan status='$app_status' (HTTP $health_code)${degraded:+ - terganggu: $degraded}"
  else
    note "health ok (HTTP $health_code)"
  fi
fi

# --- 3. BUILD_ID yang DISAJIKAN vs yang ada di disk -----------------------------------
#
# Ini pemeriksaan yang paling penting di seluruh skrip, dan yang paling mudah dilewatkan:
# `next start` memegang manifest build yang dimuatnya saat start. Kalau ada yang menulis
# ulang .next/ tanpa restart, disk dan proses berbeda - permintaan chunk berhash lama
# membalas 404, dan tidak ada satu pun proses yang menganggap dirinya bermasalah.
disk_build_id=""
[ -f "$APP/.next/BUILD_ID" ] && disk_build_id="$(cat "$APP/.next/BUILD_ID" 2>/dev/null)"
served_build_id="$(curl -s --max-time "$TIMEOUT_SEC" "$ORIGIN/" 2>/dev/null | grep -o '"buildId":"[^"]*"' | head -1 | cut -d'"' -f4)"

if [ -z "$disk_build_id" ]; then
  problem "$APP/.next/BUILD_ID tidak ada - direktori build tidak lengkap"
elif [ -z "$served_build_id" ]; then
  note "buildId tidak terbaca dari HTML beranda - dilewati (bukan bukti sehat maupun rusak)"
elif [ "$disk_build_id" != "$served_build_id" ]; then
  problem "produksi menyajikan build LAMA: disajikan=$served_build_id, di disk=$disk_build_id - servis perlu di-restart"
else
  note "buildId disajikan == disk ($served_build_id)"
fi

# --- 4. SHA yang benar-benar ter-deploy vs HEAD repo -----------------------------------
if [ -f "$STATE_FILE" ] && [ -d "$APP/.git" ]; then
  deployed_sha="$(cat "$STATE_FILE" 2>/dev/null | tr -d '[:space:]')"
  head_sha="$(git -C "$APP" rev-parse HEAD 2>/dev/null)"
  if [ -n "$deployed_sha" ] && [ -n "$head_sha" ] && [ "$deployed_sha" != "$head_sha" ]; then
    problem "checkout produksi ada di $head_sha tapi yang benar-benar ter-deploy $deployed_sha - jalankan deploy-sahamlens --force"
  fi
fi

# --- 5. Restart loop -------------------------------------------------------------------
if command -v systemctl >/dev/null 2>&1; then
  n_restarts="$(systemctl show "$SERVICE" --property=NRestarts --value 2>/dev/null || echo "")"
  active_since="$(systemctl show "$SERVICE" --property=ActiveEnterTimestamp --value 2>/dev/null || echo "")"
  note "servis $SERVICE aktif sejak '${active_since:-?}', NRestarts=${n_restarts:-?}"
  if [ -n "$active_since" ]; then
    since_epoch="$(date -d "$active_since" +%s 2>/dev/null || echo 0)"
    now_epoch="$(date +%s)"
    if [ "$since_epoch" -gt 0 ] && [ $((now_epoch - since_epoch)) -lt 120 ]; then
      note "servis baru saja restart (<2 menit) - normal seusai deploy, mencurigakan kalau berulang"
    fi
  fi
fi

# --- Pelaporan --------------------------------------------------------------------------
if [ "${#problems[@]}" -eq 0 ]; then
  note "seluruh pemeriksaan lolos"
  exit 0
fi

summary="SahamLens: ${#problems[@]} masalah terdeteksi pada $(date -Is)"
for p in "${problems[@]}"; do summary="$summary"$'\n'"- $p"; done

if [ -n "$WEBHOOK" ]; then
  # --fail-with-body supaya webhook yang menolak tidak lolos diam-diam sebagai "terkirim".
  if ! curl -s --max-time 15 --fail-with-body \
      -H 'Content-Type: application/json' \
      --data "$(printf '%s' "$summary" | python3 -c 'import json,sys; print(json.dumps({"text": sys.stdin.read()}))')" \
      "$WEBHOOK" >/dev/null; then
    echo "uptime-monitor: GAGAL mengirim peringatan ke webhook - isinya tetap ada di journal" >&2
  fi
fi

# Exit non-nol supaya `systemctl status` dan `journalctl -p err` ikut menandainya.
exit 1

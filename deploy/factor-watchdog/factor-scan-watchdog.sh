#!/usr/bin/env bash
# SahamLens - pengawas bulanan bukti faktor risiko.
#
# Halaman /admin/profil-risiko memeringkat emiten dengan dua ciri (volatilitas 60 sesi rendah,
# jarak dari puncak 52 minggu) karena keduanya punya IC positif di train DAN luar sampel.
# Bukti seperti itu bisa luntur. Pengawas ini menghitung ulang tiap bulan dengan skrip yang
# sama (dibekukan, tanpa mengubah daftar faktor) lalu MENYALAKAN ALARM bila ciri yang dipakai
# halaman tidak lagi positif di luar sampel.
#
# Alarm = kode keluar 1 + baris "ALARM FAKTOR" di journal + webhook bila SAHAMLENS_ALERT_WEBHOOK
# diset. Alarm TIDAK mengubah halaman apa pun: keputusan tetap di operator, tapi kali ini
# buktinya kedaluwarsa di depan mata, bukan hilang diam-diam.
set -euo pipefail

APP_DIR=/opt/sahamlens/app
ENV_FILE="$APP_DIR/.env.production"
REPORT_DIR=/opt/sahamlens/reports/factor-scan

if [ ! -f "$ENV_FILE" ]; then
  echo "[pengawas-faktor] env produksi tidak ditemukan: $ENV_FILE" >&2
  exit 2
fi

if [ -z "${DATABASE_URL:-}" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

mkdir -p "$REPORT_DIR"
REPORT="$REPORT_DIR/factor-scan-$(date +%F).md"

cd "$APP_DIR"
set +e
node scripts/factor-research.mjs --watch --markdown "$REPORT"
CODE=$?
set -e

echo "[pengawas-faktor] kode keluar ${CODE}, laporan: ${REPORT}"

if [ "$CODE" -ne 0 ] && [ -n "${SAHAMLENS_ALERT_WEBHOOK:-}" ]; then
  PAYLOAD=$(printf '{"text":"SahamLens: pengawas faktor risiko bulanan menyalakan alarm. Bukti ciri profil risiko tidak lagi positif di luar sampel. Laporan: %s"}' "$REPORT")
  curl -fsS -m 15 -X POST -H 'Content-Type: application/json' -d "$PAYLOAD" "$SAHAMLENS_ALERT_WEBHOOK" >/dev/null 2>&1 ||
    echo "[pengawas-faktor] webhook gagal dihubungi, alarm tetap tercatat di journal" >&2
fi

exit "$CODE"
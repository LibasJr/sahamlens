#!/usr/bin/env bash
# SahamLens - rekam snapshot skor LensRadar sekali pakai per sesi (append-only).
#
# Kenapa: lens_radar_history menambah baris baru setiap kali skor dihitung ulang, jadi arsip
# tidak bisa membuktikan "skor apa yang ditampilkan produk pada sesi itu". Snapshot ini
# direkam SEKALI per (ticker, tanggal) dan tidak pernah diubah (on conflict do nothing).
#
# Kalau .env.production tidak ada, skrip berhenti dengan kode 2 dan alasannya jelas di journal
# - bukan diam-diam melaporkan "sukses".
set -euo pipefail

APP_DIR=/opt/sahamlens/app
ENV_FILE="$APP_DIR/.env.production"

if [ ! -f "$ENV_FILE" ]; then
  echo "[snapshot-skor] env produksi tidak ditemukan: $ENV_FILE" >&2
  exit 2
fi

if [ -z "${DATABASE_URL:-}" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

cd "$APP_DIR"
exec node scripts/snapshot-lens-scores.mjs --lookback "${SNAPSHOT_LOOKBACK:-3}"
#!/usr/bin/env bash
# Pasang pembungkus cron SahamLens (menjalankan rute /api/cron/<job> dengan Bearer CRON_SECRET)
# ke /usr/local/bin agar berkas di VPS selalu sama dengan yang ada di repo.
#
# Daftar izin job dijaga ketat: hanya job yang benar-benar punya unit systemd yang boleh
# dijalankan, supaya tidak ada rute cron yang bisa dipicu dari luar templat ini.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
TARGET="/usr/local/bin/sahamlens-cron.mjs"

sudo install -m 0755 "$APP_ROOT/deploy/cron-wrapper/sahamlens-cron.mjs" "$TARGET"
if ! diff -q "$APP_ROOT/deploy/cron-wrapper/sahamlens-cron.mjs" "$TARGET" >/dev/null; then
  echo "GAGAL: pembungkus di $TARGET tidak identik dengan repo" >&2
  exit 1
fi
echo "Pembungkus cron terpasang dan identik dengan repo: $TARGET"

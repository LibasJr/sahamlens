#!/usr/bin/env bash
# Pemasang unit sinkron bukti makro resmi (timer bulanan) di VPS produksi.
#
# Rute /api/cron/macro-evidence-sync dijalankan lewat templat systemd yang sudah ada
# (sahamlens-cron@.service -> /usr/local/bin/sahamlens-cron.mjs) supaya tidak ada
# cangkang curl + kredensial yang disalin-tempel di berkas unit. Nama job WAJIB ada di
# daftar izin pembungkus; lihat deploy/cron-wrapper/install.sh.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
UNIT_DIR="/etc/systemd/system"
NAME="sahamlens-macro-evidence-sync"

sudo install -m 0644 "$APP_ROOT/deploy/macro-evidence-sync/${NAME}.timer" "$UNIT_DIR/${NAME}.timer"
sudo systemctl daemon-reload
sudo systemctl enable --now "${NAME}.timer"
systemctl list-timers --all "${NAME}.timer" --no-pager || true

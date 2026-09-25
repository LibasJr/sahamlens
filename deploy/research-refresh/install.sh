#!/usr/bin/env bash
# Pemasang unit penyegaran bukti validasi (timer mingguan) di VPS produksi.
#
# Rute /api/cron/research-refresh dijalankan lewat templat systemd yang sudah ada
# (sahamlens-cron@.service -> /usr/local/bin/sahamlens-cron.mjs) supaya tidak ada
# cangkang curl + kredensial yang disalin-tempel di berkas unit.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
UNIT_DIR="/etc/systemd/system"
NAME="sahamlens-research-refresh"

sudo install -m 0644 "$APP_ROOT/deploy/research-refresh/${NAME}.timer" "$UNIT_DIR/${NAME}.timer"
sudo systemctl daemon-reload
sudo systemctl enable --now "${NAME}.timer"
systemctl list-timers --all "${NAME}.timer" --no-pager || true
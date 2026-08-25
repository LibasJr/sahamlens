#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
UNIT_DIR="/etc/systemd/system"
NAME="sahamlens-uptime-monitor"
# /opt/sahamlens/scripts TIDAK dijamin ada. Ia hanya dibuat oleh instruksi manual di
# deploy/cloudflared-watchdog/README.md, yang statusnya "BELUM AKTIF sampai dipasang
# manual" - jadi tanpa baris ini, `install -m 0755 ... /opt/sahamlens/scripts/...`
# gagal begitu saja di VPS baru/bersih (ditemukan & diperbaiki 2026-08-26).
sudo install -d -m 0755 /opt/sahamlens/scripts
sudo install -m 0755 "$APP_ROOT/deploy/uptime-monitor/uptime-monitor.sh" /opt/sahamlens/scripts/uptime-monitor.sh
sudo install -m 0644 "$APP_ROOT/deploy/uptime-monitor/${NAME}.service" "$UNIT_DIR/${NAME}.service"
sudo install -m 0644 "$APP_ROOT/deploy/uptime-monitor/${NAME}.timer" "$UNIT_DIR/${NAME}.timer"
sudo systemctl daemon-reload
sudo systemctl enable --now "${NAME}.timer"
systemctl list-timers --all "${NAME}.timer" --no-pager || true

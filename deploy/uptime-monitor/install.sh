#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
UNIT_DIR="/etc/systemd/system"
NAME="sahamlens-uptime-monitor"
sudo install -m 0755 "$APP_ROOT/deploy/uptime-monitor/uptime-monitor.sh" /opt/sahamlens/scripts/uptime-monitor.sh
sudo install -m 0644 "$APP_ROOT/deploy/uptime-monitor/${NAME}.service" "$UNIT_DIR/${NAME}.service"
sudo install -m 0644 "$APP_ROOT/deploy/uptime-monitor/${NAME}.timer" "$UNIT_DIR/${NAME}.timer"
sudo systemctl daemon-reload
sudo systemctl enable --now "${NAME}.timer"
systemctl list-timers --all "${NAME}.timer" --no-pager || true

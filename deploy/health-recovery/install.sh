#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="${APP_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
UNIT_DIR="/etc/systemd/system"
NAME="sahamlens-health-recovery"

sudo install -d -m 0755 /opt/sahamlens/scripts
sudo install -m 0755 "$APP_ROOT/scripts/health-auto-recovery.mjs" /opt/sahamlens/scripts/health-auto-recovery.mjs
sudo install -m 0644 "$APP_ROOT/deploy/health-recovery/${NAME}.service" "$UNIT_DIR/${NAME}.service"
sudo install -m 0644 "$APP_ROOT/deploy/health-recovery/${NAME}.timer" "$UNIT_DIR/${NAME}.timer"
sudo systemctl daemon-reload
sudo systemctl enable --now "${NAME}.timer"
systemctl list-timers --all "${NAME}.timer" --no-pager || true

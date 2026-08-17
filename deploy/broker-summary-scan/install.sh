#!/usr/bin/env bash
set -euo pipefail

NAME="sahamlens-broker-summary-scan"
APP_ROOT="/opt/sahamlens/app"
UNIT_DIR="/etc/systemd/system"

sudo install -m 0644 "$APP_ROOT/deploy/broker-summary-scan/${NAME}.service" "$UNIT_DIR/${NAME}.service"
sudo install -m 0644 "$APP_ROOT/deploy/broker-summary-scan/${NAME}.timer" "$UNIT_DIR/${NAME}.timer"
sudo systemctl daemon-reload
sudo systemctl enable --now "${NAME}.timer"
systemctl list-timers --all "${NAME}.timer" --no-pager || true

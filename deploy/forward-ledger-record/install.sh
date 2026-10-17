#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
UNIT_DIR="/etc/systemd/system"
NAME="sahamlens-forward-ledger-record"

sudo install -m 0644 "$APP_ROOT/deploy/forward-ledger-record/${NAME}.service" "$UNIT_DIR/${NAME}.service"
sudo install -m 0644 "$APP_ROOT/deploy/forward-ledger-record/${NAME}.timer" "$UNIT_DIR/${NAME}.timer"
sudo systemctl daemon-reload
sudo systemctl enable --now "${NAME}.timer"

systemctl list-timers --all "${NAME}.timer" --no-pager || true

#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
UNIT_DIR="/etc/systemd/system"
NAME="sahamlens-signal-bot"

sudo install -m 0644 "$APP_ROOT/deploy/signal-bot/${NAME}.service" "$UNIT_DIR/${NAME}.service"
sudo install -m 0644 "$APP_ROOT/deploy/signal-bot/${NAME}.timer"   "$UNIT_DIR/${NAME}.timer"
sudo systemctl daemon-reload
sudo systemctl enable --now "${NAME}.timer"

echo "✅ ${NAME}.timer installed and enabled"
systemctl list-timers "${NAME}.timer"

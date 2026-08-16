#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
UNIT_DIR="/etc/systemd/system"
NAME="sahamlens-ownership-flow-ksei-sync"

if [[ ! -f "$APP_ROOT/deploy/ownership-flow-ksei-sync/${NAME}.service" ]]; then
  echo "ERROR: file service tidak ditemukan di $APP_ROOT/deploy/ownership-flow-ksei-sync" >&2
  exit 1
fi

sudo install -m 0644 "$APP_ROOT/deploy/ownership-flow-ksei-sync/${NAME}.service" "$UNIT_DIR/${NAME}.service"
sudo install -m 0644 "$APP_ROOT/deploy/ownership-flow-ksei-sync/${NAME}.timer" "$UNIT_DIR/${NAME}.timer"
sudo systemctl daemon-reload
sudo systemctl enable --now "${NAME}.timer"

echo
echo "Timer terpasang. Verifikasi:"
systemctl list-timers --all "${NAME}.timer" --no-pager || true

echo
echo "Tes manual pertama (setelah app versi baru sudah restart):"
echo "  sudo systemctl start ${NAME}.service"
echo "  sudo journalctl -u ${NAME}.service -n 100 --no-pager"

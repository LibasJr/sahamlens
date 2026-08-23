#!/usr/bin/env bash
# Pasang timer perawatan mingguan + worktree perawatan yang dipakainya.
# Aman dijalankan berulang.
set -euo pipefail
APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
WORKTREE="${MAINTENANCE_WORKTREE:-/opt/sahamlens/maintenance}"
UNIT_DIR="/etc/systemd/system"
NAME="sahamlens-weekly-maintenance"

# Worktree terpisah, bukan checkout produksi: verify:prod memuat `next build` dan
# build di /opt/sahamlens/app menimpa .next/ yang sedang dilayani (CLAUDE.md §7).
if [ ! -d "$WORKTREE" ]; then
  echo "== membuat worktree perawatan di $WORKTREE =="
  git -C "$APP_ROOT" fetch --prune origin main
  git -C "$APP_ROOT" worktree add --detach "$WORKTREE" origin/main
fi

echo "== memasang dependency di worktree perawatan =="
( cd "$WORKTREE" && npm ci )

sudo install -m 0644 "$APP_ROOT/deploy/weekly-maintenance/${NAME}.service" "$UNIT_DIR/${NAME}.service"
sudo install -m 0644 "$APP_ROOT/deploy/weekly-maintenance/${NAME}.timer" "$UNIT_DIR/${NAME}.timer"
sudo systemctl daemon-reload
sudo systemctl enable --now "${NAME}.timer"
systemctl list-timers --all "${NAME}.timer" --no-pager || true

echo
echo "Coba sekali tanpa menunggu jadwal:"
echo "  sudo systemctl start ${NAME}.service"
echo "  journalctl -u ${NAME}.service -f"

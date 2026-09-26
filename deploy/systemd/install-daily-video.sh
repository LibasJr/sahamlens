#!/usr/bin/env bash
# Install SahamLens daily-video generator systemd units. Safe to re-run.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
UNIT_NAME=sahamlens-daily-video.service
TIMER_NAME=sahamlens-daily-video.timer
SCRIPT_DEST=/opt/sahamlens/scripts/tiktok/main.py
UNIT_DEST=/etc/systemd/system/$UNIT_NAME
TIMER_DEST=/etc/systemd/system/$TIMER_NAME
REPO_UNIT_DIR="$APP_ROOT/deploy/systemd"

require_env() {
  local key="$1"
  if ! grep -qE "^${key}=.+" "$APP_ROOT/.env.production"; then
    echo "daily-video install: $key belum terisi di $APP_ROOT/.env.production — send path akan fail closed." >&2
    echo "Nilai tidak wajib untuk render-only / dry-run, tapi send akan menolak." >&2
  fi
}
# These are NOT hard-required — code fails closed without them.
require_env TELEGRAM_BOT_TOKEN
require_env TELEGRAM_CHAT_ID

sudo install -d -m 0755 /opt/sahamlens/scripts/tiktok
sudo install -m 0755 "$APP_ROOT/scripts/tiktok/main.py" "$SCRIPT_DEST"
sudo install -m 0755 "$APP_ROOT/scripts/tiktok/video_renderer.py" "/opt/sahamlens/scripts/tiktok/video_renderer.py"
sudo install -m 0755 "$APP_ROOT/scripts/tiktok/data_adapter.py" "/opt/sahamlens/scripts/tiktok/data_adapter.py"
sudo install -m 0644 "$REPO_UNIT_DIR/$UNIT_NAME" "$UNIT_DEST"
sudo install -m 0644 "$REPO_UNIT_DIR/$TIMER_NAME" "$TIMER_DEST"
sudo install -d -o lens -g lens -m 0750 /var/lib/sahamlens/daily-video
sudo systemctl daemon-reload
echo "Units installed. To activate (operator decision):"
echo "  sudo systemctl enable --now $TIMER_NAME"
echo ""
echo "Manual dry-run:"
echo "  SAHAMLENS_BASE_URL=http://127.0.0.1:3001 python3 $SCRIPT_DEST dry-run --out /tmp/sahamlens_dryrun.mp4"

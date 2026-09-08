#!/usr/bin/env bash
# Install the visual-only Telegram operations console. Safe to re-run.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
UNIT_NAME=sahamlens-ops-telegram-bot.service
SCRIPT_DEST=/opt/sahamlens/scripts/ops-telegram-bot.py
UNIT_DEST=/etc/systemd/system/$UNIT_NAME

require_env() {
  local key="$1"
  if ! grep -qE "^${key}=.+" "$APP_ROOT/.env.production"; then
    echo "ops-telegram-bot install: $key belum terisi di $APP_ROOT/.env.production" >&2
    exit 2
  fi
}
require_env TELEGRAM_OPS_BOT_TOKEN
require_env TELEGRAM_OPS_CHAT_ID

# Pillow comes from the OS package, not npm: it is only used by this isolated
# operations process to render PNG cards and never enters the application bundle.
/usr/bin/python3 -c 'from PIL import Image' 2>/dev/null || {
  echo 'ops-telegram-bot install: python3-pil belum terpasang (apt install python3-pil)' >&2
  exit 2
}

sudo install -d -m 0755 /opt/sahamlens/scripts
sudo install -m 0755 "$APP_ROOT/deploy/ops-telegram-bot/ops-telegram-bot.py" "$SCRIPT_DEST"
sudo install -m 0644 "$APP_ROOT/deploy/ops-telegram-bot/$UNIT_NAME" "$UNIT_DEST"
sudo install -d -o lens -g lens -m 0750 /var/lib/sahamlens/ops-telegram-bot
sudo systemctl daemon-reload
sudo systemctl enable --now "$UNIT_NAME"
systemctl is-active --quiet "$UNIT_NAME"
systemctl status "$UNIT_NAME" --no-pager

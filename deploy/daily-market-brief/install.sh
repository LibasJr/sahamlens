#!/usr/bin/env bash
# Install private Daily Market Brief timers. Safe to re-run.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
SOURCE="$APP_ROOT/deploy/daily-market-brief"

require_env() {
  if ! grep -qE "^${1}=.+" "$APP_ROOT/.env.production"; then
    echo "daily-market-brief install: $1 belum terisi di $APP_ROOT/.env.production" >&2
    exit 2
  fi
}

require_env TELEGRAM_OPS_BOT_TOKEN
require_env TELEGRAM_OPS_CHAT_ID
# Timer memanggil instance @pre/@post, jadi unit harus dipasang sebagai template @.service.
sudo install -m 0644 "$SOURCE/sahamlens-daily-market-brief.service" /etc/systemd/system/sahamlens-daily-market-brief@.service
sudo install -m 0644 "$SOURCE/sahamlens-daily-market-brief-pre.timer" /etc/systemd/system/
sudo install -m 0644 "$SOURCE/sahamlens-daily-market-brief-post.timer" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sahamlens-daily-market-brief-pre.timer sahamlens-daily-market-brief-post.timer
systemctl is-enabled --quiet sahamlens-daily-market-brief-pre.timer
systemctl is-enabled --quiet sahamlens-daily-market-brief-post.timer
systemctl list-timers sahamlens-daily-market-brief-pre.timer sahamlens-daily-market-brief-post.timer --all --no-pager

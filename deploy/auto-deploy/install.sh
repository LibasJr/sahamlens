#!/usr/bin/env bash
# Pasang timer deploy berbasis tarik. Dijalankan di VPS.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
UNIT_DIR=/etc/systemd/system

sudo install -m 0755 "$HERE/auto-deploy.sh" /opt/sahamlens/scripts/auto-deploy.sh
sudo install -m 0644 "$HERE/sahamlens-auto-deploy.service" "$UNIT_DIR/"
sudo install -m 0644 "$HERE/sahamlens-auto-deploy.timer" "$UNIT_DIR/"
sudo systemctl daemon-reload
sudo systemctl enable --now sahamlens-auto-deploy.timer
systemctl list-timers sahamlens-auto-deploy.timer --no-pager
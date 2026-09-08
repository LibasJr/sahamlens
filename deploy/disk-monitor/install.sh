#!/usr/bin/env bash
# Installs a non-destructive disk monitor. Safe to re-run.
set -euo pipefail
APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
UNIT_DIR=/etc/systemd/system
SCRIPT_DEST=/opt/sahamlens/scripts/disk-monitor.sh

sudo install -d -m 0755 /opt/sahamlens/scripts
sudo install -m 0755 "$APP_ROOT/deploy/disk-monitor/disk-monitor.sh" "$SCRIPT_DEST"
sudo install -m 0644 "$APP_ROOT/deploy/disk-monitor/sahamlens-disk-monitor.service" "$UNIT_DIR/sahamlens-disk-monitor.service"
sudo install -m 0644 "$APP_ROOT/deploy/disk-monitor/sahamlens-disk-monitor.timer" "$UNIT_DIR/sahamlens-disk-monitor.timer"
sudo install -d -o lens -g lens -m 0750 /var/lib/sahamlens/disk-monitor
sudo systemctl daemon-reload
sudo systemctl enable --now sahamlens-disk-monitor.timer
# Create baseline now. A normal healthy state logs locally without Telegram.
sudo systemctl start sahamlens-disk-monitor.service
systemctl status sahamlens-disk-monitor.service --no-pager
systemctl list-timers sahamlens-disk-monitor.timer --all --no-pager

#!/usr/bin/env bash
# Pasang pengawas bukti faktor (bulanan). Dijalankan di VPS sebagai user `lens`.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
UNIT_DIR=/etc/systemd/system

sudo install -m 0755 "$HERE/factor-scan-watchdog.sh" /opt/sahamlens/scripts/factor-scan-watchdog.sh
sudo install -m 0644 "$HERE/sahamlens-factor-watchdog.service" "$UNIT_DIR/sahamlens-factor-watchdog.service"
sudo install -m 0644 "$HERE/sahamlens-factor-watchdog.timer" "$UNIT_DIR/sahamlens-factor-watchdog.timer"
sudo mkdir -p /opt/sahamlens/reports/factor-scan
sudo chown -R lens:lens /opt/sahamlens/reports
sudo systemctl daemon-reload
sudo systemctl enable --now sahamlens-factor-watchdog.timer

systemctl list-timers sahamlens-factor-watchdog.timer --no-pager
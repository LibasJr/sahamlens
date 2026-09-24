#!/usr/bin/env bash
# Pasang pengawas kebasian bukti makro. Dijalankan di VPS: sudo bash deploy/macro-evidence-watchdog/install.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SCRIPTS_DIR=/opt/sahamlens/scripts
UNIT_DIR=/etc/systemd/system

sudo install -d -m 0755 "$SCRIPTS_DIR"
sudo install -m 0755 "$REPO/scripts/macro-evidence-watchdog.mjs" "$SCRIPTS_DIR/macro-evidence-watchdog.mjs"
sudo install -m 0644 "$HERE/sahamlens-macro-evidence-watchdog.service" "$UNIT_DIR/"
sudo install -m 0644 "$HERE/sahamlens-macro-evidence-watchdog.timer" "$UNIT_DIR/"
sudo systemctl daemon-reload
sudo systemctl enable --now sahamlens-macro-evidence-watchdog.timer

echo "unit terpasang: $(systemctl is-enabled sahamlens-macro-evidence-watchdog.timer) / $(systemctl is-active sahamlens-macro-evidence-watchdog.timer)"
echo "jadwal berikutnya: $(systemctl show -p NextElapseUSecRealtime --value sahamlens-macro-evidence-watchdog.timer | cut -c1-19)"
echo "jalankan sekali sekarang: sudo systemctl start sahamlens-macro-evidence-watchdog.service"
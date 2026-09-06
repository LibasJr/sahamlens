#!/usr/bin/env bash
set -euo pipefail

NAME="sahamlens-broker-summary-scan"
APP_ROOT="/opt/sahamlens/app"
UNIT_DIR="/etc/systemd/system"

# Legacy Index Alpha per-emiten sudah digantikan pipeline resmi IDX `idx-flow-sync`.
# Installer lama kini bersifat decommission agar deploy/provisioning berikutnya tidak
# mengaktifkan kembali timer yang pasti gagal tanpa INDEXALPHA_API_KEY.
sudo systemctl disable --now "${NAME}.timer" 2>/dev/null || true
sudo systemctl reset-failed "${NAME}.service" 2>/dev/null || true
sudo rm -f "$UNIT_DIR/${NAME}.service" "$UNIT_DIR/${NAME}.timer"
sudo systemctl daemon-reload

echo "${NAME}.timer dinonaktifkan; Broker Summary aktif melalui sahamlens-idx-flow-sync.timer."
systemctl is-active sahamlens-idx-flow-sync.timer
systemctl is-enabled sahamlens-idx-flow-sync.timer

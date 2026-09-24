#!/usr/bin/env bash
# Pasang timer snapshot skor. Dijalankan di VPS sebagai user `lens` dengan sudo hanya untuk
# menyalin unit systemd. Tidak menyentuh data apa pun.
set -euo pipefail

SCRIPT_SRC="$(cd "$(dirname "$0")" && pwd)/lens-score-snapshot.sh"
SCRIPT_DST=/opt/sahamlens/scripts/lens-score-snapshot.sh
UNIT_DIR=/etc/systemd/system

sudo install -m 0755 "$SCRIPT_SRC" "$SCRIPT_DST"
sudo install -m 0644 "$(dirname "$0")/sahamlens-lens-score-snapshot.service" "$UNIT_DIR/sahamlens-lens-score-snapshot.service"
sudo install -m 0644 "$(dirname "$0")/sahamlens-lens-score-snapshot.timer" "$UNIT_DIR/sahamlens-lens-score-snapshot.timer"
sudo systemctl daemon-reload
sudo systemctl enable --now sahamlens-lens-score-snapshot.timer

systemctl list-timers sahamlens-lens-score-snapshot.timer --no-pager
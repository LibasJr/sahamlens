#!/usr/bin/env bash
set -euo pipefail
ROOT="${ROOT:-/opt/sahamlens/app}"
if ! command -v pdftotext >/dev/null 2>&1; then
  echo "ERROR: pdftotext belum tersedia. Install dulu: sudo apt-get update && sudo apt-get install -y poppler-utils" >&2
  exit 1
fi
sudo install -m 0644 "$ROOT/deploy/bank-fundamental-collector/sahamlens-bank-fundamental-collector.service" /etc/systemd/system/
sudo install -m 0644 "$ROOT/deploy/bank-fundamental-collector/sahamlens-bank-fundamental-collector.timer" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sahamlens-bank-fundamental-collector.timer
systemctl list-timers --all | grep sahamlens-bank-fundamental-collector || true

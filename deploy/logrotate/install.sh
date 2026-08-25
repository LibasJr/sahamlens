#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
SRC="$APP_ROOT/deploy/logrotate"

sudo install -d -m 0755 /etc/systemd/journald.conf.d
sudo install -m 0644 "$SRC/journald-sahamlens.conf" /etc/systemd/journald.conf.d/sahamlens.conf
sudo install -m 0644 "$SRC/nginx-sahamlens" /etc/logrotate.d/sahamlens-nginx

# Menerapkan batas baru ke jurnal yang SUDAH ada - tanpa ini batasnya baru berlaku untuk
# berkas jurnal berikutnya, dan disk yang sudah telanjur penuh tetap penuh.
sudo systemctl restart systemd-journald
sudo journalctl --vacuum-size=512M || true

echo "--- journald ---"
journalctl --disk-usage
echo "--- logrotate (kering, tidak memutar apa pun) ---"
sudo logrotate --debug /etc/logrotate.d/sahamlens-nginx || true
echo
echo "Batas log Docker TIDAK dipasang skrip ini - lihat bagian Docker di deploy/logrotate/README.md."

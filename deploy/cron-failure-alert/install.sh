#!/usr/bin/env bash
#
# Pasang notifikasi Telegram untuk kegagalan cron job SahamLens.
#
# Menginstal:
#   1. Skrip cron-failure-alert.sh -> /opt/sahamlens/scripts/
#   2. Unit template sahamlens-cron-alert@.service -> /etc/systemd/system/
#   3. Drop-in OnFailure= untuk tiap unit target, di
#      /etc/systemd/system/<unit>.d/99-cron-failure-alert.conf
#
# KENAPA DROP-IN, BUKAN EDIT LANGSUNG file .service. Sebagian unit target
# (sahamlens-calendar-scan.service, sahamlens-dividend-scan.service,
# sahamlens-database-backup.service, sahamlens-cron@.service) TIDAK berversi di
# repo ini - dipasang manual di masa lalu (lihat CLAUDE.md soal disiplin repo).
# Drop-in adalah satu-satunya cara menambah OnFailure= ke unit itu tanpa mengklaim
# memiliki file unit-nya, dan mekanismenya sama persis untuk unit yang MEMANG
# berversi di deploy/ - satu jalur konsisten untuk keduanya, gampang diaudit lewat
# `systemctl cat <unit>`.
#
# CAKUPAN. Sengaja TIDAK memasang OnFailure= ke:
#   - sahamlens.service (app utama): Restart=always sudah menangani proses mati,
#     dan uptime-monitor.timer sudah memeriksa restart loop + drift build/deploy.
#     Memasang OnFailure= di sini akan mengirim satu pesan Telegram setiap kali
#     app crash-restart sesaat - bukan itu yang diminta.
#   - sahamlens-uptime-monitor.service: sudah punya mekanisme alert sendiri
#     (SAHAMLENS_ALERT_WEBHOOK, dengan throttle "gagal beruntun ke-3" bawaan) -
#     lihat deploy/uptime-monitor/README.md. Menimpa itu dengan OnFailure= generik
#     akan mengirim spam setiap 5 menit selama outage, membuang throttle yang
#     sudah dirancang.
#   - sahamlens-cloudflared-watchdog.service: watchdog auto-heal frekuensi tinggi,
#     bukan job yang "gagal" dalam arti perlu ditindaklanjuti manusia.
#
# Semua cron job data/bisnis (sync, scan, collector, backup, worker) TERCAKUP.

set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
UNIT_DIR="/etc/systemd/system"
SCRIPT_DEST="/opt/sahamlens/scripts/cron-failure-alert.sh"

# Unit yang dipasangi OnFailure=. Template (%i) otomatis mencakup semua instance
# yang sudah/akan dibuat (mis. sahamlens-cron@lens-bucket-backtest.service).
TARGET_UNITS=(
  sahamlens-bank-fundamental-collector.service
  sahamlens-broker-summary-scan.service
  sahamlens-calendar-scan.service
  sahamlens-corporate-calendar-ksei-sync.service
  sahamlens-cron@.service
  sahamlens-database-backup.service
  sahamlens-dividend-scan.service
  sahamlens-idx-financial-sync.service
  sahamlens-idx-flow-sync.service
  sahamlens-intraday-collect.service
  sahamlens-local-cron@.service
  sahamlens-market-data-reconcile.service
  sahamlens-ownership-flow-ksei-sync.service
  sahamlens-privacy-cleanup.service
  sahamlens-screener-scan.service
  sahamlens-tpcl-validation-worker.service
  sahamlens-weekly-maintenance.service
)

echo "=== 1. Skrip alert -> $SCRIPT_DEST ==="
sudo install -d -m 0755 /opt/sahamlens/scripts
sudo install -m 0755 "$APP_ROOT/deploy/cron-failure-alert/cron-failure-alert.sh" "$SCRIPT_DEST"

echo "=== 2. Unit template sahamlens-cron-alert@.service ==="
sudo install -m 0644 \
  "$APP_ROOT/deploy/cron-failure-alert/sahamlens-cron-alert@.service" \
  "$UNIT_DIR/sahamlens-cron-alert@.service"

echo "=== 3. Drop-in OnFailure= per unit target ==="
skipped=()
for unit in "${TARGET_UNITS[@]}"; do
  # Unit template (mengandung '@.') tidak punya file konkret untuk dicek - drop-in
  # template-nya berlaku untuk semua instance yang dibuat lewat template itu.
  is_template=0
  case "$unit" in *@.service) is_template=1 ;; esac

  if [ "$is_template" -eq 0 ] && [ ! -f "$UNIT_DIR/$unit" ]; then
    skipped+=("$unit")
    echo "  ! $unit belum terpasang di VPS ini - drop-in tetap dipasang, akan aktif begitu unit ada."
  fi

  dropin_dir="$UNIT_DIR/${unit}.d"
  sudo install -d -m 0755 "$dropin_dir"
  printf '[Unit]\nOnFailure=sahamlens-cron-alert@%%n.service\n' | sudo tee "$dropin_dir/99-cron-failure-alert.conf" >/dev/null
  echo "  + $unit -> $dropin_dir/99-cron-failure-alert.conf"
done

echo "=== 4. daemon-reload ==="
sudo systemctl daemon-reload

if [ "${#skipped[@]}" -gt 0 ]; then
  echo ""
  echo "Catatan: ${#skipped[@]} unit belum ada di VPS ini (drop-in tetap terpasang):"
  printf '  - %s\n' "${skipped[@]}"
fi

echo ""
echo "Selesai. Uji dengan:"
echo "  sudo systemctl start sahamlens-privacy-cleanup.service --job-mode=fail || true"
echo "  # atau paksa gagal satu unit oneshot mana pun lalu cek Telegram + journal:"
echo "  journalctl -u sahamlens-cron-alert@* -n 20 --no-pager"

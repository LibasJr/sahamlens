#!/usr/bin/env bash
set -Eeuo pipefail

readonly SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo 'Jalankan installer dengan sudo.' >&2
  exit 1
fi

install -o root -g root -m 0755 \
  "${SOURCE_DIR}/sahamlens-local-cron.mjs" \
  /usr/local/bin/sahamlens-local-cron.mjs
install -o root -g root -m 0644 \
  "${SOURCE_DIR}/sahamlens-local-cron@.service" \
  /etc/systemd/system/sahamlens-local-cron@.service
install -o root -g root -m 0644 \
  "${SOURCE_DIR}"/timers/*.timer \
  /etc/systemd/system/

systemctl daemon-reload

echo 'Unit terpasang tetapi timer belum diaktifkan.'
echo 'Uji satu job setelah aplikasi baru di-deploy:'
echo '  systemctl start sahamlens-local-cron@macro.service'
echo 'Aktifkan seluruh timer hanya setelah QStash dinonaktifkan:'
echo '  systemctl enable --now sahamlens-qstash-*.timer'

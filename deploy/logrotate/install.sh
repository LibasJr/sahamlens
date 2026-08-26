#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
SRC="$APP_ROOT/deploy/logrotate"
OURS="/etc/logrotate.d/sahamlens-nginx"

# --- journald ---------------------------------------------------------------------------
sudo install -d -m 0755 /etc/systemd/journald.conf.d
sudo install -m 0644 "$SRC/journald-sahamlens.conf" /etc/systemd/journald.conf.d/sahamlens.conf

# Menerapkan batas baru ke jurnal yang SUDAH ada - tanpa ini batasnya baru berlaku untuk
# berkas jurnal berikutnya, dan disk yang sudah telanjur penuh tetap penuh.
sudo systemctl restart systemd-journald
sudo journalctl --vacuum-size=512M || true

# --- nginx ---------------------------------------------------------------------------
#
# Konfigurasi nginx dipasang HANYA kalau belum ada yang memutar /var/log/nginx.
#
# Kenapa pengecekan ini ada, dan bukan kehati-hatian teoretis: paket nginx Debian/Ubuntu
# SUDAH memasang /etc/logrotate.d/nginx sendiri, dan isinya praktis identik (daily,
# rotate 14, compress). Memasang konfigurasi kedua untuk pola berkas yang sama membuat
# logrotate menolak SELURUH berkas kedua itu:
#
#   error: sahamlens-nginx:1 duplicate log entry for /var/log/nginx/access.log
#   error: found error in file sahamlens-nginx, skipping
#
# dan keluar dengan kode 1 - sehingga logrotate.service tercatat GAGAL setiap hari, untuk
# keadaan yang sebenarnya sehat. Penjaga yang memerah untuk hal normal akan diabaikan
# dalam seminggu, dan itu justru melemahkan pemantauan yang lain (CLAUDE.md §0).
#
# Terjadi 25 Agustus 2026 di VPS produksi, dan direproduksi persis di luar produksi
# sebelum perbaikan ini ditulis.
existing="$(grep -rl '/var/log/nginx' /etc/logrotate.d/ 2>/dev/null | grep -v "^${OURS}$" || true)"

if [ -n "$existing" ]; then
  echo "[nginx] Sudah ada yang memutar /var/log/nginx:"
  echo "$existing" | sed 's/^/          /'
  echo "[nginx] Konfigurasi SahamLens TIDAK dipasang - dua konfigurasi untuk pola yang sama"
  echo "[nginx] membuat logrotate keluar dengan kode 1 setiap hari."
  if [ -f "$OURS" ]; then
    echo "[nginx] Menghapus $OURS yang terlanjur terpasang."
    sudo rm -f "$OURS"
  fi
else
  sudo install -m 0644 "$SRC/nginx-sahamlens" "$OURS"
  echo "[nginx] Terpasang di $OURS (tidak ada konfigurasi lain yang memutarnya)."
fi

# --- verifikasi ---------------------------------------------------------------------------
echo
echo "--- journald ---"
journalctl --disk-usage

echo "--- logrotate (kering, tidak memutar apa pun) ---"
# Seluruh /etc/logrotate.conf, bukan cuma berkas kita: duplikat hanya muncul saat
# logrotate membaca semuanya sekaligus - persis seperti yang dilakukan cron/timer harian.
# Memeriksa satu berkas saja akan lulus dan tidak membuktikan apa pun.
if sudo logrotate --debug /etc/logrotate.conf >/dev/null 2>/tmp/sahamlens-logrotate-check; then
  echo "OK - logrotate memproses seluruh konfigurasi tanpa galat."
else
  echo "GAGAL - logrotate keluar dengan kode non-nol:"
  cat /tmp/sahamlens-logrotate-check
fi
rm -f /tmp/sahamlens-logrotate-check

echo
echo "Batas log Docker TIDAK dipasang skrip ini - lihat bagian Docker di deploy/logrotate/README.md."

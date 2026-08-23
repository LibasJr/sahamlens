#!/usr/bin/env bash
set -euo pipefail

# Memasang skrip deploy VPS ke /usr/local/bin/deploy-sahamlens.
#
# Jalankan dari VPS:
#   bash /opt/sahamlens/app/deploy/vps-app/install.sh
#
# Aman diulang. Skrip lama dicadangkan lebih dulu - ia satu-satunya jalur deploy produksi,
# jadi memasang versi yang salah tanpa cadangan berarti tidak punya jalan pulang.

APP_ROOT="${APP_ROOT:-/opt/sahamlens/app}"
SRC="$APP_ROOT/deploy/vps-app/deploy-sahamlens.sh"
DEST="/usr/local/bin/deploy-sahamlens"
STATE_FILE="${SAHAMLENS_DEPLOY_STATE:-/opt/sahamlens/deployed-sha}"

if [[ ! -f "$SRC" ]]; then
  echo "ERROR: $SRC tidak ditemukan." >&2
  exit 1
fi

if ! bash -n "$SRC"; then
  echo "ERROR: $SRC tidak lolos pemeriksaan sintaks bash. Tidak dipasang." >&2
  exit 1
fi

if [[ -f "$DEST" ]]; then
  BACKUP="$DEST.bak-$(date +%Y%m%d-%H%M%S)"
  echo "Mencadangkan skrip lama ke $BACKUP"
  sudo cp -p "$DEST" "$BACKUP"
fi

# 0750 root:lens - sama seperti berkas yang sudah ada di sana. User `lens` yang dipakai
# workflow lewat SSH harus bisa mengeksekusinya, dan tidak seorang pun selain root menulisnya.
sudo install -m 0750 -o root -g lens "$SRC" "$DEST"
echo "Terpasang: $DEST"

# Penanda SHA ter-deploy. Ditulis skrip deploy sebagai user `lens`, jadi direktorinya harus
# bisa ditulis user itu.
sudo install -d -o lens -g lens "$(dirname "$STATE_FILE")"

if [[ ! -f "$STATE_FILE" ]]; then
  # Sengaja DIBIARKAN KOSONG, bukan diisi HEAD saat ini. Mengisinya dengan HEAD berarti
  # mengklaim SHA itu sudah pernah dibangun dan dijalankan - klaim yang justru menyebabkan
  # deploy no-op pada 2026-08-23. State kosong membuat deploy berikutnya membangun sungguhan,
  # yang lambat sekali tapi benar.
  echo "Belum ada $STATE_FILE - deploy berikutnya akan membangun penuh sekali untuk mengisinya."
fi

echo
echo "Verifikasi:"
echo "  deploy-sahamlens --force   # deploy penuh, lewati pemeriksaan kesegaran"
echo "  deploy-sahamlens           # deploy normal"

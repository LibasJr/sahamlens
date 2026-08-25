#!/usr/bin/env bash
#
# Deploy aplikasi web SahamLens ke VPS. Dipasang ke /usr/local/bin/deploy-sahamlens
# oleh install.sh di direktori ini; dipanggil lewat SSH oleh .github/workflows/deploy-vps.yml.
#
# KENAPA SKRIPNYA ADA DI REPO. Sampai 2026-08-23 ia hanya ada di /usr/local/bin milik root,
# tidak berversi dan tidak pernah direview. Satu-satunya cara mengetahui apa yang dilakukan
# deploy adalah membaca berkas di server.
#
# KENAPA PENENTU KESEGARANNYA BERUBAH. Versi lama membandingkan `git rev-parse HEAD` dengan
# `origin/main` untuk memutuskan apakah perlu deploy. Itu mengukur hal yang salah: HEAD adalah
# posisi checkout, bukan bukti bahwa sesuatu pernah DIBANGUN dan DIJALANKAN.
#
# 2026-08-23 selisih itu memakan satu deploy. Seseorang menjalankan `git pull` di
# /opt/sahamlens/app untuk memeriksa penanda konflik, lima menit sebelum deploy berjalan.
# Deploy melihat HEAD == origin/main, menyimpulkan "sudah versi terbaru", lalu keluar dengan
# kode 0 - melewati npm ci, build, dan restart. Workflow-nya HIJAU. Produksi tetap menyajikan
# build berumur dua belas jam, dan satu-satunya petunjuk ada di `systemctl show sahamlens`.
#
# Kegagalan yang melapor sukses lebih mahal daripada kegagalan yang melapor gagal: tidak ada
# yang merah, jadi tidak ada yang melihat.
#
# Sekarang yang dibandingkan adalah SHA yang BENAR-BENAR SELESAI di-deploy, disimpan di
# STATE_FILE setelah restart dan health check lolos. HEAD tidak lagi ikut memutuskan - ia
# hanya dilaporkan, dan perbedaannya dari state ditandai sebagai drift.
set -Eeuo pipefail

APP="${SAHAMLENS_APP_DIR:-/opt/sahamlens/app}"

# Di luar $APP dengan sengaja: skrip ini menjalankan `git reset --hard`, dan penanda yang
# ikut terhapus oleh operasi yang dijaganya sendiri tidak menjaga apa pun.
STATE_FILE="${SAHAMLENS_DEPLOY_STATE:-/opt/sahamlens/deployed-sha}"

# Tiga titik sentuh sistem, dibuat bisa ditimpa SEMATA supaya skrip ini bisa diuji terhadap
# repo tiruan. Default-nya persis perilaku produksi. Skrip deploy yang tidak bisa dijalankan
# di luar produksi hanya bisa dibuktikan dengan cara mencobanya di produksi - dan itulah
# sebabnya cacat penentu kesegaran di atas bertahan begitu lama tanpa ketahuan.
NPM_BIN="${SAHAMLENS_NPM_BIN:-/usr/bin/npm}"
NODE_BIN="${SAHAMLENS_NODE_BIN:-/usr/bin/node}"
SUDO="${SAHAMLENS_SUDO:-sudo}"
HEALTH_URL="${SAHAMLENS_HEALTH_URL:-http://127.0.0.1:3001/}"

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *) echo "Argumen tidak dikenal: $arg" >&2; exit 2 ;;
  esac
done

exec 9>/tmp/sahamlens-deploy.lock
if ! flock -n 9; then
  echo "Deploy lain sedang berjalan."
  exit 1
fi

cd "$APP"

echo "=== SahamLens VPS Deploy ==="

HEAD_SHA=$(git rev-parse HEAD)
DEPLOYED_SHA=$(cat "$STATE_FILE" 2>/dev/null || echo "")

git fetch --prune origin main
NEW_SHA=$(git rev-parse origin/main)

echo "HEAD checkout : $HEAD_SHA"
echo "Ter-deploy    : ${DEPLOYED_SHA:-<belum tercatat>}"
echo "Target        : $NEW_SHA"

# Drift: checkout dipindahkan tanpa lewat deploy. Persis keadaan 2026-08-23. Bukan galat -
# deploy di bawah akan membereskannya - tapi wajib terlihat di log.
if [ -n "$DEPLOYED_SHA" ] && [ "$HEAD_SHA" != "$DEPLOYED_SHA" ]; then
  echo "PERINGATAN: HEAD checkout tidak sama dengan yang ter-deploy."
  echo "            Ada yang memindahkan checkout di luar jalur deploy."
fi

if [ "$FORCE" = 1 ]; then
  echo "--force: pemeriksaan kesegaran dilewati."
elif [ -n "$DEPLOYED_SHA" ] && [ "$DEPLOYED_SHA" = "$NEW_SHA" ]; then
  # Satu-satunya jalan keluar cepat, dan syaratnya sekarang benar: build untuk SHA ini
  # pernah selesai DAN servisnya pernah naik dengannya.
  echo "Sudah versi terbaru (build untuk $NEW_SHA sudah pernah dijalankan)."
  exit 0
fi

# State kosong berarti "tidak tahu" - dan tidak tahu harus berarti deploy, bukan melewatkan.
if [ -z "$DEPLOYED_SHA" ]; then
  echo "Belum ada catatan deploy. Melanjutkan build supaya keadaannya pasti."
fi

# Titik pulang kalau ada yang gagal di bawah: yang terakhir terbukti jalan, bukan sekadar
# apa pun yang kebetulan sedang ada di HEAD.
ROLLBACK_SHA="${DEPLOYED_SHA:-$HEAD_SHA}"

restore_previous() {
  echo "Rollback ke $ROLLBACK_SHA ..."
  git reset --hard "$ROLLBACK_SHA"
  "$NPM_BIN" ci
  "$NPM_BIN" run build
  $SUDO /usr/bin/systemctl restart sahamlens
  printf '%s\n' "$ROLLBACK_SHA" > "$STATE_FILE"
}

echo "Updating source..."
git reset --hard "$NEW_SHA"

echo "Installing dependencies..."
if ! "$NPM_BIN" ci; then
  echo "npm ci GAGAL."
  restore_previous
  exit 1
fi

echo "Building..."
if ! "$NPM_BIN" run build; then
  echo "BUILD GAGAL."
  restore_previous
  exit 1
fi

echo "Applying additive database migrations..."
if ! "$NODE_BIN" --env-file=.env.production scripts/migrate-database.mjs --confirm; then
  echo "DATABASE MIGRATION GAGAL. Service lama tetap berjalan; source dikembalikan."
  restore_previous
  exit 1
fi

echo "Restarting SahamLens..."
$SUDO /usr/bin/systemctl restart sahamlens

sleep 5

if ! curl -fsS --max-time 20 "$HEALTH_URL" >/dev/null; then
  echo "Health check GAGAL."
  restore_previous
  exit 1
fi

# Ditulis PALING AKHIR, dan hanya di sini. Penanda ini berarti "dibangun, dijalankan, dan
# menjawab" - kalau ia ditulis lebih awal, ia cuma mengulang kekeliruan yang sama dalam
# bentuk lain.
printf '%s\n' "$NEW_SHA" > "$STATE_FILE"

echo "================================="
echo "DEPLOY BERHASIL"
git log -1 --oneline
echo "================================="

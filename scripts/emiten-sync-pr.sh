#!/usr/bin/env bash
#
# Sinkronkan katalog emiten (idx_emiten_900.csv) dengan daftar resmi BEI, lalu AJUKAN PR.
#
# KENAPA PR, BUKAN TULIS LANGSUNG. idx_emiten_900.csv ikut versi di git dan dibaca aplikasi
# saat runtime. Kalau job terjadwal menulis berkas di checkout produksi, checkout jadi kotor
# dan deploy berikutnya bisa menimpa atau bentrok. Karena itu job bekerja di worktree
# terpisah, commit, push cabang bertanggal, dan membuka PR supaya perubahannya tetap
# ditinjau manusia sebelum tayang.
#
# Dijalankan oleh sahamlens-emiten-sync.timer (bulanan). Kalau tidak ada perubahan,
# cabang dan worktree dibersihkan dan tidak ada PR yang dibuat.

set -euo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

REPO=/opt/sahamlens/app
WORKTREE=/opt/sahamlens/worktrees/emiten-sync
BRANCH="chore/emiten-sync-$(date +%Y%m%d)"
STAMP="$(date +%Y-%m-%d)"

log() { echo "[emiten-sync] $*"; }

cd "$REPO"
git fetch origin --quiet

# Sisa worktree dari jalan sebelumnya (mis. job terputus) dibuang dulu supaya add tidak gagal.
git worktree remove --force "$WORKTREE" 2>/dev/null || true
git worktree prune
rm -rf "$WORKTREE"
git worktree add -B "$BRANCH" "$WORKTREE" origin/main >/dev/null
log "worktree siap di $WORKTREE (cabang $BRANCH)"

cd "$WORKTREE"
python3 scripts/sync-idx-emiten-list.py --tulis

cleanup() {
  cd "$REPO"
  git worktree remove --force "$WORKTREE" 2>/dev/null || true
  git worktree prune
}

if git diff --quiet -- idx_emiten_900.csv; then
  log "katalog sudah sinkron dengan BEI; tidak ada perubahan, tidak ada PR."
  cleanup
  # Hapus cabang SETELAH worktree dibuang: git menolak menghapus cabang yang masih
  # ter-checkout, sehingga urutan sebaliknya meninggalkan cabang basi.
  cd "$REPO"
  git branch -D "$BRANCH" >/dev/null 2>&1 || true
  exit 0
fi

git add idx_emiten_900.csv
git -c user.name="SahamLens Ops" -c user.email="ops@sahamlens.id" \
  commit -q -m "chore(emiten): sinkron katalog dengan daftar resmi BEI $STAMP"
git push -q --force origin "HEAD:refs/heads/$BRANCH"
log "cabang $BRANCH didorong ke origin"

if ! gh pr create --base main --head "$BRANCH" \
  --title "chore(emiten): sinkron katalog emiten dengan daftar resmi BEI $STAMP" \
  --body "Job terjadwal \`sahamlens-emiten-sync.timer\` menemukan katalog \`idx_emiten_900.csv\` tidak lagi sama dengan daftar resmi BEI pada $STAMP.

Perubahan berisi kode emiten yang baru tercatat / hilang, perpindahan papan pencatatan, dan
perbaikan nama yang terpotong. Ditinjau dulu sebelum merge; angka emiten di /transparency
mengikuti katalog ini.

Sumber: \`scripts/sync-idx-emiten-list.py\` (endpoint GetCompanyProfiles BEI via curl_cffi)."; then
  log "PR mungkin sudah ada untuk cabang $BRANCH; perubahan tetap terkirim."
fi

cleanup
log "selesai."
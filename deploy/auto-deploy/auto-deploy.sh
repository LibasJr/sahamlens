#!/usr/bin/env bash
# SahamLens - deploy berbasis tarik (pull) dari VPS.
# Dipanggil timer sahamlens-auto-deploy.timer tiap 5 menit.
set -Eeuo pipefail

APP="${SAHAMLENS_APP_DIR:-/opt/sahamlens/app}"
STATE_FILE="${SAHAMLENS_DEPLOY_STATE:-/opt/sahamlens/deployed-sha}"
STATE_DIR="${SAHAMLENS_AUTO_DEPLOY_STATE:-/opt/sahamlens/state}"
REPO="${SAHAMLENS_REPO:-LibasJr/sahamlens}"
DEPLOY_BIN="${SAHAMLENS_DEPLOY_BIN:-/usr/local/bin/deploy-sahamlens}"
WEBHOOK="${SAHAMLENS_ALERT_WEBHOOK:-}"
BRANCH="${SAHAMLENS_BRANCH:-main}"
# `deploy` adalah job yang justru digantikan skrip ini; `ci-cancelled-guard` hanya berlaku
# untuk pemicu workflow_run yang sekarang sudah dimatikan.
EXCLUDE_CHECKS="${SAHAMLENS_AUTO_DEPLOY_EXCLUDE:-deploy ci-cancelled-guard}"
LOCK_FILE="${TMPDIR:-/tmp}/sahamlens-auto-deploy-${USER:-lens}.lock"
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "Argumen tidak dikenal: $arg" >&2; exit 2 ;;
  esac
done

mkdir -p "$STATE_DIR"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[auto-deploy] proses lain sedang aktif; keluar tanpa tindakan."
  exit 0
fi

alert() {
  local message="$1"
  echo "[auto-deploy] ALARM: $message" >&2
  if [ -n "$WEBHOOK" ]; then
    curl -fsS -m 15 -X POST "$WEBHOOK" \
      -H 'Content-Type: application/json' \
      --data "$(printf '{"text":"[SahamLens auto-deploy] %s"}' "$message")" >/dev/null 2>&1 \
      || echo "[auto-deploy] webhook gagal dikirim (alarm tetap tercatat di journal)" >&2
  fi
}

cd "$APP"
git fetch --prune origin "$BRANCH" --quiet
TARGET="$(git rev-parse "origin/$BRANCH")"
DEPLOYED="$(cat "$STATE_FILE" 2>/dev/null || echo "")"

echo "[auto-deploy] target $TARGET · ter-deploy ${DEPLOYED:-<belum tercatat>} · dry-run=$DRY_RUN"
if [ -n "$DEPLOYED" ] && [ "$DEPLOYED" = "$TARGET" ]; then
  echo "[auto-deploy] sudah versi terbaru; tidak ada yang dikerjakan."
  exit 0
fi

# --- Gerbang CI ---------------------------------------------------------------------------
# Deploy hanya setelah CI untuk SHA ini hijau. Tanpa gerbang ini skrip akan menyebarkan commit
# yang gagal tes - dan karena tidak ada yang merah, tidak ada yang melihat.
RUNS_FILE="$(mktemp)"
trap 'rm -f "$RUNS_FILE"' EXIT
if ! gh api "repos/$REPO/commits/$TARGET/check-runs?per_page=100" \
     --jq ".check_runs[] | [.name, .status, .conclusion] | @tsv" > "$RUNS_FILE" 2>/dev/null; then
  alert "$TARGET: status CI tidak bisa dibaca dari GitHub; deploy ditahan."
  exit 1
fi

DECISION="$(awk -F'\t' -v exclude="$EXCLUDE_CHECKS" '
  BEGIN { n = split(exclude, ex, " "); for (i = 1; i <= n; i++) skip[ex[i]] = 1 }
  {
    if ($1 in skip) next
    seen++
    if ($2 != "completed") { pending++; next }
    if ($3 == "success" || $3 == "neutral" || $3 == "skipped") next
    if ($3 == "") $3 = "tanpa-kesimpulan"
    bad = bad (bad == "" ? "" : ",") $1 ":" $3
  }
  END {
    if (bad != "") { print "BLOCK " bad; exit }
    if (pending > 0) { print "WAIT " pending; exit }
    if (seen == 0) { print "NONE"; exit }
    print "GO " seen
  }' "$RUNS_FILE")"

VERDICT="${DECISION%% *}"
DETAIL="${DECISION#* }"
[ "$DETAIL" = "$DECISION" ] && DETAIL=""
echo "[auto-deploy] gerbang CI: $DECISION"

case "$VERDICT" in
  BLOCK)
    case "$DETAIL" in
      *:cancelled*)
        MARKER="$STATE_DIR/rerun-$TARGET"
        if [ -f "$MARKER" ]; then
          echo "[auto-deploy] percobaan ulang CI untuk SHA ini sudah pernah dilakukan; menunggu."
          exit 0
        fi
        touch "$MARKER"
        RUN_ID="$(gh api "repos/$REPO/actions/runs?head_sha=$TARGET&status=completed&per_page=50" \
          --jq '[.workflow_runs[] | select(.name == "CI")] | sort_by(.run_attempt) | last | .id' 2>/dev/null || true)"
        if [ -n "$RUN_ID" ] && [ "$RUN_ID" != "null" ]; then
          gh run rerun "$RUN_ID" --repo "$REPO" >/dev/null 2>&1 || true
          alert "$TARGET: CI dibatalkan; percobaan ulang dijalankan, deploy menyusul setelah hijau."
        else
          alert "$TARGET: CI dibatalkan dan run-nya tidak ditemukan; deploy ditahan."
        fi
        ;;
      *)
        MARKER="$STATE_DIR/blocked-$TARGET"
        if [ ! -f "$MARKER" ]; then
          touch "$MARKER"
          alert "$TARGET: CI tidak hijau ($DETAIL); deploy DITAHAN. Perbaiki, lalu biarkan timer mencoba lagi."
        fi
        ;;
    esac
    exit 0
    ;;
  WAIT)
    echo "[auto-deploy] $DETAIL pemeriksaan masih berjalan; menunggu tik berikutnya."
    exit 0
    ;;
  NONE)
    echo "[auto-deploy] PERINGATAN: tidak ada pemeriksaan CI untuk SHA ini; deploy tetap dijalankan dan hal ini dicatat."
    ;;
  GO)
    echo "[auto-deploy] $DETAIL pemeriksaan hijau."
    ;;
esac

if [ "$DRY_RUN" = 1 ]; then
  echo "[auto-deploy] dry-run: deploy tidak dijalankan. Perintahnya: $DEPLOY_BIN"
  exit 0
fi

# `set +e` hanya di sekitar pemanggilan ini: kode keluarnya mau dibaca dan dilaporkan, bukan
# untuk menghentikan skrip dengan pesan yang tidak menjelaskan apa pun.
set +e
"$DEPLOY_BIN"
CODE=$?
set -e

if [ "$CODE" = 0 ]; then
  echo "[auto-deploy] deploy selesai untuk $TARGET."
  exit 0
fi

alert "$TARGET: skrip deploy gagal (kode $CODE). Produksi tetap pada versi sebelumnya; log ada di journal unit ini."
exit 1
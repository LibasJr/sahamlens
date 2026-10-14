#!/usr/bin/env bash
# End-to-end dry-run: render fixture MP4 and probe with ffprobe.
set -euo pipefail
cd "$(dirname "$0")/.."

export SAHAMLENS_VIDEO_QUEUE="/tmp/sahamlens-video-test"
mkdir -p "$SAHAMLENS_VIDEO_QUEUE"

OUT="$SAHAMLENS_VIDEO_QUEUE/sahamlens_fixture_$(date +%Y%m%d).mp4"
echo "=== Dry-run render with full fixture ==="
python3 main.py render --out "$OUT" --payload-file fixtures/payload_full.json 2>&1

echo
echo "=== ffprobe output ==="
ffprobe -v quiet -print_format json -show_streams -show_format "$OUT"

echo
echo "=== File info ==="
ls -lh "$OUT"
echo
echo "=== Zero-candidates payload (must fail closed) ==="
if python3 main.py render --out /tmp/zero.mp4 --payload-file fixtures/payload_zero_candidates.json 2>&1; then
  echo "ERROR: zero-candidates should have failed"
  exit 1
else
  echo "OK: zero-candidates correctly refused"
fi

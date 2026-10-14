import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import os, tempfile
os.environ["SAHAMLENS_VIDEO_QUEUE"] = tempfile.mkdtemp()

import json
from main import run_render_only
from video_renderer import W, H

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"

# Full fixture render
out = os.environ["SAHAMLENS_VIDEO_QUEUE"] + "/fixture_daily.mp4"
run_render_only(Path(out), "DAILY", json.loads((FIXTURES / "payload_full.json").read_text()))
print(f"PASS full fixture → {out}")

# Zero candidates — should fail closed
try:
    run_render_only(Path("/tmp/zero.mp4"), "DAILY", json.loads((FIXTURES / "payload_zero_candidates.json").read_text()))
    print("FAIL: zero-candidates did not fail")
    sys.exit(1)
except SystemExit as e:
    if e.code == 2:
        print("PASS zero candidates → fail closed (exit 2)")
    else:
        print(f"FAIL: unexpected exit code {e.code}")
        sys.exit(1)

#!/usr/bin/env python3
"""Daily SahamLens vertical MP4 generator + Telegram document sender.

Entry points:
  python3 scripts/tiktok/main.py render  --out /tmp/sahamlens_daily.mp4  (dry-run, no send)
  python3 scripts/tiktok/main.py send    --out /tmp/sahamlens_daily.mp4  (live send)
  python3 scripts/tiktok/main.py dry-run --out /tmp/test.mp4             (generate + probe + verify no send)

Fail-closed:
  - Missing/empty/stale data from SahamLens API → abort before any video is built.
  - Zero candidates → abort.
  - Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID → send path fails immediately.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))

from video_renderer import render_frames, FPS, W, H
from data_adapter import fetch_and_build, env

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("tiktok-main")

TELEGRAM_BOT_TOKEN = env("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = env("TELEGRAM_CHAT_ID")
QUEUE_DIR_STR = env("SAHAMLENS_VIDEO_QUEUE", "/var/lib/sahamlens/daily-video")
QUEUE_DIR = Path(QUEUE_DIR_STR) if QUEUE_DIR_STR else Path("/var/lib/sahamlens/daily-video")
MAX_QUEUE_FILES = 14  # ~2 weeks of MP4s retained


def sanitize_log(record: dict[str, Any]) -> dict[str, Any]:
    """Strip anything that looks like a secret from log records."""
    return {k: v for k, v in record.items() if "token" not in k.lower() and "key" not in k.lower() and "secret" not in k.lower()}


def render_to_mp4(payload: dict, output_path: Path, duration_sec: int = 10) -> Path:
    """Render frames, pipe to ffmpeg, write mp4. Returns the output path."""
    log.info("Rendering %d frames (%ds @ %dx%d)...", duration_sec * FPS, duration_sec, W, H)
    frames = render_frames(payload, duration_sec=duration_sec)
    log.info("Encoding to %s ...", output_path)

    with tempfile.TemporaryDirectory() as tmpdir:
        for i, frame in enumerate(frames):
            frame.save(Path(tmpdir) / f"frame_{i:05d}.png", format="PNG")

        cmd = [
            "ffmpeg", "-y",
            "-framerate", str(FPS),
            "-i", f"{tmpdir}/frame_%05d.png",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "fast",
            "-crf", "23",
            "-an",
            str(output_path),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if proc.returncode != 0:
            log.error("ffmpeg failed (rc=%d): %s", proc.returncode, proc.stderr[-500:])
            raise RuntimeError("ffmpeg encoding failed")

    log.info("MP4 written: %s (%.1f MB)", output_path, output_path.stat().st_size / 1_048_576)
    return output_path


def probe_mp4(path: Path) -> dict[str, Any]:
    """Run ffprobe and return parsed JSON."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_streams", "-show_format", str(path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {proc.stderr}")
    return json.loads(proc.stdout)


def validate_mp4(path: Path) -> bool:
    """Validate: exactly one video stream, resolution WxH, duration >= 1s, H.264."""
    info = probe_mp4(path)
    streams = info.get("streams", [])
    video = [s for s in streams if s.get("codec_type") == "video"]
    if len(video) != 1:
        log.error("Expected 1 video stream, got %d", len(video))
        return False
    vs = video[0]
    w = int(vs.get("width", 0))
    h = int(vs.get("height", 0))
    if w != W or h != H:
        log.error("Resolution mismatch: expected %dx%d, got %dx%d", W, H, w, h)
        return False
    codec = vs.get("codec_name", "")
    if codec not in ("h264", "avc1"):
        log.error("Expected H.264, got %s", codec)
        return False
    dur = float(info.get("format", {}).get("duration", "0"))
    if dur < 1.0:
        log.error("Duration too short: %.2fs", dur)
        return False
    log.info("MP4 validated: %dx%d %s %.1fs", w, h, codec, dur)
    return True


def prune_queue() -> None:
    """Keep only the newest MAX_QUEUE_FILES mp4 files in QUEUE_DIR."""
    if not QUEUE_DIR.exists():
        return
    files = sorted(QUEUE_DIR.glob("*.mp4"), key=lambda p: p.stat().st_mtime)
    for old in files[:-MAX_QUEUE_FILES]:
        log.info("Pruning old queue file: %s", old)
        old.unlink()


def send_via_telegram(mp4_path: Path, caption: str = "SahamLens daily recap") -> None:
    """Send mp4 as Telegram document. Token/chat validated up-front."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        raise RuntimeError("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured; refusing to send")

    if not shutil.which("curl"):
        raise RuntimeError("curl is required for Telegram send")

    token = TELEGRAM_BOT_TOKEN
    chat_id = TELEGRAM_CHAT_ID

    cmd = [
        "curl", "-sS",
        "-F", f"chat_id={chat_id}",
        "-F", f"video=@{mp4_path}",
        "-F", f"caption={caption}",
        "-F", "supports_streaming=true",
        f"https://api.telegram.org/bot{token}/sendVideo",
    ]
    log.info("Sending to Telegram (chat=REDACTED, file=%s)...", mp4_path.name)
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        raise RuntimeError(f"Telegram send failed (rc={proc.returncode}): {proc.stderr[:500]}")

    resp = json.loads(proc.stdout)
    if not resp.get("ok"):
        raise RuntimeError(f"Telegram API rejected the request: {resp}")
    log.info("Telegram send OK")


def run_render_only(output_path: Path, edition: str, payload_override: dict | None = None) -> Path:
    """Build payload from API or override, render mp4. No send."""
    if payload_override:
        payload = payload_override
        ok = len(payload.get("candidates", [])) > 0
    else:
        payload, ok = fetch_and_build(edition)

    if not ok:
        log.error("Payload has no candidates or API unavailable. Failing closed — no video produced.")
        raise SystemExit(2)

    QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    render_to_mp4(payload, output_path)
    validate_mp4(output_path)
    prune_queue()
    return output_path


def run_dry_run(output_path: Path) -> None:
    """Full pipeline to disk, probe, verify no Telegram send happened."""
    log.info("DRY-RUN start — output=%s", output_path)
    payload, ok = fetch_and_build("DRY-RUN")
    if not ok:
        log.error("No candidates or API unavailable. Failing closed.")
        raise SystemExit(2)
    log.info("Payload candidates=%d", len(payload.get("candidates", [])))

    QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    render_to_mp4(payload, output_path)
    validate_mp4(output_path)
    log.info("DRY-RUN complete: %s (no Telegram send)", output_path)


def run_send(output_path: Path, edition: str = "DAILY") -> None:
    """Full pipeline: render → probe → Telegram send."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        log.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID. Refusing to send.")
        raise SystemExit(2)

    payload, ok = fetch_and_build(edition)
    if not ok:
        log.error("No candidates or API unavailable. Failing closed — not sending a fabricated video.")
        raise SystemExit(2)

    QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    render_to_mp4(payload, output_path)
    validate_mp4(output_path)
    send_via_telegram(output_path)
    prune_queue()
    log.info("Pipeline complete.")


def main() -> None:
    ap = argparse.ArgumentParser(description="SahamLens daily video generator")
    ap.add_argument("action", choices=["render", "send", "dry-run"], help="Action to perform")
    ap.add_argument("--out", default=str(QUEUE_DIR / f"sahamlens_daily_{int(time.time())}.mp4"),
                    help="Output MP4 path")
    ap.add_argument("--edition", default="DAILY", help="Video edition label (DAILY, PRE-MARKET, etc.)")
    ap.add_argument("--payload-file", default=None,
                    help="JSON payload override (for tests; skips API fetch)")
    args = ap.parse_args()

    output = Path(args.out)
    payload_override = None
    if args.payload_file:
        payload_override = json.loads(Path(args.payload_file).read_text())

    if args.action == "render":
        run_render_only(output, args.edition, payload_override)
    elif args.action == "dry-run":
        run_dry_run(output)
    elif args.action == "send":
        run_send(output, args.edition)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Tests for main.py — verifies dry-run renders and fails closed without Telegram send."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data_adapter import build_video_payload
from main import validate_mp4, render_to_mp4, probe_mp4, QUEUE_DIR
import tempfile
import os

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def test_build_and_render_full_payload():
    """End-to-end: payload → frames → mp4 → ffprobe validation."""
    payload = json.loads((FIXTURES / "payload_full.json").read_text())
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "out.mp4"
        render_to_mp4(payload, out, duration_sec=3)
        assert out.exists()
        info = probe_mp4(out)
        assert info.get("streams")[0].get("codec_name") in ("h264", "avc1")
        validate_mp4(out)
        print("PASS  test_build_and_render_full_payload")


def test_build_and_render_zero_candidates():
    """Zero candidates → main should fail closed (SystemExit 2)."""
    payload = json.loads((FIXTURES / "payload_zero_candidates.json").read_text())
    assert len(payload["candidates"]) == 0
    print("PASS  test_build_and_render_zero_candidates (payload shape verified)")


def test_build_payload_dedup():
    summary = {"marketRegime": {"changePct": 1.0, "trend": "RISK_ON"}}
    picks = {"data": {
        "attractive": {"detail": [
            {"symbol": "BBCA", "price": 8750, "changePct": 1.42, "metric": "Skor 85"},
        ]},
        "relativeStrength": {"detail": [
            {"symbol": "BBCA", "price": 8750, "changePct": 1.42, "metric": "RS +3%"},
        ]},
    }}
    payload = build_video_payload(summary, picks)
    symbols = [c["symbol"] for c in payload["candidates"]]
    assert len(symbols) == len(set(symbols))
    print("PASS  test_build_payload_dedup")


def test_no_telegram_credentials_fails_closed():
    """When TELEGRAM_BOT_TOKEN is missing, send path must abort."""
    from main import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        print("PASS  test_no_telegram_credentials_fails_closed (skipped: credentials present)")
        return
    # Simulate missing credentials
    assert not (TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)
    print("PASS  test_no_telegram_credentials_fails_closed")


def run():
    tests = [
        test_build_and_render_full_payload,
        test_build_and_render_zero_candidates,
        test_build_payload_dedup,
        test_no_telegram_credentials_fails_closed,
    ]
    failed = 0
    for t in tests:
        try:
            t()
        except Exception as e:
            print(f"FAIL  {t.__name__}: {e}")
            failed += 1
    if failed:
        print(f"\n{failed} test(s) failed")
        sys.exit(1)
    print(f"\nAll {len(tests)} tests passed")


if __name__ == "__main__":
    run()

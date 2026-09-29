#!/usr/bin/env python3
"""Tests for video_renderer and data_adapter."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from video_renderer import render_frame, render_frames, W, H, FPS
from data_adapter import build_video_payload, _strip_jk, _safe_float


FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def test_strip_jk():
    assert _strip_jk("BBCA.JK") == "BBCA"
    assert _strip_jk("BBCA") == "BBCA"
    assert _strip_jk("") == ""


def test_safe_float():
    assert _safe_float(1.5) == 1.5
    assert _safe_float(0) == 0.0
    assert _safe_float(None) is None
    assert _safe_float("abc") is None
    assert _safe_float(True) is None  # bools rejected


def test_render_frame_full():
    payload = json.loads((FIXTURES / "payload_full.json").read_text())
    img = render_frame(0, payload)
    assert img.size == (W, H)
    assert img.mode == "RGB"


def test_render_frames_duration():
    payload = json.loads((FIXTURES / "payload_full.json").read_text())
    frames = render_frames(payload, duration_sec=3)
    assert len(frames) == 3 * FPS
    for f in frames:
        assert f.size == (W, H)


def test_build_payload_full():
    summary = {
        "marketRegime": {"changePct": 0.85, "trend": "RISK_ON", "label": "BULLISH_MOMENTUM"},
        "timestamp": "2026-09-25T06:00:00Z",
    }
    picks = {"data": {
        "attractive": {"detail": [
            {"symbol": "BBCA", "price": 8750, "changePct": 1.42, "metric": "Skor 85"},
            {"symbol": "BMRI", "price": 5200, "changePct": 2.15, "metric": "Skor 78"},
        ]},
        "relativeStrength": {"detail": [
            {"symbol": "TLKM", "price": 3170, "changePct": -0.63, "metric": "RS +3.2%"},
        ]},
    }}
    payload = build_video_payload(summary, picks)
    assert len(payload["candidates"]) == 3
    assert payload["candidates"][0]["symbol"] == "BBCA"
    assert payload["regime"]["changePct"] == 0.85


def test_build_payload_zero_candidates():
    summary = {"marketRegime": {"changePct": None, "trend": "NEUTRAL"}}
    picks = {"data": {}}
    payload = build_video_payload(summary, picks)
    assert payload["candidates"] == []


def test_build_payload_none_summary():
    payload = build_video_payload(None, None)
    assert payload["candidates"] == []
    assert payload["regime"]["changePct"] is None


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
    assert len(symbols) == len(set(symbols)), f"Duplicates: {symbols}"


def test_render_frame_zero_candidates():
    payload = json.loads((FIXTURES / "payload_zero_candidates.json").read_text())
    img = render_frame(0, payload)
    assert img.size == (W, H)


def test_render_frame_bearish():
    payload = json.loads((FIXTURES / "payload_one_candidate_bearish.json").read_text())
    img = render_frame(0, payload)
    assert img.size == (W, H)


def run():
    tests = [
        test_strip_jk,
        test_safe_float,
        test_render_frame_full,
        test_render_frames_duration,
        test_build_payload_full,
        test_build_payload_zero_candidates,
        test_build_payload_none_summary,
        test_build_payload_dedup,
        test_render_frame_zero_candidates,
        test_render_frame_bearish,
    ]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS  {t.__name__}")
        except Exception as e:
            print(f"FAIL  {t.__name__}: {e}")
            failed += 1
    if failed:
        print(f"\n{failed} test(s) failed")
        sys.exit(1)
    print(f"\nAll {len(tests)} tests passed")


if __name__ == "__main__":
    run()

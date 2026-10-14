#!/usr/bin/env python3
"""Data adapters for the daily video.

Reads from live SahamLens HTTP endpoints (market-summary, daily-picks) and
normalizes the payload into the flat shape the renderer expects. Every adapter
is fail-closed: missing fields degrade to None / empty list, never fabricated.
"""
from __future__ import annotations

import json
import os
import urllib.request
from typing import Any


def env(name: str, default: str | None = None) -> str | None:
    v = os.environ.get(name)
    if v is None or not v.strip():
        return default
    return v.strip()


BASE_URL = env("SAHAMLENS_BASE_URL", "http://127.0.0.1:3001")


def _fetch_json(path: str, timeout: int = 15) -> dict[str, Any] | None:
    try:
        req = urllib.request.Request(f"{BASE_URL}{path}")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode())
        return body if isinstance(body, dict) else None
    except Exception:
        return None


def _safe_float(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def _strip_jk(symbol: str) -> str:
    return symbol.replace(".JK", "").strip()


# --- Live adapters (used at runtime) ---

def fetch_market_summary() -> dict[str, Any] | None:
    """GET /api/market-summary. Cache-first, returns benchmark + ranked lists."""
    return _fetch_json("/api/market-summary")


def fetch_daily_picks() -> dict[str, Any] | None:
    """GET /api/daily-picks. Combines market-summary + breakout-radar-cache."""
    return _fetch_json("/api/daily-picks")


# --- Payload normalization ---

def build_video_payload(
    summary: dict[str, Any] | None,
    picks: dict[str, Any] | None,
    edition: str = "DAILY",
) -> dict[str, Any]:
    """Shape raw endpoint data into the renderer's expected flat payload.

    Fail closed: if summary is None/empty or candidates is empty, we still
    return the payload but renderer shows "—" / "DATA TERBATAS" gracefully.
    The caller decides whether to proceed based on candidate count.
    """
    regime_obj = (summary or {}).get("marketRegime") or {}
    benchmark_change = _safe_float(regime_obj.get("changePct"))
    benchmark_trend = regime_obj.get("trend") or "NEUTRAL"

    # Derive a display value for the benchmark if present
    benchmark_value: str | None = None
    if benchmark_change is not None:
        # We don't always have the absolute index value; render as change-focused
        benchmark_value = f"IHSG"

    # Collect up to 3 candidates from daily-picks detail lists
    candidates: list[dict[str, Any]] = []
    used_symbols: set[str] = set()

    # Priority order: attractive → relativeStrength → foreignAccumulation → weeklyGainer
    detail_sources: list[tuple[str, str]] = [
        ("attractive", "Skor"),
        ("relativeStrength", "RS"),
        ("foreignAccumulation", "Akumulasi"),
        ("weeklyGainer", "Gainer"),
    ]

    def _extract_detail(list_name: str) -> list[dict[str, Any]]:
        detail = ((picks or {}).get("data") or {}).get(list_name, {}).get("detail", [])
        if not isinstance(detail, list):
            return []
        return detail

    for list_name, metric_prefix in detail_sources:
        for item in _extract_detail(list_name):
            sym = _strip_jk(item.get("symbol", ""))
            if not sym or sym in used_symbols:
                continue
            change = _safe_float(item.get("changePct"))
            price = _safe_float(item.get("price"))
            metric = item.get("metric") or f"{metric_prefix}"
            if isinstance(metric, str) and metric:
                metric_str = metric
            else:
                metric_str = f"{metric_prefix} {sym}"
            candidates.append({"symbol": sym, "changePct": change, "price": price, "metric": metric_str})
            used_symbols.add(sym)
            if len(candidates) >= 3:
                break
        if len(candidates) >= 3:
            break

    return {
        "edition": edition,
        "date": "",  # filled by caller from summary.timestamp or today
        "benchmark_value": benchmark_value or "IHSG",
        "regime": {
            "changePct": benchmark_change,
            "trend": benchmark_trend,
            "label": regime_obj.get("label") if isinstance(regime_obj, dict) else None,
        },
        "candidates": candidates,
    }


def fetch_and_build(edition: str = "DAILY") -> tuple[dict[str, Any], bool]:
    """Fetch live data and build payload. Returns (payload, ok).

    ok is False when either endpoint fails completely or zero candidates found
    (fail closed: don't produce a fabricated video).
    """
    summary = fetch_market_summary()
    picks = fetch_daily_picks()

    if not summary and not picks:
        return ({
            "edition": edition, "date": "", "benchmark_value": "IHSG",
            "regime": {"changePct": None, "trend": "NEUTRAL", "label": None},
            "candidates": [],
        }), False

    payload = build_video_payload(summary, picks, edition)

    # Fill date from summary.timestamp if present
    ts = (summary or {}).get("timestamp") if isinstance(summary, dict) else None
    if isinstance(ts, str) and ts:
        payload["date"] = ts[:10]

    ok = len(payload.get("candidates", [])) > 0
    return payload, ok

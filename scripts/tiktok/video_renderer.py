#!/usr/bin/env python3
"""Render frames for a vertical 1080x1920 MP4 video.

Pure Pillow, no external asset dependencies. Deterministic output given the
same payload — frame content depends only on the data dict, nothing else.
"""
from __future__ import annotations

from typing import Any
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
FPS = 25


def _font(size: int) -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    """Load a TTF with DejaVu as primary, fallback to PIL default bitmap."""
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/droid/DroidSansFallback.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _text_size(draw: ImageDraw.ImageDraw, text: str, font: Any) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    return int(bbox[2] - bbox[0]), int(bbox[3] - bbox[1])


def _draw_centered(draw: ImageDraw.ImageDraw, y: int, text: str, font: Any, fill: str = "#FFFFFF") -> int:
    tw, th = _text_size(draw, text, font)
    x = max((W - tw) // 2, 0)
    draw.text((x, y), text, font=font, fill=fill)
    return y + th + 8


def _draw_card(draw: ImageDraw.ImageDraw, y: int, symbol: str, metric: str, change_pct: float | None, font_sym: Any, font_met: Any) -> int:
    pad = 60
    card_h = 220
    # Card background
    draw.rounded_rectangle((pad, y, W - pad, y + card_h), radius=30, fill="#1A2332")
    # Symbol
    draw.text((pad + 40, y + 30), symbol, font=font_sym, fill="#FFFFFF")
    # Change pct badge
    if change_pct is not None:
        color = "#00E676" if change_pct >= 0 else "#FF5252"
        sign = "+" if change_pct >= 0 else ""
        label = f"{sign}{change_pct:.2f}%"
        tw, _ = _text_size(draw, label, font_met)
        draw.rounded_rectangle((W - pad - 40 - tw - 30, y + 30, W - pad - 40, y + 75), radius=15, fill=color)
        draw.text((W - pad - 40 - tw - 15, y + 36), label, font=font_met, fill="#0A0E14")
    # Metric
    draw.text((pad + 40, y + 110), metric, font=font_met, fill="#B0BEC5")
    return y + card_h + 30


def render_frame(frame_idx: int, payload: dict) -> Image.Image:
    """Render one frame. Frame 0 = title, frames 1..N = candidates + IHSG summary."""
    img = Image.new("RGB", (W, H), "#0F1923")
    draw = ImageDraw.Draw(img)

    font_title = _font(80)
    font_subtitle = _font(48)
    font_ihsg = _font(64)
    font_ihsg_label = _font(36)
    font_symbol = _font(56)
    font_metric = _font(38)
    font_footer = _font(32)

    y = 120

    # Brand header
    y = _draw_centered(draw, y, "SAHAMLENS", font_title, fill="#00B0FF")
    y += 20

    # Date / edition
    date_str = payload.get("date", "—")
    edition_str = payload.get("edition", "DAILY")
    y = _draw_centered(draw, y, f"{edition_str} · {date_str}", font_subtitle, fill="#B0BEC5")
    y += 60

    # IHSG summary card
    regime = payload.get("regime") or {}
    ihsg_change = regime.get("changePct") if isinstance(regime, dict) else None
    ihsg_trend = regime.get("trend", "NEUTRAL") if isinstance(regime, dict) else "NEUTRAL"
    benchmark_value = payload.get("benchmark_value", "—")

    trend_color = "#00E676" if ihsg_change is not None and ihsg_change >= 0 else "#FF5252" if ihsg_change is not None else "#B0BEC5"
    trend_label = "RISK ON" if ihsg_trend == "RISK_ON" else "RISK OFF" if ihsg_trend == "RISK_OFF" else "NEUTRAL"
    change_label = f"{'+' if ihsg_change is not None and ihsg_change >= 0 else ''}{ihsg_change:.2f}%" if ihsg_change is not None else "N/A"

    draw.rounded_rectangle((60, y, W - 60, y + 280), radius=30, fill="#1A2332")
    draw.text((100, y + 25), "IHSG", font=font_ihsg_label, fill="#B0BEC5")
    draw.text((100, y + 80), str(benchmark_value), font=font_ihsg, fill="#FFFFFF")

    tw, _ = _text_size(draw, change_label, font_ihsg)
    draw.text((W - 100 - tw, y + 80), change_label, font=font_ihsg, fill=trend_color)

    draw.text((100, y + 170), f"Trend: {trend_label}", font=font_ihsg_label, fill="#90A4AE")

    # Regime label if present
    regime_label = regime.get("label") or regime.get("code") if isinstance(regime, dict) else None
    if regime_label:
        draw.text((100, y + 220), f"Regime: {regime_label}", font=font_ihsg_label, fill="#78909C")

    y += 320

    # Candidates section header
    y = _draw_centered(draw, y, "KANDIDAT HARI INI", font_subtitle, fill="#FFFFFF")
    y += 30

    candidates = payload.get("candidates", [])
    for c in candidates[:3]:
        symbol = c.get("symbol", "—")
        metric = c.get("metric", "")
        change = c.get("changePct") if isinstance(c, dict) else None
        y = _draw_card(draw, y, symbol, metric, change, font_symbol, font_metric)

    # Footer disclaimer
    footer = "Ringkasan riset data SahamLens. Bukan instruksi transaksi."
    tw, _ = _text_size(draw, footer, font_footer)
    draw.text((max((W - tw) // 2, 0), H - 100), footer, font=font_footer, fill="#546E7A")

    # Frame indicator (subtle, for multi-frame video)
    frame_label = f"frame {frame_idx}"
    draw.text((30, H - 50), frame_label, font=font_footer, fill="#263238")

    return img


def render_frames(payload: dict, duration_sec: int = 10) -> list[Image.Image]:
    """Render all frames for the video. First frame = title, rest = same content."""
    total = max(duration_sec * FPS, 1)
    return [render_frame(i, payload) for i in range(total)]

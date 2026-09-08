#!/usr/bin/env python3
"""Visual-only Telegram operations console for SahamLens.

The daemon long-polls Telegram instead of exposing a public webhook. Every permitted
command and callback produces a PNG status card with inline controls; operational
alerts use the same renderer. It deliberately never prints tokens or API payloads.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as exc:  # pragma: no cover - exercised by deployment prerequisite
    raise SystemExit("ops-telegram-bot: Python Pillow is required (apt install python3-pil)") from exc

API_ROOT = "https://api.telegram.org"
APP_DIR = Path(os.getenv("SAHAMLENS_APP_DIR", "/opt/sahamlens/app"))
STATE_DIR = Path(os.getenv("SAHAMLENS_OPS_STATE_DIR", "/var/lib/sahamlens/ops-telegram-bot"))
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

PALETTE = {
    "bg": "#08111F", "panel": "#101D31", "line": "#23344D", "text": "#F3F7FC",
    "muted": "#9CB0C8", "ok": "#2DD4A8", "warn": "#F9B94E", "bad": "#FA6471", "info": "#5BA7FF",
}


def env(name: str) -> str:
    return os.getenv(name, "").strip()


def config() -> tuple[str, str]:
    token, chat_id = env("TELEGRAM_OPS_BOT_TOKEN"), env("TELEGRAM_OPS_CHAT_ID")
    if not token or not chat_id:
        raise RuntimeError("TELEGRAM_OPS_BOT_TOKEN dan TELEGRAM_OPS_CHAT_ID wajib diisi")
    return token, chat_id


def api(method: str, data: dict[str, str] | None = None, timeout: int = 20) -> dict[str, Any]:
    token, _ = config()
    body = urllib.parse.urlencode(data or {}).encode()
    request = urllib.request.Request(f"{API_ROOT}/bot{token}/{method}", data=body, method="POST")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode())
    if not payload.get("ok"):
        raise RuntimeError(f"Telegram {method} rejected the request")
    return payload


def send_photo(chat_id: str, image_path: Path, caption: str, keyboard: list[list[dict[str, str]]] | None = None) -> None:
    token, _ = config()
    boundary = f"----SahamLensOps{uuid.uuid4().hex}"
    fields = {"chat_id": chat_id, "caption": caption[:1024]}
    if keyboard:
        fields["reply_markup"] = json.dumps({"inline_keyboard": keyboard}, separators=(",", ":"))
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend([f"--{boundary}\r\n".encode(), f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(), value.encode(), b"\r\n"])
    chunks.extend([
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="photo"; filename="sahamlens-ops.png"\r\n',
        b"Content-Type: image/png\r\n\r\n",
        image_path.read_bytes(), b"\r\n", f"--{boundary}--\r\n".encode(),
    ])
    request = urllib.request.Request(
        f"{API_ROOT}/bot{token}/sendPhoto", data=b"".join(chunks), method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        payload = json.loads(response.read().decode())
    if not payload.get("ok"):
        raise RuntimeError("Telegram sendPhoto rejected the request")


def run(command: list[str], timeout: int = 8) -> tuple[int, str]:
    try:
        completed = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=timeout, check=False)
        return completed.returncode, completed.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return 1, "unavailable"


def internal_health() -> tuple[str, str]:
    try:
        with urllib.request.urlopen("http://127.0.0.1:3001/api/health", timeout=6) as response:
            body = json.loads(response.read().decode())
        database = body.get("checks", {}).get("database", "unknown")
        status = body.get("status", "unknown")
        down = body.get("operationalReadiness", {}).get("dataSourceDownCount", 0)
        return ("OK" if status == "ok" and database == "ok" and down == 0 else "WATCH", f"app {status} · db {database} · source down {down}")
    except Exception:
        return "DOWN", "local health endpoint unavailable"


def storage() -> tuple[str, str]:
    usage = shutil.disk_usage("/")
    used_pct = round(usage.used * 100 / usage.total)
    free_gb = usage.free // 1024**3
    level = "OK" if free_gb >= 20 and used_pct < 85 else "WATCH"
    return level, f"root {used_pct}% used · {free_gb} GB free"


def service_status() -> tuple[str, str]:
    code, output = run(["systemctl", "is-active", "sahamlens.service"])
    return ("OK", "sahamlens.service active") if code == 0 and output == "active" else ("DOWN", "sahamlens.service inactive")


def latest_failed_jobs() -> tuple[str, str]:
    code, output = run(["systemctl", "--failed", "--no-legend", "--plain"])
    failed = [line.split()[0] for line in output.splitlines() if line.startswith("sahamlens-")]
    if code != 0:
        return "WATCH", "failed-unit status unavailable"
    if failed:
        return "DOWN", ", ".join(failed[:2]) + (" +more" if len(failed) > 2 else "")
    return "OK", "no failed SahamLens units"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = FONT_BOLD_PATH if bold else FONT_PATH
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def status_color(level: str) -> str:
    return {"OK": PALETTE["ok"], "WATCH": PALETTE["warn"], "DOWN": PALETTE["bad"], "CRITICAL": PALETTE["bad"]}.get(level, PALETTE["info"])


def icon(draw: ImageDraw.ImageDraw, kind: str, box: tuple[int, int, int, int], color: str) -> None:
    """Draw purpose-built line icons so cards stay visual on every Linux font stack."""
    x1, y1, x2, y2 = box
    w = max(3, (x2 - x1) // 13)
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
    if kind == "app":
        draw.rounded_rectangle((x1 + 8, y1 + 10, x2 - 8, y2 - 10), radius=10, outline=color, width=w)
        for y in (y1 + 31, cy, y2 - 31):
            draw.ellipse((x1 + 25, y - 4, x1 + 33, y + 4), fill=color)
            draw.line((x1 + 48, y, x2 - 28, y), fill=color, width=w)
    elif kind == "health":
        points = [(x1 + 8, cy), (x1 + 27, cy), (x1 + 42, y2 - 26), (x1 + 62, y1 + 25), (x1 + 80, cy), (x2 - 8, cy)]
        draw.line(points, fill=color, width=w, joint="curve")
        draw.ellipse((x1 + 5, y1 + 5, x2 - 5, y2 - 5), outline=color, width=w)
    elif kind == "storage":
        draw.rounded_rectangle((x1 + 12, y1 + 15, x2 - 12, y2 - 15), radius=12, outline=color, width=w)
        draw.arc((x1 + 25, y1 + 28, x2 - 25, y2 - 28), 215, 505, fill=color, width=w)
        draw.line((cx, cy, cx + 20, cy - 22), fill=color, width=w)
        draw.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=color)
    elif kind == "jobs":
        for i, height in enumerate((32, 56, 80)):
            left = x1 + 18 + i * 31
            draw.rounded_rectangle((left, y2 - 15 - height, left + 20, y2 - 15), radius=5, fill=color)
        draw.line((x1 + 10, y2 - 12, x2 - 10, y2 - 12), fill=color, width=w)
    else:  # alert
        draw.polygon([(cx, y1 + 8), (x2 - 8, y2 - 10), (x1 + 8, y2 - 10)], outline=color, width=w)
        draw.line((cx, y1 + 34, cx, cy + 12), fill=color, width=w)
        draw.ellipse((cx - 4, y2 - 35, cx + 4, y2 - 27), fill=color)


def metric_kind(label: str) -> str:
    key = label.lower()
    if "application" in key: return "app"
    if "api" in key or "data" in key: return "health"
    if "storage" in key: return "storage"
    if "job" in key or "scheduler" in key: return "jobs"
    return "alert"


def metric_visual(value: str, label: str) -> tuple[int, str]:
    # Visual meter is intentionally only an indicator, never a fabricated metric.
    # Real utilization is extracted only from the storage string that the monitor owns.
    if "storage" in label.lower() and "% used" in value:
        try:
            return max(0, min(100, int(value.split("%", 1)[0].split()[-1]))), "USED"
        except ValueError:
            pass
    return (100 if "active" in value or "ok" in value.lower() or "no failed" in value.lower() else 42), "HEALTH"


def draw_metric_tile(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], label: str, value: str, row_level: str) -> None:
    x1, y1, x2, y2 = box
    color = status_color(row_level)
    draw.rounded_rectangle(box, radius=28, fill="#0B1728", outline=PALETTE["line"], width=2)
    draw.rounded_rectangle((x1 + 28, y1 + 28, x1 + 154, y1 + 154), radius=26, fill="#142842")
    icon(draw, metric_kind(label), (x1 + 45, y1 + 45, x1 + 137, y1 + 137), color)
    draw.text((x1 + 182, y1 + 36), label.upper(), font=font(20, True), fill=PALETTE["muted"])
    draw.text((x1 + 182, y1 + 74), row_level, font=font(31, True), fill=color)
    draw.ellipse((x2 - 65, y1 + 43, x2 - 43, y1 + 65), fill=color)
    percent, meter_label = metric_visual(value, label)
    # One fixed text column keeps value, meter, and labels clear of the icon panel.
    text_left = x1 + 182
    meter_left, meter_right, meter_y = text_left, x2 - 32, y2 - 48
    draw.text((text_left, y2 - 91), value[:52], font=font(20, True), fill=PALETTE["text"])
    draw.text((x2 - 110, y2 - 92), meter_label, font=font(14, True), fill=PALETTE["muted"])
    draw.rounded_rectangle((meter_left, meter_y, meter_right, meter_y + 14), radius=7, fill="#223852")
    draw.rounded_rectangle((meter_left, meter_y, meter_left + int((meter_right - meter_left) * percent / 100), meter_y + 14), radius=7, fill=color)


def render_card(title: str, level: str, rows: list[tuple[str, str, str]], detail: str = "") -> Path:
    width, height = 1440, 900
    image = Image.new("RGB", (width, height), PALETTE["bg"])
    draw = ImageDraw.Draw(image)
    color = status_color(level)
    draw.rounded_rectangle((34, 30, width - 34, height - 30), radius=36, fill=PALETTE["panel"], outline=PALETTE["line"], width=2)
    # Brand mark: shield-style hexagon, not another decorative status dot.
    draw.polygon([(81, 78), (115, 56), (149, 78), (149, 120), (115, 143), (81, 120)], fill="#173450", outline=color)
    draw.line((99, 101, 110, 113, 133, 86), fill=color, width=6)
    draw.text((178, 65), "SAHAMLENS", font=font(25, True), fill=PALETTE["text"])
    draw.text((178, 100), "VISUAL OPS CONSOLE", font=font(18, True), fill=PALETTE["muted"])
    draw.rounded_rectangle((width - 269, 64, width - 78, 132), radius=32, fill=color)
    draw.ellipse((width - 244, 87, width - 220, 111), fill=PALETTE["bg"])
    draw.text((width - 205, 82), level, font=font(25, True), fill=PALETTE["bg"])
    draw.text((82, 183), title, font=font(46, True), fill=PALETTE["text"])
    draw.text((84, 240), "LIVE INFRASTRUCTURE SNAPSHOT", font=font(18, True), fill=PALETTE["muted"])

    # Four visual tiles become a two-column control-room dashboard. Single alerts
    # intentionally occupy one oversized tile instead of a text wall.
    if len(rows) == 1:
        draw_metric_tile(draw, (82, 300, width - 82, 620), *rows[0])
    else:
        positions = [(82, 300, 698, 527), (742, 300, 1358, 527), (82, 560, 698, 787), (742, 560, 1358, 787)]
        for row, box in zip(rows[:4], positions):
            draw_metric_tile(draw, box, *row)
    if detail:
        draw.rounded_rectangle((82, 795, width - 82, 839), radius=16, fill="#0B1728")
        icon(draw, "alert", (98, 802, 130, 834), color)
        draw.text((148, 807), detail[:112], font=font(17), fill=PALETTE["muted"])
    now = datetime.now().astimezone().strftime("LIVE · %d %b %Y · %H:%M:%S %Z")
    draw.text((82, 848), now, font=font(15, True), fill=PALETTE["muted"])
    path = Path(tempfile.mkstemp(prefix="sahamlens-ops-", suffix=".png")[1])
    image.save(path, "PNG", optimize=True)
    return path


def keyboard() -> list[list[dict[str, str]]]:
    return [
        [{"text": "Refresh dashboard", "callback_data": "snapshot"}, {"text": "Storage", "callback_data": "storage"}],
        [{"text": "App health", "callback_data": "health"}, {"text": "Job status", "callback_data": "jobs"}],
    ]


def snapshot(kind: str = "snapshot") -> tuple[Path, str]:
    checks = [("Application", *service_status()), ("API & data", *internal_health()), ("Storage", *storage()), ("Scheduled jobs", *latest_failed_jobs())]
    if kind == "storage":
        selected = [checks[2]]
        title = "Storage status"
    elif kind == "health":
        selected = checks[:2]
        title = "Application health"
    elif kind == "jobs":
        selected = [checks[3]]
        title = "Scheduler status"
    else:
        selected = checks
        title = "Operations dashboard"
    level = "DOWN" if any(row[1] == "DOWN" for row in selected) else "WATCH" if any(row[1] == "WATCH" for row in selected) else "OK"
    rows = [(name, text, row_level) for name, row_level, text in selected]
    return render_card(title, level, rows), f"{title} · {level}"


def alert(level: str, title: str, detail: str) -> None:
    _, chat_id = config()
    image = render_card(title, level, [("Operational alert", detail, level)], "No automatic cleanup or restart was performed.")
    try:
        send_photo(chat_id, image, f"SahamLens Ops · {level}", keyboard())
    finally:
        image.unlink(missing_ok=True)


def handle_update(update: dict[str, Any]) -> None:
    _, allowed_chat = config()
    message = update.get("message") or update.get("callback_query", {}).get("message") or {}
    chat_id = str(message.get("chat", {}).get("id", ""))
    if chat_id != allowed_chat:
        return
    callback = update.get("callback_query")
    if callback:
        kind = str(callback.get("data", "snapshot"))
        api("answerCallbackQuery", {"callback_query_id": str(callback["id"]), "text": "Dashboard updated"})
    else:
        text = str(message.get("text", "")).strip().lower()
        kind = {"/storage": "storage", "/health": "health", "/jobs": "jobs"}.get(text.split()[0] if text else "", "snapshot")
    image, caption = snapshot(kind)
    try:
        send_photo(chat_id, image, caption, keyboard())
    finally:
        image.unlink(missing_ok=True)


def daemon() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    offset_file = STATE_DIR / "telegram-update-offset"
    offset = int(offset_file.read_text().strip()) if offset_file.exists() and offset_file.read_text().strip().isdigit() else 0
    while True:
        try:
            updates = api("getUpdates", {"offset": str(offset), "timeout": "40", "allowed_updates": json.dumps(["message", "callback_query"])} , timeout=55).get("result", [])
            for update in updates:
                offset = int(update["update_id"]) + 1
                try:
                    handle_update(update)
                except Exception as exc:
                    print(f"ops-telegram-bot: update handling failed: {type(exc).__name__}", file=sys.stderr, flush=True)
                offset_file.write_text(str(offset) + "\n")
        except Exception as exc:
            print(f"ops-telegram-bot: polling failed: {type(exc).__name__}", file=sys.stderr, flush=True)
            time.sleep(8)


def main() -> None:
    if len(sys.argv) >= 2 and sys.argv[1] == "alert":
        if len(sys.argv) < 5:
            raise SystemExit("usage: ops-telegram-bot.py alert <OK|WATCH|DOWN|CRITICAL> <title> <detail>")
        alert(sys.argv[2], sys.argv[3], sys.argv[4])
    elif len(sys.argv) >= 2 and sys.argv[1] == "render-test":
        output = Path(sys.argv[2]) if len(sys.argv) >= 3 else Path("/tmp/sahamlens-ops-test.png")
        image = render_card("Operations dashboard", "OK", [("Application", "sahamlens.service active", "OK"), ("Storage", "root 53% used · 88 GB free", "OK")])
        output.write_bytes(image.read_bytes())
        image.unlink(missing_ok=True)
    elif len(sys.argv) >= 2 and sys.argv[1] == "daemon":
        daemon()
    else:
        raise SystemExit("usage: ops-telegram-bot.py {daemon|alert|render-test}")


if __name__ == "__main__":
    main()

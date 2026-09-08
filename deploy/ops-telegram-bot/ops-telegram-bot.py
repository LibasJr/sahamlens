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


def render_card(title: str, level: str, rows: list[tuple[str, str, str]], detail: str = "") -> Path:
    width, height = 1440, 900
    image = Image.new("RGB", (width, height), PALETTE["bg"])
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((42, 36, width - 42, height - 36), radius=28, fill=PALETTE["panel"], outline=PALETTE["line"], width=2)
    color = status_color(level)
    draw.ellipse((82, 82, 110, 110), fill=color)
    draw.text((130, 70), "SAHAMLENS  /  OPS CONSOLE", font=font(26, True), fill=PALETTE["muted"])
    draw.text((82, 140), title, font=font(48, True), fill=PALETTE["text"])
    draw.rounded_rectangle((width - 270, 82, width - 82, 132), radius=24, fill=color)
    draw.text((width - 238, 94), level, font=font(22, True), fill=PALETTE["bg"])
    y = 230
    for label, value, row_level in rows:
        draw.rounded_rectangle((82, y, width - 82, y + 116), radius=18, fill="#0B1728", outline=PALETTE["line"], width=1)
        draw.ellipse((110, y + 45, 132, y + 67), fill=status_color(row_level))
        draw.text((158, y + 25), label.upper(), font=font(19, True), fill=PALETTE["muted"])
        draw.text((158, y + 57), value[:100], font=font(28, True), fill=PALETTE["text"])
        y += 138
    if detail:
        draw.text((86, min(y + 18, 765)), detail[:130], font=font(20), fill=PALETTE["muted"])
    now = datetime.now().astimezone().strftime("Updated %d %b %Y · %H:%M:%S %Z")
    draw.text((82, 825), now, font=font(18), fill=PALETTE["muted"])
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

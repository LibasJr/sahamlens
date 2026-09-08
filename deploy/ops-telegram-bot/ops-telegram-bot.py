#!/usr/bin/env python3
"""Telegram-native, icon-first SahamLens operations console.

The bot long-polls Telegram; it never exposes a public webhook. Every dashboard and
alert is a native Telegram message with visual icons, compact progress bars, and
inline controls -- no PNG/photo attachments.
"""
from __future__ import annotations

import html
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

API_ROOT = "https://api.telegram.org"
STATE_DIR = Path(os.getenv("SAHAMLENS_OPS_STATE_DIR", "/var/lib/sahamlens/ops-telegram-bot"))


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


def keyboard() -> list[list[dict[str, str]]]:
    return [
        [{"text": "🔄 Refresh", "callback_data": "snapshot"}, {"text": "💾 Storage", "callback_data": "storage"}],
        [{"text": "💓 Health", "callback_data": "health"}, {"text": "📊 Jobs", "callback_data": "jobs"}],
    ]


def send_native(chat_id: str, text: str) -> None:
    api("sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": "true",
        "reply_markup": json.dumps({"inline_keyboard": keyboard()}, separators=(",", ":")),
    })


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
        level = "OK" if status == "ok" and database == "ok" and down == 0 else "WATCH"
        return level, f"app {status} · db {database} · {down} source down"
    except Exception:
        return "DOWN", "local health endpoint unavailable"


def storage() -> tuple[str, str]:
    usage = shutil.disk_usage("/")
    used_pct = round(usage.used * 100 / usage.total)
    free_gb = usage.free // 1024**3
    level = "OK" if free_gb >= 20 and used_pct < 85 else "WATCH"
    return level, f"{used_pct}% used · {free_gb} GB free"


def service_status() -> tuple[str, str]:
    code, output = run(["systemctl", "is-active", "sahamlens.service"])
    return ("OK", "service active") if code == 0 and output == "active" else ("DOWN", "service inactive")


def latest_failed_jobs() -> tuple[str, str]:
    code, output = run(["systemctl", "--failed", "--no-legend", "--plain"])
    failed = [line.split()[0] for line in output.splitlines() if line.startswith("sahamlens-")]
    if code != 0:
        return "WATCH", "failed-unit status unavailable"
    if failed:
        return "DOWN", ", ".join(failed[:2]) + (" +more" if len(failed) > 2 else "")
    return "OK", "no failed units"


def level_icon(level: str) -> str:
    return {"OK": "🟢", "WATCH": "🟡", "DOWN": "🔴", "CRITICAL": "🚨"}.get(level, "🔵")


def bar(percent: int, length: int = 10) -> str:
    percent = max(0, min(100, percent))
    filled = round(percent * length / 100)
    return "🟩" * filled + "⬛" * (length - filled)


def storage_percent(text: str) -> int | None:
    try:
        return int(text.split("%", 1)[0].strip())
    except ValueError:
        return None


def row(icon: str, label: str, level: str, detail: str, percent: int | None = None) -> str:
    visual = bar(percent) if percent is not None else ("✅" if level == "OK" else "⚠️" if level == "WATCH" else "❌")
    return f"{icon} <b>{html.escape(label)}</b>  {level_icon(level)} <b>{level}</b>\n    {visual}  <code>{html.escape(detail)}</code>"


def dashboard(kind: str = "snapshot") -> str:
    checks = [
        ("🖥️", "APPLICATION", *service_status()),
        ("💓", "API & DATA", *internal_health()),
        ("💾", "STORAGE", *storage()),
        ("📊", "SCHEDULED JOBS", *latest_failed_jobs()),
    ]
    selected = checks
    title = "🛡️ <b>SAHAMLENS OPS</b>"
    if kind == "storage":
        selected, title = [checks[2]], "💾 <b>STORAGE STATUS</b>"
    elif kind == "health":
        selected, title = checks[:2], "💓 <b>APPLICATION HEALTH</b>"
    elif kind == "jobs":
        selected, title = [checks[3]], "📊 <b>SCHEDULER STATUS</b>"
    overall = "DOWN" if any(item[2] == "DOWN" for item in selected) else "WATCH" if any(item[2] == "WATCH" for item in selected) else "OK"
    lines = [title, f"{level_icon(overall)} <b>{overall}</b>  ━━ <i>LIVE SNAPSHOT</i>", ""]
    for icon, label, level, detail in selected:
        lines.append(row(icon, label, level, detail, storage_percent(detail) if label == "STORAGE" else None))
        lines.append("")
    now = datetime.now().astimezone().strftime("%d %b · %H:%M:%S %Z")
    lines.append(f"🕒 <i>Updated {now}</i>")
    return "\n".join(lines)


def alert(level: str, title: str, detail: str) -> None:
    _, chat_id = config()
    safe_title, safe_detail = html.escape(title), html.escape(detail[:500])
    text = "\n".join([
        f"{level_icon(level)} <b>SAHAMLENS OPS ALERT</b>",
        f"🚨 <b>{safe_title}</b>",
        "",
        f"📌 <code>{safe_detail}</code>",
        "",
        "🛡️ <i>No automatic cleanup, restart, or deploy was performed.</i>",
        f"🕒 <i>{datetime.now().astimezone().strftime('%d %b · %H:%M:%S %Z')}</i>",
    ])
    send_native(chat_id, text)


def handle_update(update: dict[str, Any]) -> None:
    _, allowed_chat = config()
    message = update.get("message") or update.get("callback_query", {}).get("message") or {}
    chat_id = str(message.get("chat", {}).get("id", ""))
    if chat_id != allowed_chat:
        return
    callback = update.get("callback_query")
    if callback:
        kind = str(callback.get("data", "snapshot"))
        api("answerCallbackQuery", {"callback_query_id": str(callback["id"]), "text": "🟢 Updated"})
    else:
        text = str(message.get("text", "")).strip().lower()
        kind = {"/storage": "storage", "/health": "health", "/jobs": "jobs"}.get(text.split()[0] if text else "", "snapshot")
    send_native(chat_id, dashboard(kind))


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
    elif len(sys.argv) >= 2 and sys.argv[1] == "native-test":
        print(dashboard())
    elif len(sys.argv) >= 2 and sys.argv[1] == "daemon":
        daemon()
    else:
        raise SystemExit("usage: ops-telegram-bot.py {daemon|alert|native-test}")


if __name__ == "__main__":
    main()

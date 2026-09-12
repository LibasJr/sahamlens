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

# Sumber kebenaran: config/scheduled-jobs.json (23 job aplikasi) + timer
# infrastruktur yang tidak ada di sana (backup, disk-monitor, dst). Nama timer
# systemd tidak selalu sama dengan nama job -- sebagian dipasang dengan awalan
# qstash- (migrasi dari QStash) atau akhiran -collector. Kalau timer di VPS
# berganti nama, perbarui peta ini juga (lihat CLAUDE.md #2: gerbang pemindai
# yang menunjuk nama lama lulus diam-diam tanpa memeriksa apa pun).
JOB_CATEGORIES: list[tuple[str, list[tuple[str, str]]]] = [
    ("📈 PASAR & INTRADAY", [
        ("ai-pick-scan", "qstash-ai-pick-scan"),
        ("market-pulse", "qstash-market-pulse"),
        ("market-summary", "qstash-market-summary"),
        ("breakout-scan", "qstash-breakout-scan"),
        ("intraday-collect", "intraday-collect"),
        ("market-data-reconcile", "market-data-reconcile"),
        ("macro", "qstash-macro"),
    ]),
    ("🏢 FUNDAMENTAL & ALIRAN DANA", [
        ("bank-fundamental-collect", "bank-fundamental-collector"),
        ("idx-financial-sync", "idx-financial-sync"),
        ("idx-flow-sync", "idx-flow-sync"),
        ("ownership-flow-ksei-sync", "ownership-flow-ksei-sync"),
        ("fundamental-snapshot", "qstash-fundamental-snapshot"),
    ]),
    ("🔍 SCANNER & RISET", [
        ("screener-scan", "screener-scan"),
        ("news", "qstash-news"),
        ("tpcl-validation-worker", "tpcl-validation-worker"),
        ("calendar-scan", "calendar-scan"),
        ("dividend-scan", "dividend-scan"),
        ("recommendation-scan", "qstash-recommendation-scan"),
        ("watchlist-alert", "qstash-watchlist-alert"),
    ]),
    ("🛡️ MODEL & PEMELIHARAAN", [
        ("lens-bucket-backtest", "lens-bucket-backtest"),
        ("lens-score-optimizer", "lens-score-optimizer"),
        ("backtest-precompute", "qstash-backtest-precompute"),
        ("privacy-cleanup", "privacy-cleanup"),
    ]),
    ("🧰 INFRASTRUKTUR", [
        ("database-backup", "database-backup"),
        ("disk-monitor", "disk-monitor"),
        ("weekly-maintenance", "weekly-maintenance"),
        ("uptime-monitor", "uptime-monitor"),
        ("cloudflared-watchdog", "cloudflared-watchdog"),
        ("corporate-calendar-ksei-sync", "corporate-calendar-ksei-sync"),
    ]),
]


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


def db_url() -> str | None:
    return env("DATABASE_URL") or None


def redis_url_value() -> str | None:
    return env("REDIS_URL") or None


def postgres_detail() -> tuple[str, str]:
    """Latensi + jumlah baris via psql (stdlib subprocess), tanpa dependensi baru."""
    url = db_url()
    if not url:
        return "WATCH", "DATABASE_URL kosong"
    started = time.monotonic()
    code, out = run(["psql", url, "-t", "-A", "-c", "SELECT count(*) FROM job_run_log"], timeout=8)
    latency_ms = round((time.monotonic() - started) * 1000)
    if code != 0 or not out.strip().isdigit():
        return "DOWN", "psql query gagal"
    return ("OK" if latency_ms < 1500 else "WATCH"), f"{latency_ms} ms · {out.strip()} baris job_run_log"


def redis_detail() -> tuple[str, str]:
    url = redis_url_value()
    if not url:
        return "WATCH", "REDIS_URL kosong"
    code, out = run(["redis-cli", "-u", url, "--no-raw", "ping"], timeout=6)
    if code != 0 or "PONG" not in out:
        return "DOWN", "PING gagal"
    _, info = run(["redis-cli", "-u", url, "info", "memory"], timeout=6)
    used = next((line.split(":", 1)[1] for line in info.splitlines() if line.startswith("used_memory_human:")), "?")
    return "OK", f"PONG · memory {used}"


def data_source_detail() -> tuple[str, str]:
    url = db_url()
    if not url:
        return "WATCH", "DATABASE_URL kosong"
    query = (
        "SELECT status, count(*) FROM data_source_health "
        "WHERE source_id <> 'IDX_PUBLIC_STOCK_SUMMARY' GROUP BY status"
    )
    code, out = run(["psql", url, "-t", "-A", "-F", "|", "-c", query], timeout=8)
    if code != 0:
        return "WATCH", "query data_source_health gagal"
    counts = {"HEALTHY": 0, "DEGRADED": 0, "DOWN": 0, "UNKNOWN": 0}
    for line in out.splitlines():
        if "|" not in line:
            continue
        status, n = line.split("|", 1)
        if status in counts and n.strip().isdigit():
            counts[status] = int(n.strip())
    level = "DOWN" if counts["DOWN"] > 0 else "WATCH" if counts["DEGRADED"] or counts["UNKNOWN"] else "OK"
    return level, f"healthy {counts['HEALTHY']} · degraded {counts['DEGRADED']} · down {counts['DOWN']}"


def storage() -> tuple[str, str]:
    usage = shutil.disk_usage("/")
    used_pct = round(usage.used * 100 / usage.total)
    free_gb = usage.free // 1024**3
    level = "OK" if free_gb >= 20 and used_pct < 85 else "WATCH"
    return level, f"{used_pct}% used · {free_gb} GB free"


def storage_detail_lines() -> list[str]:
    """Rincian per-direktori data, terpisah dari total root untuk konteks."""
    app_dir = Path(os.getenv("SAHAMLENS_APP_DIR", "/opt/sahamlens/app"))
    targets = [("data/", app_dir / "data"), (".next/", app_dir / ".next")]
    lines: list[str] = []
    for label, path in targets:
        if not path.exists():
            continue
        code, out = run(["du", "-sh", str(path)], timeout=10)
        size = out.split()[0] if code == 0 and out else "?"
        lines.append(f"    📁 <code>{html.escape(label)}</code> {html.escape(size)}")
    return lines


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


def job_run_rows() -> dict[str, dict[str, Any]]:
    """Status terakhir + hitungan 24 jam per job_name langsung dari job_run_log.

    Agregat 24 jam dihitung dengan FILTER dalam SATU pass (bukan correlated
    subquery per baris) -- versi subquery menghabiskan ~20s pada 53k+ baris
    dan kepotong oleh timeout; ini turun ke sub-detik.
    """
    url = db_url()
    if not url:
        return {}
    query = (
        "WITH recent AS ("
        "  SELECT job_name, status, started_at,"
        "         row_number() OVER (PARTITION BY job_name ORDER BY started_at DESC) AS rn"
        "  FROM job_run_log WHERE started_at > now() - interval '24 hours'"
        ") "
        "SELECT j.job_name, j.status,"
        "       to_char(j.started_at AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI'),"
        "       count(r.*) FILTER (WHERE r.job_name IS NOT NULL),"
        "       count(r.*) FILTER (WHERE r.status = 'FAILED') "
        "FROM (SELECT DISTINCT ON (job_name) job_name, status, started_at FROM job_run_log"
        "      ORDER BY job_name, started_at DESC) j "
        "LEFT JOIN recent r ON r.job_name = j.job_name "
        "GROUP BY j.job_name, j.status, j.started_at"
    )
    code, out = run(["psql", url, "-t", "-A", "-F", "|", "-c", query], timeout=20)
    if code != 0:
        return {}
    rows: dict[str, dict[str, Any]] = {}
    for line in out.splitlines():
        parts = line.split("|")
        if len(parts) < 5:
            continue
        name, status, last_run, runs_24h, fails_24h = parts[:5]
        if not (runs_24h.isdigit() and fails_24h.isdigit()):
            continue
        rows[name] = {
            "status": status,
            "last_run": last_run,
            "runs_24h": int(runs_24h),
            "fails_24h": int(fails_24h),
        }
    return rows


def timer_next_run() -> dict[str, str]:
    """Jadwal berikutnya per unit .timer, dibaca dari systemctl list-timers."""
    code, out = run(["systemctl", "list-timers", "sahamlens*", "--no-legend", "--plain", "--all"], timeout=8)
    if code != 0:
        return {}
    result: dict[str, str] = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 6:
            continue
        unit = parts[-2]
        result[unit] = "n/a" if parts[0] == "n/a" else f"{parts[0]} {parts[2][:5]}"
    return result


def jobs_detail_text() -> str:
    """Rincian seluruh scheduled job (23 aplikasi + infrastruktur), per kategori."""
    rows = job_run_rows()
    next_run = timer_next_run()
    lines: list[str] = []
    total = healthy = 0
    for category, jobs in JOB_CATEGORIES:
        lines.append(f"<b>{html.escape(category)}</b>")
        for job_name, timer_name in jobs:
            total += 1
            info = rows.get(job_name)
            next_at = next_run.get(f"sahamlens-{timer_name}.timer")
            suffix = f" · next {html.escape(next_at)}" if next_at else ""
            if info is None:
                lines.append(f"  ⚪ <code>{html.escape(job_name)}</code>\n      └ <i>tidak ada riwayat run</i>{suffix}")
                continue
            if info["status"] == "SUCCESS" and info["fails_24h"] == 0:
                icon = "🟢"
                healthy += 1
            elif info["fails_24h"] > 0:
                icon = "🔴"
            else:
                icon = "🟡"
            lines.append(
                f"  {icon} <code>{html.escape(job_name)}</code>\n"
                f"      └ {html.escape(info['status'])} · {html.escape(info['last_run'])} WIB"
                f" · 24h: {info['runs_24h']}r/{info['fails_24h']}f{suffix}"
            )
        lines.append("")
    lines.append(f"📌 <b>{healthy}/{total}</b> job sukses tanpa kegagalan 24 jam terakhir.")
    return "\n".join(lines)


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
    now = datetime.now().astimezone().strftime("%d %b · %H:%M:%S %Z")

    if kind == "jobs":
        body = jobs_detail_text()
        return f"📊 <b>SAHAMLENS SCHEDULED JOBS</b>\n━━━ <i>DETAIL SEMUA JOB & TIMER</i> ━━━\n\n{body}\n\n🕒 <i>Updated {now}</i>"

    if kind == "health":
        detail_checks = [
            ("🖥️", "APPLICATION", *service_status()),
            ("🐘", "POSTGRESQL", *postgres_detail()),
            ("⚡", "REDIS", *redis_detail()),
            ("🌐", "DATA SOURCES", *data_source_detail()),
        ]
        overall = (
            "DOWN" if any(c[2] == "DOWN" for c in detail_checks)
            else "WATCH" if any(c[2] == "WATCH" for c in detail_checks)
            else "OK"
        )
        lines = ["💓 <b>APPLICATION HEALTH</b>", f"{level_icon(overall)} <b>{overall}</b>  ━━ <i>DETAIL TELEMETRY</i>", ""]
        for icon, label, level, detail in detail_checks:
            lines.append(row(icon, label, level, detail))
            lines.append("")
        lines.append(f"🕒 <i>Updated {now}</i>")
        return "\n".join(lines)

    if kind == "storage":
        level, detail = storage()
        lines = ["💾 <b>STORAGE STATUS</b>", f"{level_icon(level)} <b>{level}</b>  ━━ <i>DETAIL DISK</i>", ""]
        lines.append(row("💾", "ROOT (/)", level, detail, storage_percent(detail)))
        dir_lines = storage_detail_lines()
        if dir_lines:
            lines.append("")
            lines.append("📁 <b>Rincian direktori</b>")
            lines.extend(dir_lines)
        lines.append("")
        lines.append(f"🕒 <i>Updated {now}</i>")
        return "\n".join(lines)

    selected = checks
    title = "🛡️ <b>SAHAMLENS OPS</b>"
    overall = "DOWN" if any(item[2] == "DOWN" for item in selected) else "WATCH" if any(item[2] == "WATCH" for item in selected) else "OK"
    lines = [title, f"{level_icon(overall)} <b>{overall}</b>  ━━ <i>LIVE SNAPSHOT</i>", ""]
    for icon, label, level, detail in selected:
        lines.append(row(icon, label, level, detail, storage_percent(detail) if label == "STORAGE" else None))
        lines.append("")
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

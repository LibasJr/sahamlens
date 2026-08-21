#!/usr/bin/env python3
"""Sinkronisasi penutupan IHSG dari endpoint Index Summary resmi BEI.

Endpoint: https://www.idx.co.id/primary/TradingSummary/GetIndexSummary
Output: data/idx-index/ihsg.json

ZERO DUMMY: hanya baris IHSG dengan tanggal dan close positif yang disimpan. Tidak ada
interpolasi, proxy Yahoo, atau rekonstruksi lelang penutupan.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

try:
    from curl_cffi import requests
except ImportError:  # pragma: no cover
    print("[!] curl_cffi belum terpasang", file=sys.stderr)
    raise SystemExit(2)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENDPOINT = "https://www.idx.co.id/primary/TradingSummary/GetIndexSummary"
DEFAULT_OUTPUT = os.path.join(ROOT, "data", "idx-index", "ihsg.json")
IHSG_CODES = {"COMPOSITE", "IHSG", "JKSE", "JCI"}


def number(value) -> float | None:
    try:
        parsed = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed and parsed > 0 and parsed not in (float("inf"), float("-inf")) else None


def rows_from(payload) -> list[dict]:
    if not isinstance(payload, dict):
        return []
    for key in ("data", "replies", "results"):
        if isinstance(payload.get(key), list):
            return payload[key]
    return []


def normalize(payload, fallback_date: str) -> dict | None:
    for item in rows_from(payload):
        if not isinstance(item, dict):
            continue
        code = str(item.get("IndexCode") or item.get("Code") or item.get("Index") or "").strip().upper()
        name = str(item.get("IndexName") or item.get("Name") or "").strip().upper()
        if code not in IHSG_CODES and "HARGA SAHAM GABUNGAN" not in name and "COMPOSITE" not in name:
            continue
        close = number(item.get("Close") or item.get("Closing") or item.get("ClosePrice"))
        raw_date = item.get("Date") or item.get("TradingDate") or fallback_date
        day = str(raw_date)[:10]
        if close is not None and len(day) == 10:
            return {"date": day, "close": close}
    return None


def fetch_day(session, day: date, timeout: int, retries: int) -> dict | None:
    query_date = day.isoformat()
    url = f"{ENDPOINT}?date={query_date}&start=0&length=200"
    for attempt in range(1, retries + 1):
        try:
            response = session.get(url, timeout=timeout)
            if response.status_code == 200:
                return normalize(response.json(), query_date)
            print(f"[!] {query_date}: HTTP {response.status_code}", file=sys.stderr)
        except Exception as error:
            print(f"[!] {query_date}: percobaan {attempt}/{retries}: {error}", file=sys.stderr)
        time.sleep(attempt)
    return None


def existing(path: str) -> list[dict]:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload.get("history", []) if isinstance(payload, dict) else []
    except (OSError, ValueError):
        return []


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--timeout", type=int, default=25)
    parser.add_argument("--retries", type=int, default=3)
    args = parser.parse_args()
    if args.days < 2:
        raise SystemExit("--days minimal 2")

    session = requests.Session(impersonate="chrome124")
    collected = []
    today = date.today()
    for offset in range(args.days - 1, -1, -1):
        day = today - timedelta(days=offset)
        if day.weekday() >= 5:
            continue
        row = fetch_day(session, day, args.timeout, args.retries)
        if row:
            collected.append(row)

    merged = {}
    for row in [*existing(args.output), *collected]:
        if isinstance(row, dict) and isinstance(row.get("date"), str) and number(row.get("close")) is not None:
            merged[row["date"]] = {"date": row["date"], "close": number(row["close"])}
    history = [merged[key] for key in sorted(merged)][-400:]
    if len(history) < 2:
        print("[!] BEI belum memberi minimal dua penutupan IHSG valid; artefak tidak ditulis", file=sys.stderr)
        return 1

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    temporary = f"{args.output}.tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump({
            "source": "IDX_OFFICIAL_INDEX_SUMMARY",
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "history": history,
        }, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.replace(temporary, args.output)
    print(f"OK IHSG IDX: {len(history)} close, terbaru {history[-1]['date']} = {history[-1]['close']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

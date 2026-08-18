#!/usr/bin/env python3
"""Sinkronisasi EOD Broker Summary (88 Anggota Bursa) dari API resmi BEI.

Endpoint: https://www.idx.co.id/primary/TradingSummary/GetBrokerSummary?date={YYYY-MM-DD}&start=0&length=150

Output: data/broker-summary/broker_{YYYY-MM-DD}.csv
Header: date,broker_code,broker_name,volume,value,frequency

BENTUK DATA - BACA SEBELUM MENGUBAH TUJUAN OUTPUT:
Endpoint ini memberi AGREGAT SELURUH PASAR PER BROKER. Tidak ada kolom ticker, dan
tidak ada pemisahan beli/jual - hanya total Volume, Value, Frequency per broker per
hari. Tabel `broker_summary_daily` (lihat database/migrations/000_runtime_schema_baseline.sql)
mensyaratkan `ticker NOT NULL` plus `buy_value`/`sell_value` terpisah, jadi data ini
TIDAK BISA diimpor lewat importBrokerSummaryCsv() tanpa mengarang ticker dan mengarang
pemecahan beli/jual - dilarang oleh Zero Dummy Policy. Karena itu skrip ini berhenti di
artefak CSV harian; jangan "melengkapi"-nya dengan angka hasil tebakan.

Contoh:
    python scripts/sync-idx-broker-summary.py
    python scripts/sync-idx-broker-summary.py --date 2026-08-14
    python scripts/sync-idx-broker-summary.py --date 2026-08-01 --until 2026-08-14
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
import time
from datetime import date, datetime, timedelta

try:
    from curl_cffi import requests
except ImportError:  # pragma: no cover - dependency guard
    print("[!] curl_cffi belum terpasang. Jalankan: pip install curl_cffi", file=sys.stderr)
    raise SystemExit(2)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT_DIR = os.path.join(REPO_ROOT, "data", "broker-summary")

IDX_ENDPOINT = "https://www.idx.co.id/primary/TradingSummary/GetBrokerSummary"
CSV_HEADER = ["date", "broker_code", "broker_name", "volume", "value", "frequency"]


def to_float(value) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def parse_date(text: str) -> date:
    try:
        return datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError:
        raise SystemExit(f"[!] Format tanggal salah: {text} (harus YYYY-MM-DD)")


def normalize_rows(payload_rows: list[dict], fallback_date: str) -> list[dict]:
    """Validasi baris broker. Baris tanpa kode broker atau tanpa angka dibuang."""
    rows: list[dict] = []
    for item in payload_rows:
        code = (item.get("IDFirm") or "").strip().upper()
        if not code:
            continue
        volume = to_float(item.get("Volume"))
        value = to_float(item.get("Value"))
        frequency = to_float(item.get("Frequency"))
        if volume is None or value is None or frequency is None:
            continue
        if volume < 0 or value < 0 or frequency < 0:
            continue
        raw_date = item.get("Date")
        rows.append(
            {
                "date": str(raw_date)[:10] if raw_date else fallback_date,
                "broker_code": code,
                "broker_name": (item.get("FirmName") or "").strip(),
                # Angka ditulis polos (tanpa "Rp"/pemisah ribuan) supaya konsumen
                # program bisa langsung parse tanpa membersihkan format tampilan.
                "volume": f"{volume:.0f}",
                "value": f"{value:.0f}",
                "frequency": f"{frequency:.0f}",
            }
        )
    rows.sort(key=lambda row: float(row["value"]), reverse=True)
    return rows


def fetch_date(session, day: date, retries: int, timeout: int) -> list[dict] | None:
    day_str = day.isoformat()
    url = f"{IDX_ENDPOINT}?date={day_str}&start=0&length=150"
    for attempt in range(1, retries + 1):
        try:
            response = session.get(url, timeout=timeout)
        except Exception as error:
            print(f"    percobaan {attempt}/{retries} gagal: {error}", flush=True)
            time.sleep(attempt * 1.5)
            continue
        if response.status_code != 200:
            print(f"    percobaan {attempt}/{retries} HTTP {response.status_code}", flush=True)
            time.sleep(attempt * 1.5)
            continue
        try:
            payload = response.json()
        except Exception as error:
            print(f"    percobaan {attempt}/{retries} respons bukan JSON: {error}", flush=True)
            time.sleep(attempt * 1.5)
            continue
        data = payload.get("data")
        return data if isinstance(data, list) else []
    return None


def write_csv(out_dir: str, day: date, rows: list[dict]) -> str:
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"broker_{day.isoformat()}.csv")
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_HEADER)
        writer.writeheader()
        writer.writerows(rows)
    return path


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sinkronisasi EOD Broker Summary resmi BEI.")
    parser.add_argument("--date", help="Tanggal bursa YYYY-MM-DD. Default: hari bursa terakhir yang ada datanya.")
    parser.add_argument("--until", help="Kalau diisi, ambil rentang --date s/d --until (inklusif).")
    parser.add_argument("--lookback", type=int, default=7, help="Maksimal hari mundur saat mencari hari bursa terakhir (default 7).")
    parser.add_argument("--out", default=DEFAULT_OUT_DIR, help="Folder output CSV.")
    parser.add_argument("--sleep", type=float, default=0.8, help="Jeda antar-tanggal dalam detik.")
    parser.add_argument("--retries", type=int, default=3, help="Percobaan ulang per tanggal.")
    parser.add_argument("--timeout", type=int, default=40, help="Timeout HTTP per permintaan, detik.")
    return parser.parse_args(argv)


def sync_one(session, day: date, args) -> tuple[str, int]:
    """Kembalikan ("ok"|"empty"|"failed", jumlah_baris) untuk satu tanggal."""
    print(f"[+] {day.isoformat()}", flush=True)
    payload_rows = fetch_date(session, day, args.retries, args.timeout)
    if payload_rows is None:
        print(f"    GAGAL setelah {args.retries} percobaan", flush=True)
        return "failed", 0
    rows = normalize_rows(payload_rows, day.isoformat())
    if not rows:
        print("    tidak ada data (kemungkinan libur bursa/akhir pekan) - file TIDAK ditulis", flush=True)
        return "empty", 0
    path = write_csv(args.out, day, rows)
    total_value = sum(float(row["value"]) for row in rows)
    print(f"    OK {len(rows)} broker, total nilai Rp {total_value:,.0f} -> {path}", flush=True)
    return "ok", len(rows)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    session = requests.Session(impersonate="chrome124")

    if args.until:
        if not args.date:
            print("[!] --until butuh --date sebagai awal rentang.", file=sys.stderr)
            return 2
        start = parse_date(args.date)
        end = parse_date(args.until)
        if end < start:
            print("[!] --until lebih awal dari --date.", file=sys.stderr)
            return 2
        ok = 0
        day = start
        while day <= end:
            status, _ = sync_one(session, day, args)
            if status == "ok":
                ok += 1
            day += timedelta(days=1)
            if day <= end and args.sleep > 0:
                time.sleep(args.sleep)
        print(f"\n[=] Selesai. Tanggal dengan data: {ok}.")
        return 0 if ok > 0 else 1

    if args.date:
        status, _ = sync_one(session, parse_date(args.date), args)
        return 0 if status == "ok" else 1

    # Tanpa --date: mundur dari hari ini sampai ketemu hari bursa yang ada datanya.
    # BEI tidak punya endpoint "hari bursa terakhir", dan menebak kalender libur
    # nasional secara lokal akan salah - jadi tanggalnya ditentukan oleh respons
    # endpoint itu sendiri, bukan oleh asumsi.
    today = date.today()
    for offset in range(args.lookback + 1):
        day = today - timedelta(days=offset)
        status, _ = sync_one(session, day, args)
        if status == "ok":
            return 0
        if offset < args.lookback and args.sleep > 0:
            time.sleep(args.sleep)
    print(f"[!] Tidak menemukan data broker dalam {args.lookback} hari terakhir.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

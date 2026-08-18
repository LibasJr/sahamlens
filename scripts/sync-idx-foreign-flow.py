#!/usr/bin/env python3
"""Sinkronisasi Real Foreign Flow per emiten dari API resmi Bursa Efek Indonesia.

Endpoint: https://www.idx.co.id/primary/ListedCompany/GetTradingInfoSS?code={TICKER}&length={N}

Kenapa Python + curl_cffi, bukan fetch() di Next.js: idx.co.id berada di belakang
Cloudflare yang memblokir klien tanpa TLS/JA3 fingerprint browser (403). curl_cffi
dengan impersonate="chrome124" meniru fingerprint itu, jadi tidak perlu akun privat,
proxy berbayar, atau scraping halaman HTML.

Output: data/foreign-flow/{TICKER}.json - dibaca server-side oleh
modules/market/service/idx-foreign-flow.service.ts.

ZERO DUMMY: skrip ini tidak pernah mengarang, menambal, atau menginterpolasi angka.
Baris yang field wajibnya tidak lengkap DIBUANG, bukan ditebak.

Contoh:
    python scripts/sync-idx-foreign-flow.py BBCA BBRI BMRI TLKM ASII
    python scripts/sync-idx-foreign-flow.py --universe lq45 --length 90
    python scripts/sync-idx-foreign-flow.py --universe all --length 30
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

try:
    from curl_cffi import requests
except ImportError:  # pragma: no cover - dependency guard
    print("[!] curl_cffi belum terpasang. Jalankan: pip install curl_cffi", file=sys.stderr)
    raise SystemExit(2)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT_DIR = os.path.join(REPO_ROOT, "data", "foreign-flow")
LQ45_SOURCE = os.path.join(REPO_ROOT, "lib", "utils", "blue-chip-index.ts")
EMITEN_CSV = os.path.join(REPO_ROOT, "idx_emiten_900.csv")

IDX_ENDPOINT = "https://www.idx.co.id/primary/ListedCompany/GetTradingInfoSS"
SOURCE_LABEL = "IDX_OFFICIAL_API"

TICKER_RE = re.compile(r"^[A-Z]{4}$")


def load_lq45_universe() -> list[str]:
    """Baca konstituen LQ45 dari lib/utils/blue-chip-index.ts.

    Daftarnya dibaca dari sumber tunggal yang sudah dipakai UI (badge Blue-chip),
    bukan disalin ulang di sini - supaya tidak ada dua daftar yang bisa berbeda.
    """
    with open(LQ45_SOURCE, "r", encoding="utf-8") as handle:
        text = handle.read()
    match = re.search(r"LQ45_CONSTITUENTS[^=]*=\s*\[(.*?)\]", text, re.S)
    if not match:
        raise SystemExit(f"[!] Tidak menemukan LQ45_CONSTITUENTS di {LQ45_SOURCE}")
    codes = re.findall(r"'([A-Z]{4})\.JK'", match.group(1))
    if not codes:
        raise SystemExit(f"[!] LQ45_CONSTITUENTS kosong di {LQ45_SOURCE}")
    return codes


def load_all_universe() -> list[str]:
    """Baca seluruh kode emiten dari idx_emiten_900.csv (kolom kedua)."""
    codes: list[str] = []
    with open(EMITEN_CSV, "r", encoding="utf-8") as handle:
        for index, line in enumerate(handle):
            if index == 0:
                continue
            parts = line.split(",")
            if len(parts) < 2:
                continue
            code = parts[1].strip().upper()
            if TICKER_RE.match(code):
                codes.append(code)
    # urutan file dipertahankan, duplikat dibuang
    return list(dict.fromkeys(codes))


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


def normalize_rows(replies: list[dict]) -> list[dict]:
    """Ubah respons mentah BEI jadi baris histori yang sudah divalidasi.

    ForeignBuy/ForeignSell dari BEI adalah VOLUME LEMBAR saham (bukan Rupiah), jadi
    nilai Rupiah net dihitung sebagai (ForeignBuy - ForeignSell) * Close.
    """
    rows: list[dict] = []
    for item in replies:
        raw_date = item.get("Date")
        close = to_float(item.get("Close"))
        foreign_buy = to_float(item.get("ForeignBuy"))
        foreign_sell = to_float(item.get("ForeignSell"))
        if not raw_date or close is None or close <= 0:
            continue
        if foreign_buy is None or foreign_sell is None:
            continue
        if foreign_buy < 0 or foreign_sell < 0:
            continue

        date = str(raw_date)[:10]
        net_volume = foreign_buy - foreign_sell
        net_value_billion = (net_volume * close) / 1_000_000_000

        rows.append(
            {
                "date": date,
                "close": close,
                "high": to_float(item.get("High")),
                "low": to_float(item.get("Low")),
                "open": to_float(item.get("OpenPrice")),
                "volume": to_float(item.get("Volume")),
                "value": to_float(item.get("Value")),
                "frequency": to_float(item.get("Frequency")),
                "foreignBuy": foreign_buy,
                "foreignSell": foreign_sell,
                "netForeignVolume": net_volume,
                "netForeignValueBillion": round(net_value_billion, 4),
            }
        )

    # BEI mengembalikan urutan terbaru lebih dulu; simpan menaik supaya konsumen bisa
    # ambil "N hari terakhir" dengan slice(-N) tanpa membalik ulang.
    rows.sort(key=lambda row: row["date"])
    # Satu tanggal hanya boleh muncul sekali (respons BEI kadang mengulang baris).
    deduped: dict[str, dict] = {}
    for row in rows:
        deduped[row["date"]] = row
    return [deduped[key] for key in sorted(deduped)]


def fetch_ticker(session, ticker: str, length: int, retries: int, timeout: int) -> list[dict] | None:
    url = f"{IDX_ENDPOINT}?code={ticker}&length={length}"
    for attempt in range(1, retries + 1):
        try:
            response = session.get(url, timeout=timeout)
        except Exception as error:  # koneksi putus / TLS gagal
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

        # Endpoint ini menaruh datanya di key "replies" (bukan "data" seperti endpoint
        # TradingSummary) - jangan diseragamkan tanpa memeriksa respons aslinya.
        replies = payload.get("replies")
        if not isinstance(replies, list):
            return []
        return replies
    return None


def write_output(out_dir: str, ticker: str, rows: list[dict]) -> str:
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{ticker}.json")
    document = {
        "ticker": ticker,
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": SOURCE_LABEL,
        "count": len(rows),
        "history": rows,
    }
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(document, handle, indent=2)
        handle.write("\n")
    return path


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sinkronisasi Real Foreign Flow per emiten dari API resmi BEI."
    )
    parser.add_argument("tickers", nargs="*", help="Kode emiten, contoh: BBCA BBRI TLKM")
    parser.add_argument(
        "--universe",
        choices=["lq45", "all"],
        help="Ambil daftar emiten dari universe siap pakai, bukan argumen manual.",
    )
    parser.add_argument("--length", type=int, default=90, help="Jumlah hari bursa ke belakang (default 90).")
    parser.add_argument("--out", default=DEFAULT_OUT_DIR, help="Folder output JSON.")
    parser.add_argument("--sleep", type=float, default=0.8, help="Jeda antar-ticker dalam detik (default 0.8).")
    parser.add_argument("--retries", type=int, default=3, help="Percobaan ulang per ticker (default 3).")
    parser.add_argument("--timeout", type=int, default=40, help="Timeout HTTP per permintaan, detik.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    tickers = [t.strip().upper().replace(".JK", "") for t in args.tickers if t.strip()]
    if args.universe == "lq45":
        tickers = load_lq45_universe() + tickers
    elif args.universe == "all":
        tickers = load_all_universe() + tickers
    tickers = list(dict.fromkeys(tickers))

    invalid = [t for t in tickers if not TICKER_RE.match(t)]
    if invalid:
        print(f"[!] Kode emiten tidak valid: {', '.join(invalid)}", file=sys.stderr)
        return 2
    if not tickers:
        print("[!] Tidak ada ticker. Beri argumen kode emiten atau --universe lq45|all.", file=sys.stderr)
        return 2
    if args.length < 1:
        print("[!] --length minimal 1.", file=sys.stderr)
        return 2

    session = requests.Session(impersonate="chrome124")
    total = len(tickers)
    ok = 0
    empty: list[str] = []
    failed: list[str] = []

    print(f"[+] Sinkronisasi {total} emiten, {args.length} hari bursa, sumber {SOURCE_LABEL}", flush=True)

    for index, ticker in enumerate(tickers, start=1):
        print(f"[{index}/{total}] {ticker}", flush=True)
        replies = fetch_ticker(session, ticker, args.length, args.retries, args.timeout)
        if replies is None:
            failed.append(ticker)
            print(f"    GAGAL setelah {args.retries} percobaan - file lama TIDAK ditimpa", flush=True)
        else:
            rows = normalize_rows(replies)
            if not rows:
                # Jangan tulis file kosong menimpa data lama yang masih valid.
                empty.append(ticker)
                print("    kosong / tidak ada baris valid - file lama TIDAK ditimpa", flush=True)
            else:
                path = write_output(args.out, ticker, rows)
                last = rows[-1]
                ok += 1
                print(
                    f"    OK {len(rows)} baris ({rows[0]['date']} s/d {last['date']}), "
                    f"net terakhir {last['netForeignValueBillion']:+.3f} M -> {path}",
                    flush=True,
                )
        if index < total and args.sleep > 0:
            time.sleep(args.sleep)

    print(f"\n[=] Selesai. Sukses {ok}/{total}. Kosong: {len(empty)}. Gagal: {len(failed)}.")
    if empty:
        print(f"    Kosong: {', '.join(empty)}")
    if failed:
        print(f"    Gagal : {', '.join(failed)}")
    return 0 if ok > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

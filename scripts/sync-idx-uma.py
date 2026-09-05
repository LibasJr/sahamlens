#!/usr/bin/env python3
"""Sinkronisasi pengumuman UMA (Unusual Market Activity) resmi Bursa Efek Indonesia.

Endpoint: https://www.idx.co.id/primary/NewsAnnouncement/GetUMA?indexFrom={N}&pageSize={M}

Kenapa Python + curl_cffi, bukan fetch() di Next.js: sama dengan sync-idx-foreign-flow.py -
idx.co.id ada di belakang Cloudflare yang memblokir klien tanpa TLS/JA3 fingerprint browser.
`curl` biasa membalas 403 "Attention Required"; curl_cffi impersonate="chrome124" tembus.

Output: data/idx-uma/uma-index.json - satu berkas, dibaca server-side sebagai gerbang
OFFICIAL_TRADING_RESTRICTIONS pada ARA scanner.

ZERO DUMMY: skrip ini tidak pernah mengarang atau menambal. Baris tanpa CompanyID atau
UMADate yang sah DIBUANG, bukan ditebak. Kalau pengambilan gagal, berkas lama TIDAK
ditimpa - lebih baik data basi yang jujur daripada data baru yang bolong.

CATATAN PENTING TENTANG FILTER TANGGAL
--------------------------------------
Endpoint ini MENERIMA parameter dateFrom/dateTo tapi MENGABAIKANNYA - diuji 2026-09-05,
`dateFrom=2026-09-01&dateTo=2026-09-04` mengembalikan 0 baris padahal ada UMA pada
rentang itu. Jangan pernah mengandalkan filter sisi server; ambil halaman berurutan
lalu saring tanggal di sisi kita. Kalau suatu saat filter itu "kelihatan bekerja",
verifikasi ulang sebelum mempercayainya - 0 baris di sini berarti "tidak dijawab",
bukan "tidak ada UMA", dan membedakan keduanya adalah inti gerbang ini.

Contoh:
    python scripts/sync-idx-uma.py                     # 120 hari terakhir
    python scripts/sync-idx-uma.py --lookback-days 30
    python scripts/sync-idx-uma.py --out /tmp/coba     # uji tanpa menyentuh data produksi
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone

try:
    from curl_cffi import requests
except ImportError:  # pragma: no cover - dependency guard
    print("[!] curl_cffi belum terpasang. Jalankan: pip install curl_cffi", file=sys.stderr)
    raise SystemExit(2)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT_DIR = os.path.join(REPO_ROOT, "data", "idx-uma")

IDX_ENDPOINT = "https://www.idx.co.id/primary/NewsAnnouncement/GetUMA"
SOURCE_LABEL = "IDX_OFFICIAL_API"

TICKER_RE = re.compile(r"^[A-Z]{4}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# pageSize=200 terbukti dilayani (diuji 2026-09-05). Di atas itu belum diverifikasi,
# jadi jangan dinaikkan tanpa mengujinya lebih dulu.
PAGE_SIZE = 100
MAX_PAGES = 60


def normalize_date(raw) -> str | None:
    """'2026-09-03T00:00:00' -> '2026-09-03'. Kembalikan None kalau tidak sah."""
    if not raw:
        return None
    text = str(raw)[:10]
    if not DATE_RE.match(text):
        return None
    try:
        datetime.strptime(text, "%Y-%m-%d")
    except ValueError:
        return None
    return text


def normalize_rows(results: list[dict]) -> list[dict]:
    """Ubah respons mentah BEI jadi baris UMA yang sudah divalidasi.

    CompanyID adalah kode emiten resmi. Pencocokan gerbang WAJIB lewat field ini,
    bukan mencari kode di dalam teks judul: 'NATO' juga muncul sebagai substring pada
    nama panjang perusahaan lain, dan gerbang keselamatan tidak boleh berdiri di atas
    pencocokan seperti itu.
    """
    rows: list[dict] = []
    for item in results:
        ticker = str(item.get("CompanyID") or "").strip().upper()
        uma_date = normalize_date(item.get("UMADate"))
        uma_id = str(item.get("UMAID") or "").strip()

        # Field wajib. Tanpa salah satunya baris tidak bisa dipakai sebagai bukti.
        if not TICKER_RE.match(ticker) or not uma_date or not uma_id:
            continue

        rows.append(
            {
                "umaId": uma_id,
                "ticker": ticker,
                "umaDate": uma_date,
                "companyName": str(item.get("CompanyName") or "").strip() or None,
                "announcementNo": str(item.get("AnnouncementNo") or "").strip() or None,
                "attachment": str(item.get("Attachment") or "").strip() or None,
                "status": str(item.get("Status") or "").strip() or None,
                "title": str(item.get("Judul") or "").strip() or None,
            }
        )
    return rows


def fetch_page(session, page_number: int, page_size: int, retries: int, timeout: int):
    """Ambil satu halaman. Kembalikan (results, error). results=None berarti gagal total.

    PENTING: `indexFrom` adalah NOMOR HALAMAN (1, 2, 3, ...), BUKAN offset baris.
    Diuji 2026-09-05 dengan pageSize=100: indexFrom=1 -> 2026-09-03..2026-06-05,
    indexFrom=2 -> 2026-06-04..2026-02-23 (bersambung rapi), sedangkan indexFrom=101
    mengembalikan 0 baris. Mengirim offset baris membuat paginasi berhenti di halaman
    pertama dan seolah-olah "data sudah habis" - kesalahan yang diam, bukan yang memerah.
    """
    url = f"{IDX_ENDPOINT}?indexFrom={page_number}&pageSize={page_size}&dateFrom=&dateTo=&lang=id"
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

        results = payload.get("Results")
        if not isinstance(results, list):
            return [], None
        return results, payload.get("ResultCount")
    return None, None


def write_output(out_dir: str, rows: list[dict], oldest: str, newest: str, result_count) -> str:
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "uma-index.json")

    by_ticker: dict[str, list[str]] = {}
    for row in rows:
        by_ticker.setdefault(row["ticker"], []).append(row["umaDate"])
    for ticker in by_ticker:
        by_ticker[ticker] = sorted(set(by_ticker[ticker]), reverse=True)

    document = {
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": SOURCE_LABEL,
        "endpoint": IDX_ENDPOINT,
        # Rentang yang BENAR-BENAR tercakup. Konsumen wajib memakai ini untuk memutuskan
        # apakah pertanyaannya terjawab: ticker yang tidak ada di sini di luar rentang
        # berarti TIDAK DIKETAHUI, bukan bersih.
        "coverageFrom": oldest,
        "coverageTo": newest,
        "totalAnnouncementsUpstream": result_count,
        "count": len(rows),
        "tickerCount": len(by_ticker),
        "tickers": dict(sorted(by_ticker.items())),
        "announcements": rows,
    }
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(document, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    return path


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sinkronisasi pengumuman UMA resmi BEI untuk gerbang ARA scanner."
    )
    parser.add_argument("--lookback-days", type=int, default=120,
                        help="Ambil UMA sampai N hari ke belakang (default 120).")
    parser.add_argument("--out", default=DEFAULT_OUT_DIR, help="Folder output JSON.")
    parser.add_argument("--page-size", type=int, default=PAGE_SIZE,
                        help=f"Baris per halaman (default {PAGE_SIZE}, maks teruji 200).")
    parser.add_argument("--sleep", type=float, default=0.8,
                        help="Jeda antar-halaman dalam detik (default 0.8).")
    parser.add_argument("--retries", type=int, default=3, help="Percobaan ulang per halaman.")
    parser.add_argument("--timeout", type=int, default=40, help="Timeout HTTP per permintaan.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    if args.lookback_days < 1:
        print("[!] --lookback-days minimal 1.", file=sys.stderr)
        return 2
    if not 1 <= args.page_size <= 200:
        print("[!] --page-size harus 1..200 (200 batas yang sudah diuji).", file=sys.stderr)
        return 2

    cutoff = (datetime.now(timezone.utc) - timedelta(days=args.lookback_days)).strftime("%Y-%m-%d")
    session = requests.Session(impersonate="chrome124")

    print(f"[+] Sinkronisasi UMA sejak {cutoff}, sumber {SOURCE_LABEL}", flush=True)

    collected: dict[str, dict] = {}
    result_count = None
    reached_cutoff = False
    pages_read = 0

    for page in range(1, MAX_PAGES + 1):
        print(f"[halaman {page}]", flush=True)

        results, count = fetch_page(session, page, args.page_size, args.retries, args.timeout)
        if results is None:
            # Gagal total. JANGAN tulis berkas separuh jalan - itu akan tampak seperti
            # "tidak ada UMA" bagi konsumen, yaitu kebohongan paling berbahaya di sini.
            print("[!] Pengambilan gagal setelah semua percobaan. Berkas lama TIDAK ditimpa.",
                  file=sys.stderr)
            return 1
        if count is not None:
            result_count = count
        if not results:
            print("    halaman kosong - berhenti", flush=True)
            break

        pages_read += 1
        rows = normalize_rows(results)
        dropped = len(results) - len(rows)
        if dropped:
            print(f"    {dropped} baris dibuang (field wajib tidak lengkap)", flush=True)

        for row in rows:
            collected[row["umaId"]] = row

        oldest_in_page = min((r["umaDate"] for r in rows), default=None)
        print(f"    {len(rows)} baris sah, tertua {oldest_in_page}", flush=True)

        if oldest_in_page and oldest_in_page < cutoff:
            reached_cutoff = True
            print("    sudah melewati cutoff - berhenti", flush=True)
            break

        time.sleep(args.sleep)

    if not collected:
        print("[!] Tidak ada satu pun baris UMA yang sah. Berkas TIDAK ditulis.", file=sys.stderr)
        return 1

    rows = [r for r in collected.values() if r["umaDate"] >= cutoff]
    rows.sort(key=lambda r: (r["umaDate"], r["umaId"]), reverse=True)

    if not rows:
        print(f"[!] Tidak ada UMA dalam {args.lookback_days} hari terakhir. Berkas TIDAK ditulis.",
              file=sys.stderr)
        return 1

    newest = rows[0]["umaDate"]
    oldest = rows[-1]["umaDate"]

    # Kalau paginasi berhenti sebelum menembus cutoff, cakupan sebenarnya lebih pendek
    # daripada yang diminta. Katakan apa adanya supaya konsumen tidak salah kira:
    # coverageFrom SELALU tanggal tertua yang benar-benar terambil, bukan cutoff yang
    # diminta - kalau keduanya ditukar, ticker di rentang yang tidak pernah diambil akan
    # tampak "bersih" padahal statusnya tidak diketahui.
    if not reached_cutoff:
        print(f"[!] Paginasi habis sebelum mencapai cutoff {cutoff}. "
              f"Cakupan nyata hanya sampai {oldest}.", flush=True)

    path = write_output(args.out, rows, oldest, newest, result_count)

    tickers = {r["ticker"] for r in rows}
    print(f"\n[+] {len(rows)} pengumuman UMA, {len(tickers)} emiten unik", flush=True)
    print(f"[+] cakupan {oldest} .. {newest} ({pages_read} halaman dibaca)", flush=True)
    print(f"[+] tersimpan di {path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

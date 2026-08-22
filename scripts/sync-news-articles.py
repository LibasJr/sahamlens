#!/usr/bin/env python3
"""Ambil ISI artikel berita dan ekstrak teks bersihnya.

Masukan : berkas JSON berisi [{"url": ..., "title": ..., "source": ...}, ...]
Keluaran: data/news-articles/{hash}.json

KENAPA DAFTAR ARTIKELNYA DIBERIKAN DARI LUAR, BUKAN DIBACA SENDIRI
------------------------------------------------------------------
Daftar 14 feed RSS dan 50+ kata kunci filter market ada di
modules/news/service/news.service.ts. Menyalinnya ke sini berarti dua sumber
kebenaran yang PASTI menyimpang - satu ditambah sumber, yang lain lupa. Pembagian
tugasnya sama dengan sync-idx-financial-reports.py: Python mengerjakan yang mekanis
(unduh, ekstrak), TypeScript memegang logika bisnisnya (feed mana, relevan atau tidak).

KENAPA curl_cffi, BUKAN requests BIASA
--------------------------------------
Sebagian media Indonesia menolak klien tanpa fingerprint TLS browser. Diukur
2026-08-23: tribunnews.com dan investor.id membalas 403 ke urllib dan rss-parser,
tapi 200 ke curl_cffi impersonate="chrome124". Pustaka yang sama sudah dipakai tiga
scraper IDX di repo ini.

KENAPA trafilatura, BUKAN HEURISTIK SENDIRI
-------------------------------------------
Sudah dicoba: mengambil paragraf <p> yang panjangnya >= 80 karakter. Bersih untuk
Katadata dan Liputan6, GAGAL untuk CNBC, Detik, dan IDX Channel - menu navigasi
mereka juga memakai <p> panjang, jadi tidak bisa dibedakan lewat panjang teks.
Hasilnya tercemar "MAJOR INDEXES INDO-FX USD-FX" dan "CancelYang sedang ramai dicari".
trafilatura membersihkan kelimanya.

ZERO DUMMY
----------
Artikel yang gagal diambil atau ekstraksinya terlalu pendek TIDAK menghasilkan
berkas. Tidak ada teks placeholder, tidak ada ringkasan tebakan. Pemanggil melihat
ketiadaan artefak dan menanganinya sebagai "isi tidak tersedia", bukan sebagai isi
kosong yang terlihat sah.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time

try:
    from curl_cffi import requests
except ImportError:  # pragma: no cover - dependency guard
    print("[!] curl_cffi belum terpasang. Jalankan: pip install curl_cffi", file=sys.stderr)
    raise SystemExit(2)

try:
    import trafilatura
except ImportError:  # pragma: no cover - dependency guard
    print("[!] trafilatura belum terpasang. Jalankan: pip install --user trafilatura lxml_html_clean", file=sys.stderr)
    raise SystemExit(2)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT_DIR = os.path.join(REPO_ROOT, "data", "news-articles")

# Di bawah ini ekstraksi dianggap gagal, bukan "artikel pendek". Diukur 2026-08-23:
# artikel terpendek dari lima sumber utama 1.127 karakter, jadi 400 memberi ruang
# lapang tanpa meloloskan halaman error atau paywall stub.
MIN_TEXT_CHARS = 400


def artifact_name(url: str) -> str:
    """Nama berkas dari hash URL - judul tidak dipakai karena mengandung karakter
    yang tidak aman untuk path, dan bisa berubah setelah artikel diedit."""
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:20] + ".json"


def fetch_html(session, url: str, timeout: int, retries: int) -> str | None:
    for attempt in range(1, retries + 1):
        try:
            response = session.get(url, timeout=timeout)
        except Exception as exc:  # noqa: BLE001 - jaringan; dilaporkan lalu dicoba ulang
            print(f"    percobaan {attempt}/{retries} gagal: {type(exc).__name__}", file=sys.stderr)
            time.sleep(min(2 ** attempt, 10))
            continue
        if response.status_code == 200:
            return response.text
        print(f"    percobaan {attempt}/{retries} HTTP {response.status_code}", file=sys.stderr)
        time.sleep(min(2 ** attempt, 10))
    return None


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--urls-file", required=True, help='JSON [{"url","title","source"}]')
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR)
    parser.add_argument("--limit", type=int, default=10, help="0 = tanpa batas")
    parser.add_argument("--timeout", type=int, default=25)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--sleep", type=float, default=1.0, help="Jeda antar artikel (detik)")
    parser.add_argument("--force", action="store_true", help="Ambil ulang walau artefaknya sudah ada")
    args = parser.parse_args(argv)

    os.makedirs(args.out_dir, exist_ok=True)
    with open(args.urls_file, encoding="utf-8") as handle:
        items = json.load(handle)
    if args.limit:
        items = items[: args.limit]

    session = requests.Session(impersonate="chrome124")
    written = skipped = failed = short = 0

    for index, item in enumerate(items, start=1):
        url = str(item.get("url") or "").strip()
        if not url.startswith("http"):
            print(f"[{index}/{len(items)}] dilewati: url tidak sah", file=sys.stderr)
            failed += 1
            continue

        path = os.path.join(args.out_dir, artifact_name(url))
        # Isi artikel TIDAK berubah setelah terbit, jadi artefak yang sudah ada tidak
        # perlu diambil ulang. Ini yang membuat siklus berikutnya nyaris gratis.
        if os.path.exists(path) and not args.force:
            skipped += 1
            continue

        html = fetch_html(session, url, args.timeout, args.retries)
        if html is None:
            print(f"[{index}/{len(items)}] GAGAL ambil: {url}", file=sys.stderr)
            failed += 1
            continue

        text = trafilatura.extract(html, include_comments=False, include_tables=False) or ""
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) < MIN_TEXT_CHARS:
            print(f"[{index}/{len(items)}] teks cuma {len(text)} karakter, dianggap gagal: {url}", file=sys.stderr)
            short += 1
            continue

        artifact = {
            "schemaVersion": 1,
            "url": url,
            "title": item.get("title"),
            "source": item.get("source"),
            "pubDate": item.get("pubDate"),
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "charCount": len(text),
            "text": text,
        }
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(artifact, handle, ensure_ascii=False, indent=1)
        written += 1
        print(f"[{index}/{len(items)}] {item.get('source') or '-'}: {len(text)} karakter")
        time.sleep(args.sleep)

    print(f"\n[i] Selesai. ditulis={written} sudah_ada={skipped} gagal={failed} terlalu_pendek={short}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

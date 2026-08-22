#!/usr/bin/env python3
"""Sinkronisasi LAPORAN KEUANGAN KUARTALAN resmi BEI (XBRL), bukan Yahoo Finance.

Endpoint: https://www.idx.co.id/primary/ListedCompany/GetFinancialReport
Output  : data/idx-financial/{TICKER}-{YEAR}-{PERIOD}.json

KENAPA PYTHON + curl_cffi, BUKAN fetch() DI NEXT.JS
---------------------------------------------------
Alasan yang sama persis dengan sync-idx-foreign-flow.py / sync-idx-broker-summary.py:
idx.co.id berada di belakang Cloudflare yang memblokir klien tanpa TLS/JA3 fingerprint
browser (403). curl_cffi dengan impersonate="chrome124" meniru fingerprint itu. Endpoint
ini publik - tidak perlu akun, API key, atau kredensial apa pun.

PEMBAGIAN TUGAS DENGAN LAPISAN TYPESCRIPT
-----------------------------------------
Skrip ini SENGAJA hanya melakukan pekerjaan mekanis: unduh, buka zip, tarik fakta XBRL
apa adanya ke JSON. Pemetaan taksonomi -> field SahamLens (mana yang "revenue", mana yang
"ekuitas", dan bedanya bank vs non-bank) adalah LOGIKA BISNIS dan tinggal di
modules/fundamental/service/idx-xbrl.service.ts supaya bisa diuji dengan vitest seperti
sisa aplikasi. Pola ini sama dengan foreign-flow: Python menulis artefak, TS menafsirkan.

HANYA FAKTA TANPA DIMENSI YANG DISIMPAN
---------------------------------------
Terukur pada BBCA TW1 2026: 1205 konteks, hanya 7 di antaranya tanpa dimensi
(CurrentYearInstant, PriorEndYearInstant, CurrentYearDuration, PriorYearDuration,
PriorYearInstant, Prior2YearsInstant, PriorEndYearDuration). 1198 sisanya adalah rincian
berdimensi - pergerakan aset tetap per kategori, borrowings per mata uang, dst. Untuk
fundamental yang dipakai SahamLens, yang dibutuhkan adalah angka utama laporan, bukan
rincian itu: 3113 fakta menyusut jadi 900 (479 tag unik). Jumlah yang dibuang TIDAK
disembunyikan - ia dicatat sebagai `dimensionalFactsSkipped` di setiap artefak.

NILAI DISIMPAN SEBAGAI STRING, BUKAN NUMBER
-------------------------------------------
Angka rupiah dalam satuan penuh mendekati batas presisi JS: total aset BBCA TW1 2026 =
1.640.830.566.000.000 (1,64e15), sementara Number.MAX_SAFE_INTEGER = 9,007e15 - hanya
~5,5x ruang tersisa, dan penjumlahan lintas emiten/periode bisa melewatinya. String
menjaga angka aslinya utuh; konversi + penjagaan Number.isFinite dilakukan di TS.

ZERO DUMMY
----------
Tidak ada nilai default, interpolasi, atau tebakan. Emiten yang belum melaporkan tidak
menghasilkan berkas sama sekali (bukan berkas berisi nol). Lampiran yang tidak punya
instance.zip dilewati dan dilaporkan, bukan ditambal dari sumber lain.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import time
import zipfile
from datetime import datetime, timezone

try:
    from curl_cffi import requests
except ImportError:  # pragma: no cover
    print("[!] curl_cffi belum terpasang. Jalankan: pip install curl_cffi", file=sys.stderr)
    raise SystemExit(2)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = "https://www.idx.co.id"
LIST_ENDPOINT = f"{HOST}/primary/ListedCompany/GetFinancialReport"
DEFAULT_OUT_DIR = os.path.join(ROOT, "data", "idx-financial")

SCHEMA_VERSION = 1
VALID_PERIODS = ("tw1", "tw2", "tw3", "audit")
TICKER_PATTERN = re.compile(r"^[A-Z]{4}$")

# Konteks XBRL yang tidak berdimensi selalu punya id bernama seperti ini di taksonomi
# IDX. Deteksinya tetap struktural (ada/tidaknya explicitMember), daftar ini hanya
# dipakai untuk memeriksa asumsi itu tidak berubah diam-diam.
EXPECTED_PLAIN_CONTEXTS = {
    "CurrentYearInstant", "PriorEndYearInstant", "CurrentYearDuration",
    "PriorYearDuration", "PriorYearInstant", "Prior2YearsInstant",
    "PriorEndYearDuration",
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch_report_list(
    session,
    year: int,
    periode: str,
    kode: str,
    page_size: int,
    timeout: int,
    retries: int = 3,
) -> list[dict]:
    """Daftar emiten yang SUDAH melaporkan pada periode itu. Paginasi diikuti sampai habis.

    RETRY WAJIB DI SINI, BUKAN CUMA DI UNDUHAN. Cloudflare idx.co.id membalas 403 sesaat
    kalau endpoint ini dipanggil beruntun - teramati tiga kali pada 2026-08-22 saat
    menyinkronkan seluruh pasar, dan tiap kali pulih sendiri dalam hitungan detik.
    Sebelumnya satu 403 langsung melempar dan MEMBATALKAN seluruh sinkronisasi, termasuk
    periode yang sebenarnya baik-baik saja. Untuk cron tak berpenunggu itu berarti job
    dilaporkan gagal karena gangguan yang bahkan tidak bertahan semenit.

    Backoff-nya sama persis dengan download_instance(): 2^percobaan, dibatasi 10 detik.
    """
    out: list[dict] = []
    index_from = 0
    while True:
        params = {
            "indexFrom": index_from,
            "pageSize": page_size,
            "year": year,
            "reportType": "rdf",
            "EmitenType": "s",
            "periode": periode,
            "kodeEmiten": kode,
            "SortColumn": "KodeEmiten",
            "SortOrder": "asc",
        }
        payload = None
        for attempt in range(1, retries + 1):
            try:
                response = session.get(LIST_ENDPOINT, params=params, timeout=timeout)
            except Exception as exc:  # noqa: BLE001 - jaringan; dilaporkan lalu dicoba ulang
                print(f"    daftar percobaan {attempt}/{retries} gagal: {type(exc).__name__}", file=sys.stderr)
                time.sleep(min(2 ** attempt, 10))
                continue
            if response.status_code == 200:
                payload = response.json()
                break
            print(f"    daftar percobaan {attempt}/{retries} HTTP {response.status_code}", file=sys.stderr)
            time.sleep(min(2 ** attempt, 10))
        if payload is None:
            raise RuntimeError(f"GetFinancialReport gagal setelah {retries} percobaan")
        results = payload.get("Results") or []
        if not results:
            break
        out.extend(results)
        total = payload.get("ResultCount")
        if not isinstance(total, int) or len(out) >= total or len(results) < page_size:
            break
        index_from += page_size
    return out


def instance_attachment(entry: dict) -> dict | None:
    for att in entry.get("Attachments") or []:
        name = str(att.get("File_Name") or "").lower()
        if name == "instance.zip":
            return att
    return None


def parse_contexts(raw: str) -> tuple[dict[str, dict], set[str]]:
    """Konteks TANPA dimensi saja. Yang mengandung explicitMember adalah rincian
    berdimensi dan sengaja tidak dibawa (lihat catatan modul)."""
    contexts: dict[str, dict] = {}
    dimensional: set[str] = set()
    for cid, body in re.findall(r'<context id="([^"]+)">(.*?)</context>', raw, re.S):
        if "explicitMember" in body:
            dimensional.add(cid)
            continue
        instant = re.search(r"<instant>([\d-]+)</instant>", body)
        start = re.search(r"<startDate>([\d-]+)</startDate>", body)
        end = re.search(r"<endDate>([\d-]+)</endDate>", body)
        entry: dict[str, str] = {}
        if instant:
            entry["instant"] = instant.group(1)
        if start:
            entry["startDate"] = start.group(1)
        if end:
            entry["endDate"] = end.group(1)
        if entry:
            contexts[cid] = entry
    return contexts, dimensional


def parse_facts(raw: str, plain_context_ids: set[str]) -> tuple[dict[str, dict[str, str]], int]:
    """`{tag: {contextId: nilai_mentah}}`. Nilai tetap string - lihat catatan modul."""
    facts: dict[str, dict[str, str]] = {}
    skipped = 0
    for tag, ctx, value in re.findall(
        r'<(idx-[\w-]+:[A-Za-z0-9_]+)\s+[^>]*contextRef="([^"]+)"[^>]*>([^<]*)</', raw
    ):
        if ctx not in plain_context_ids:
            skipped += 1
            continue
        text = value.strip()
        if not text:
            continue
        facts.setdefault(tag, {})[ctx] = text
    return facts, skipped


def download_instance(session, file_path: str, timeout: int, retries: int) -> bytes | None:
    url = HOST + str(file_path).replace(" ", "%20")
    for attempt in range(1, retries + 1):
        try:
            response = session.get(url, timeout=timeout)
        except Exception as exc:  # noqa: BLE001 - jaringan; dilaporkan lalu dicoba ulang
            print(f"    percobaan {attempt}/{retries} gagal: {type(exc).__name__}", file=sys.stderr)
            time.sleep(min(2 ** attempt, 10))
            continue
        if response.status_code == 200:
            return response.content
        print(f"    percobaan {attempt}/{retries} HTTP {response.status_code}", file=sys.stderr)
        time.sleep(min(2 ** attempt, 10))
    return None


def build_artifact(entry: dict, blob: bytes, source_url: str) -> dict | None:
    try:
        archive = zipfile.ZipFile(io.BytesIO(blob))
    except zipfile.BadZipFile:
        return None
    name = next((n for n in archive.namelist() if n.lower().endswith(".xbrl")), None)
    if not name:
        return None
    raw = archive.read(name).decode("utf-8", errors="replace")

    contexts, dimensional = parse_contexts(raw)
    facts, skipped = parse_facts(raw, set(contexts.keys()))
    if not facts:
        return None

    unexpected = sorted(set(contexts.keys()) - EXPECTED_PLAIN_CONTEXTS)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "ticker": str(entry.get("KodeEmiten") or "").strip().upper(),
        "entityName": entry.get("NamaEmiten"),
        "year": int(entry.get("Report_Year")),
        "period": str(entry.get("Report_Period") or "").strip().upper(),
        "fileModified": entry.get("File_Modified"),
        "fetchedAt": utc_now_iso(),
        "sourceUrl": source_url,
        "contexts": contexts,
        "facts": facts,
        # Transparansi apa yang TIDAK dibawa - supaya penyusutan 3113 -> 900 tidak pernah
        # terbaca sebagai "laporannya memang cuma segini".
        "dimensionalContextCount": len(dimensional),
        "dimensionalFactsSkipped": skipped,
        # Kalau taksonomi IDX menambah konteks non-dimensi baru, ia muncul di sini alih-alih
        # ikut terbawa diam-diam tanpa ada yang tahu artinya.
        "unexpectedPlainContexts": unexpected,
    }


def artifact_path(out_dir: str, ticker: str, year: int, period: str) -> str:
    return os.path.join(out_dir, f"{ticker}-{year}-{period}.json")


def existing_file_modified(path: str) -> str | None:
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle).get("fileModified")
    except (OSError, ValueError):
        return None


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--period", choices=VALID_PERIODS, required=True)
    parser.add_argument("--ticker", default="", help="Batasi ke satu emiten (kosong = seluruh pasar)")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR)
    parser.add_argument("--limit", type=int, default=0, help="0 = tanpa batas")
    parser.add_argument("--force", action="store_true", help="Unduh ulang walau File_Modified tidak berubah")
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--sleep", type=float, default=0.4, help="Jeda antar emiten (detik)")
    parser.add_argument("--page-size", type=int, default=200)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    os.makedirs(args.out_dir, exist_ok=True)
    session = requests.Session(impersonate="chrome124")

    print(f"[i] Daftar laporan {args.year} {args.period.upper()}...")
    try:
        entries = fetch_report_list(
            session, args.year, args.period, args.ticker.upper(), args.page_size, args.timeout, args.retries
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[!] Gagal mengambil daftar: {exc}", file=sys.stderr)
        return 1

    print(f"[i] {len(entries)} emiten sudah melaporkan.")
    if args.limit > 0:
        entries = entries[: args.limit]
        print(f"[i] Dibatasi ke {len(entries)} emiten (--limit).")

    written = skipped_unchanged = failed = no_instance = 0
    for i, entry in enumerate(entries, 1):
        ticker = str(entry.get("KodeEmiten") or "").strip().upper()
        if not TICKER_PATTERN.match(ticker):
            print(f"[{i}/{len(entries)}] lewat: kode emiten tidak wajar ({ticker!r})")
            continue

        period = str(entry.get("Report_Period") or "").strip().upper()
        path = artifact_path(args.out_dir, ticker, args.year, period)
        remote_modified = entry.get("File_Modified")

        if not args.force and remote_modified and existing_file_modified(path) == remote_modified:
            skipped_unchanged += 1
            continue

        att = instance_attachment(entry)
        if not att or not att.get("File_Path"):
            print(f"[{i}/{len(entries)}] {ticker}: tidak ada instance.zip (hanya PDF/xlsx) - dilewati")
            no_instance += 1
            continue

        blob = download_instance(session, att["File_Path"], args.timeout, args.retries)
        if blob is None:
            print(f"[{i}/{len(entries)}] {ticker}: unduh instance.zip GAGAL")
            failed += 1
            continue

        artifact = build_artifact(entry, blob, HOST + str(att["File_Path"]).replace(" ", "%20"))
        if artifact is None:
            print(f"[{i}/{len(entries)}] {ticker}: instance.zip tidak bisa di-parse - dilewati")
            failed += 1
            continue

        tmp = f"{path}.tmp"
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(artifact, handle, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, path)
        written += 1
        print(f"[{i}/{len(entries)}] {ticker}: {len(artifact['facts'])} tag tersimpan "
              f"(dibuang berdimensi: {artifact['dimensionalFactsSkipped']})")
        time.sleep(args.sleep)

    print(
        f"\n[i] Selesai. ditulis={written} tidak_berubah={skipped_unchanged} "
        f"tanpa_instance={no_instance} gagal={failed}"
    )
    # Gagal sebagian TIDAK menggagalkan job: emiten yang berhasil tetap punya artefak
    # jujur, dan yang gagal tidak meninggalkan berkas setengah jadi (tulis lewat .tmp
    # lalu os.replace yang atomik).
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

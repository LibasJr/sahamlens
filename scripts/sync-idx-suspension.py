#!/usr/bin/env python3
"""Sinkronisasi pengumuman suspensi/pembukaan perdagangan resmi Bursa Efek Indonesia.

Endpoint: https://www.idx.co.id/primary/NewsAnnouncement/GetSuspension?indexFrom={N}&pageSize={M}

Kenapa Python + curl_cffi: sama dengan sync-idx-uma.py dan sync-idx-foreign-flow.py -
idx.co.id menolak klien tanpa TLS/JA3 fingerprint browser.

Output: data/idx-suspension/suspension-index.json - dibaca server-side sebagai bagian
gerbang TRADING_RESTRICTIONS pada ARA scanner.

NAMA ENDPOINT ITU PENTING
-------------------------
`GetSuspensionActivity` membalas HTTP 503 dari Varnish, dan 503 itu SANGAT mudah
disalahartikan sebagai "server BEI sedang sakit" atau "Cloudflare memblokir". Keduanya
salah: nama path-nya yang tidak ada. `GetSuspension` (tanpa "Activity") membalas 200
dengan sesi dan impersonate yang sama persis. Diuji 2026-09-05.

INI ALIRAN PERISTIWA, BUKAN DAFTAR EMITEN TERSUSPENSI
-----------------------------------------------------
Isinya berimbang antara dua tipe (diukur 2026-09-05 pada 500 baris: SPT 251, UPT 249):

    SPT = Penghentian Sementara Perdagangan Efek  (suspensi dimulai)
    UPT = Pembukaan Penghentian Sementara         (suspensi dicabut)

Jadi kehadiran sebuah emiten di feed ini TIDAK berarti ia sedang disuspensi. Status
sekarang = peristiwa TERAKHIR menurut waktu. Membaca feed ini sebagai daftar
"sedang disuspensi" menghasilkan dua kegagalan sekaligus: emiten yang sudah dibuka
kembali diblokir selamanya, dan - jauh lebih berbahaya - urutan yang salah bisa
membuat emiten yang masih disuspensi tampak aman.

BARIS ">1 Kode" TIDAK BOLEH DIABAIKAN
-------------------------------------
3,2% baris (diukur pada 500 baris) memuat Kode = ">1 Kode": satu pengumuman untuk
banyak emiten sekaligus, dan kode aslinya hanya ada di dalam PDF lampiran. Skrip ini
TIDAK membuangnya diam-diam. Baris seperti itu dicatat di `unresolved` beserta
tanggalnya, supaya konsumen bisa memperlakukan emiten yang berpotensi tersentuh
sebagai TIDAK DIKETAHUI - bukan bersih. Membuangnya berarti membuka celah 3,2% tanpa
ada yang memerah.

Hal yang sama berlaku untuk Info_Type di luar SPT/UPT: tidak ditebak, tapi dicatat
sebagai unresolved.

ZERO DUMMY: kalau pengambilan gagal, berkas lama TIDAK ditimpa. Data basi yang jujur
lebih baik daripada data baru yang bolong.

Contoh:
    python scripts/sync-idx-suspension.py                    # 120 hari terakhir
    python scripts/sync-idx-suspension.py --lookback-days 30
    python scripts/sync-idx-suspension.py --out /tmp/coba    # uji tanpa menyentuh produksi
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone

try:
    from curl_cffi import requests
except ImportError:  # pragma: no cover - dependency guard
    print("[!] curl_cffi belum terpasang. Jalankan: pip install curl_cffi", file=sys.stderr)
    raise SystemExit(2)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT_DIR = os.path.join(REPO_ROOT, "data", "idx-suspension")
EMITEN_CSV = os.path.join(REPO_ROOT, "idx_emiten_900.csv")

IDX_ENDPOINT = "https://www.idx.co.id/primary/NewsAnnouncement/GetSuspension"
SOURCE_LABEL = "IDX_OFFICIAL_API"

TICKER_RE = re.compile(r"^[A-Z]{4}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# SPT membuka suspensi, UPT menutupnya. Tipe lain sengaja TIDAK dipetakan - lihat
# docstring: menebak arti tipe yang tidak dikenal adalah cara paling halus untuk
# membuat gerbang keselamatan berbohong.
SUSPEND_TYPE = "SPT"
UNSUSPEND_TYPE = "UPT"
KNOWN_TYPES = {SUSPEND_TYPE, UNSUSPEND_TYPE}

PAGE_SIZE = 100
MAX_PAGES = 60


def normalize_datetime(raw) -> tuple[str, str] | None:
    """'2026-09-03T09:40:52' -> ('2026-09-03', '2026-09-03T09:40:52').

    Waktu dipertahankan karena urutan peristiwa menentukan status: dua pengumuman
    untuk emiten yang sama bisa jatuh pada hari yang sama (SPT pagi, UPT siang).
    Membandingkan tanggal saja membuat urutannya bergantung kebetulan.
    """
    if not raw:
        return None
    text = str(raw).strip()
    day = text[:10]
    if not DATE_RE.match(day):
        return None
    try:
        datetime.strptime(day, "%Y-%m-%d")
    except ValueError:
        return None
    stamp = text[:19] if len(text) >= 19 and text[10] in "T " else f"{day}T00:00:00"
    return day, stamp.replace(" ", "T")


def make_event_id(day: str, code: str, info_type: str, title: str, attachment: str) -> str:
    """Bikin ID stabil: endpoint ini tidak menyediakan ID sendiri.

    Dipakai untuk dedup antar-halaman. Lampiran ikut di-hash karena dua pengumuman
    berbeda pada hari yang sama untuk emiten yang sama memang mungkin terjadi.
    """
    material = f"{day}|{code}|{info_type}|{title}|{attachment}".encode("utf-8")
    return hashlib.sha1(material).hexdigest()[:16]


def normalize_rows(results: list[dict]) -> tuple[list[dict], list[dict]]:
    """Pisahkan baris jadi (peristiwa ber-emiten, baris yang tidak terselesaikan).

    Baris masuk `unresolved` - bukan dibuang - kalau kodenya bukan satu emiten
    (mis. '>1 Kode') atau Info_Type-nya di luar SPT/UPT.
    """
    events: list[dict] = []
    unresolved: list[dict] = []

    for item in results:
        stamp = normalize_datetime(item.get("Date"))
        if stamp is None:
            continue  # tanpa tanggal sah, baris tidak bisa diurutkan sama sekali
        day, when = stamp

        raw_code = str(item.get("Kode") or "").strip()
        code = raw_code.upper()
        info_type = str(item.get("Info_Type") or "").strip().upper()
        title = str(item.get("Judul") or "").strip()
        attachment = str(item.get("Data_Download") or "").strip()

        record = {
            "eventId": make_event_id(day, raw_code, info_type, title, attachment),
            "date": day,
            "occurredAt": when,
            "infoType": info_type or None,
            "title": title or None,
            "attachment": attachment or None,
        }

        if not TICKER_RE.match(code) or info_type not in KNOWN_TYPES:
            record["rawCode"] = raw_code or None
            record["reason"] = (
                "kode bukan emiten tunggal" if not TICKER_RE.match(code)
                else f"Info_Type tidak dikenal: {info_type or '(kosong)'}"
            )
            unresolved.append(record)
            continue

        record["ticker"] = code
        record["suspended"] = info_type == SUSPEND_TYPE
        events.append(record)

    return events, unresolved


def load_ticker_universe(csv_path: str = EMITEN_CSV) -> set[str]:
    """Baca universe emiten SahamLens; cegah POJK/VIII dari regex PDF mentah."""
    tickers: set[str] = set()
    with open(csv_path, "r", encoding="utf-8") as handle:
        for index, line in enumerate(handle):
            if index == 0:
                continue
            parts = line.split(",")
            if len(parts) >= 2:
                code = parts[1].strip().upper()
                if TICKER_RE.match(code):
                    tickers.add(code)
    if len(tickers) < 800:
        raise RuntimeError(f"Universe emiten terlalu kecil ({len(tickers)}); PDF tidak boleh diparse.")
    return tickers


def extract_tickers_from_pdf(session, attachment: str, universe: set[str],
                             retries: int, timeout: int) -> tuple[list[str], str | None]:
    """Unduh PDF resmi dan iriskan token 4 huruf dengan universe emiten.

    Tidak memakai allowlist pengecualian (POJK, VIII, dst.) karena daftar kata palsu
    tidak pernah lengkap. Universe emiten adalah validasi positif. Bila PDF gagal,
    terenkripsi, tak punya text layer, atau tidak menghasilkan ticker, pemanggil
    harus mempertahankan baris sebagai unresolved.
    """
    if not attachment or not attachment.startswith("/StaticData/"):
        return [], "lampiran PDF tidak sah"
    pdftotext = shutil.which("pdftotext")
    if not pdftotext:
        return [], "pdftotext tidak terpasang"

    url = f"https://www.idx.co.id{attachment}"
    content = None
    for attempt in range(1, retries + 1):
        try:
            response = session.get(url, timeout=timeout)
            if response.status_code == 200 and response.content.startswith(b"%PDF"):
                content = response.content
                break
        except Exception:
            pass
        time.sleep(attempt * 1.5)
    if content is None:
        return [], "gagal mengunduh PDF resmi"

    with tempfile.TemporaryDirectory(prefix="idx-susp-") as temp:
        pdf_path = os.path.join(temp, "announcement.pdf")
        text_path = os.path.join(temp, "announcement.txt")
        with open(pdf_path, "wb") as handle:
            handle.write(content)
        result = subprocess.run(
            [pdftotext, "-layout", pdf_path, text_path],
            capture_output=True, text=True, timeout=timeout, check=False,
        )
        if result.returncode != 0 or not os.path.exists(text_path):
            return [], "pdftotext gagal"
        with open(text_path, "r", encoding="utf-8", errors="replace") as handle:
            text = handle.read()

    candidates = set(re.findall(r"(?<![A-Z])[A-Z]{4}(?![A-Z])", text.upper()))
    tickers = sorted(candidates & universe)
    if not tickers:
        return [], "PDF tidak menghasilkan kode emiten terverifikasi"
    return tickers, None


def resolve_multi_ticker_rows(session, events: list[dict], unresolved: list[dict],
                              universe: set[str], retries: int, timeout: int):
    """Ubah setiap baris '>1 Kode' menjadi satu peristiwa per emiten dari PDF."""
    resolved_events = list(events)
    still_unresolved: list[dict] = []
    pdf_rows = 0
    extracted_codes = 0

    for row in unresolved:
        if row.get("rawCode") != ">1 Kode" or row.get("infoType") not in KNOWN_TYPES:
            still_unresolved.append(row)
            continue

        tickers, error = extract_tickers_from_pdf(
            session, row.get("attachment") or "", universe, retries, timeout,
        )
        if error:
            failed = dict(row)
            failed["reason"] = f"{row.get('reason')}; {error}"
            still_unresolved.append(failed)
            continue

        pdf_rows += 1
        extracted_codes += len(tickers)
        for ticker in tickers:
            event = {k: v for k, v in row.items() if k not in {"rawCode", "reason"}}
            event["eventId"] = make_event_id(
                row["date"], ticker, row["infoType"], row.get("title") or "",
                row.get("attachment") or "",
            )
            event["ticker"] = ticker
            event["suspended"] = row["infoType"] == SUSPEND_TYPE
            event["extractedFromPdf"] = True
            resolved_events.append(event)

    return resolved_events, still_unresolved, pdf_rows, extracted_codes


def fetch_page(session, page_number: int, page_size: int, retries: int, timeout: int):
    """Ambil satu halaman. results=None berarti gagal total setelah semua percobaan.

    `indexFrom` adalah NOMOR HALAMAN, bukan offset baris - jebakan yang sama dengan
    GetUMA, dan yang pernah membuat versi pertama sync UMA berhenti di halaman satu
    sambil melapor sukses.
    """
    url = f"{IDX_ENDPOINT}?indexFrom={page_number}&pageSize={page_size}&lang=id"
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

        results = payload.get("Results")
        if not isinstance(results, list):
            return [], None
        return results, payload.get("ResultCount")
    return None, None


def build_statuses(events: list[dict], unresolved: list[dict]) -> dict[str, dict]:
    """Turunkan status terkini per emiten dari peristiwa terakhirnya.

    KETIDAKPASTIAN ITU BERARAH, DAN ARAHNYA PENTING
    -----------------------------------------------
    Versi pertama fungsi ini menandai emiten tidak pasti kalau ada baris unresolved
    mana pun setelah peristiwa terakhirnya. Hasilnya diukur pada data nyata: 54 dari
    54 emiten tidak pasti - flag yang selalu bernilai sama tidak memberi informasi
    apa pun dan akan diabaikan orang dalam seminggu.

    Yang benar: baris unresolved hanya relevan kalau ia bisa MENGUBAH status.

        emiten ACTIVE    + unresolved SPT sesudahnya -> mungkin sedang disuspensi
        emiten SUSPENDED + unresolved UPT sesudahnya -> mungkin sudah dibuka

    Sebaliknya, unresolved UPT tidak bisa membuat emiten yang sudah ACTIVE jadi
    tersuspensi, jadi ia tidak perlu meracuni status itu.

    Perhatikan bahwa dua arah ini TIDAK setara bagi gerbang keselamatan:
    ACTIVE-yang-ternyata-suspensi berbahaya (sinyal beli untuk efek yang tidak bisa
    diperdagangkan), sedangkan SUSPENDED-yang-ternyata-sudah-dibuka hanya membuat
    kita terlalu berhati-hati. Keduanya tetap ditandai, tapi `uncertainDirection`
    membedakannya supaya konsumen bisa memilih sikap.
    """
    latest_spt = max((u["occurredAt"] for u in unresolved if u.get("infoType") == SUSPEND_TYPE),
                     default=None)
    latest_upt = max((u["occurredAt"] for u in unresolved if u.get("infoType") == UNSUSPEND_TYPE),
                     default=None)

    statuses: dict[str, dict] = {}
    for event in sorted(events, key=lambda e: (e["occurredAt"], e["eventId"])):
        statuses[event["ticker"]] = {
            "status": "SUSPENDED" if event["suspended"] else "ACTIVE",
            "asOf": event["date"],
            "occurredAt": event["occurredAt"],
            "infoType": event["infoType"],
        }

    counts: dict[str, int] = {}
    for event in events:
        counts[event["ticker"]] = counts.get(event["ticker"], 0) + 1

    for ticker, state in statuses.items():
        state["eventCount"] = counts.get(ticker, 0)

        # Hanya baris yang bisa membalik status yang membuat emiten tidak pasti.
        if state["status"] == "ACTIVE":
            threat = latest_spt
            direction = "MUNGKIN_DISUSPENSI"
        else:
            threat = latest_upt
            direction = "MUNGKIN_SUDAH_DIBUKA"

        uncertain = threat is not None and threat > state["occurredAt"]
        state["certain"] = not uncertain
        state["uncertainDirection"] = direction if uncertain else None
        state["uncertainSince"] = threat if uncertain else None

    return dict(sorted(statuses.items()))


def write_output(out_dir: str, events, unresolved, statuses, oldest, newest, result_count) -> str:
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "suspension-index.json")

    suspended = sorted(t for t, s in statuses.items() if s["status"] == "SUSPENDED")

    document = {
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": SOURCE_LABEL,
        "endpoint": IDX_ENDPOINT,
        # Rentang yang BENAR-BENAR tercakup. Emiten tanpa peristiwa di rentang ini
        # berarti TIDAK DIKETAHUI, bukan aktif - konsumen wajib membedakannya.
        "coverageFrom": oldest,
        "coverageTo": newest,
        "totalAnnouncementsUpstream": result_count,
        "count": len(events),
        "unresolvedCount": len(unresolved),
        "tickerCount": len(statuses),
        "suspendedCount": len(suspended),
        "suspendedTickers": suspended,
        "statuses": statuses,
        "events": events,
        "unresolved": unresolved,
    }
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(document, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    return path


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sinkronisasi pengumuman suspensi/pembukaan resmi BEI untuk gerbang ARA."
    )
    parser.add_argument("--lookback-days", type=int, default=120,
                        help="Ambil peristiwa sampai N hari ke belakang (default 120).")
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

    print(f"[+] Sinkronisasi suspensi sejak {cutoff}, sumber {SOURCE_LABEL}", flush=True)

    events: dict[str, dict] = {}
    unresolved: dict[str, dict] = {}
    result_count = None
    reached_cutoff = False
    pages_read = 0

    for page in range(1, MAX_PAGES + 1):
        print(f"[halaman {page}]", flush=True)

        results, count = fetch_page(session, page, args.page_size, args.retries, args.timeout)
        if results is None:
            print("[!] Pengambilan gagal setelah semua percobaan. Berkas lama TIDAK ditimpa.",
                  file=sys.stderr)
            return 1
        if count is not None:
            result_count = count
        if not results:
            print("    halaman kosong - berhenti", flush=True)
            break

        pages_read += 1
        page_events, page_unresolved = normalize_rows(results)
        for row in page_events:
            events[row["eventId"]] = row
        for row in page_unresolved:
            unresolved[row["eventId"]] = row

        dropped = len(results) - len(page_events) - len(page_unresolved)
        if dropped:
            print(f"    {dropped} baris dibuang (tanggal tidak sah)", flush=True)
        if page_unresolved:
            print(f"    {len(page_unresolved)} baris tidak terselesaikan (dicatat, tidak dibuang)",
                  flush=True)

        days = [r["date"] for r in page_events] + [r["date"] for r in page_unresolved]
        oldest_in_page = min(days, default=None)
        print(f"    {len(page_events)} peristiwa, tertua {oldest_in_page}", flush=True)

        if oldest_in_page and oldest_in_page < cutoff:
            reached_cutoff = True
            print("    sudah melewati cutoff - berhenti", flush=True)
            break

        time.sleep(args.sleep)

    kept_events = sorted(
        (e for e in events.values() if e["date"] >= cutoff),
        key=lambda e: (e["occurredAt"], e["eventId"]), reverse=True,
    )
    kept_unresolved = sorted(
        (u for u in unresolved.values() if u["date"] >= cutoff),
        key=lambda u: (u["occurredAt"], u["eventId"]), reverse=True,
    )

    try:
        universe = load_ticker_universe()
    except Exception as error:
        print(f"[!] Universe emiten gagal dibaca: {error}. Berkas lama TIDAK ditimpa.",
              file=sys.stderr)
        return 1

    kept_events, kept_unresolved, resolved_pdf_rows, extracted_codes = resolve_multi_ticker_rows(
        session, kept_events, kept_unresolved, universe, args.retries, args.timeout,
    )
    # Satu emiten dapat muncul dari baris tunggal API sekaligus PDF multi-emiten.
    # Dedup ulang setelah ekspansi supaya eventCount tidak menggembung diam-diam.
    kept_events = sorted(
        {event["eventId"]: event for event in kept_events}.values(),
        key=lambda e: (e["occurredAt"], e["eventId"]), reverse=True,
    )
    kept_unresolved = sorted(
        kept_unresolved,
        key=lambda u: (u["occurredAt"], u["eventId"]), reverse=True,
    )
    print(f"[+] PDF multi-emiten: {resolved_pdf_rows} baris terurai menjadi "
          f"{extracted_codes} kode terverifikasi", flush=True)

    if not kept_events:
        print(f"[!] Tidak ada peristiwa suspensi sah dalam {args.lookback_days} hari terakhir. "
              "Berkas TIDAK ditulis.", file=sys.stderr)
        return 1

    all_days = [e["date"] for e in kept_events] + [u["date"] for u in kept_unresolved]
    newest = max(all_days)
    oldest = min(all_days)

    if not reached_cutoff:
        print(f"[!] Paginasi habis sebelum mencapai cutoff {cutoff}. "
              f"Cakupan nyata hanya sampai {oldest}.", flush=True)

    statuses = build_statuses(kept_events, kept_unresolved)
    path = write_output(args.out, kept_events, kept_unresolved, statuses,
                        oldest, newest, result_count)

    suspended = sum(1 for s in statuses.values() if s["status"] == "SUSPENDED")
    uncertain = sum(1 for s in statuses.values() if not s["certain"])
    risky = sum(1 for s in statuses.values() if s["uncertainDirection"] == "MUNGKIN_DISUSPENSI")
    print(f"\n[+] {len(kept_events)} peristiwa, {len(statuses)} emiten unik", flush=True)
    print(f"[+] {suspended} sedang disuspensi, {len(statuses) - suspended} sudah dibuka", flush=True)
    print(f"[+] {len(kept_unresolved)} baris tidak terselesaikan -> {uncertain} emiten tidak pasti "
          f"({risky} di antaranya berpotensi disuspensi tanpa kita tahu)", flush=True)
    print(f"[+] cakupan {oldest} .. {newest} ({pages_read} halaman dibaca)", flush=True)
    print(f"[+] tersimpan di {path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

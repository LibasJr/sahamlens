#!/usr/bin/env python3
"""Sinkronkan jadwal RUPS resmi KSEI tanpa menebak atau menghapus snapshot valid.

KSEI peka huruf besar-kecil: daftar memakai Year/Month. Snapshot disimpan per
bulan; dokumen yang sudah diproses tidak diunduh ulang. Artifact gabungan ditulis
atomik hanya setelah semua bulan target memiliki snapshot yang dapat dibaca.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import html
import json
import os
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://web.ksei.co.id"
LIST_PATH = "/publications/corporate-action-schedules/meeting-announcement"
UA = "SahamLens-KSEI-Calendar/1.0 (+https://sahamlens.id)"
ROW_RE = re.compile(r'<tr>\s*<td[^>]*>\s*<a href="([^"]+file=[^"]+)"[^>]*>.*?</a>\s*</td>\s*<td>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>', re.S | re.I)
DATE_RE = re.compile(r'(?:tanggal|pada)\s+(\d{2})[./-](\d{2})[./-](\d{4})(?:\s*,?\s*(?:pukul|jam)\s*(\d{1,2})[:.]?(\d{2})?)?', re.I)
TICKER_RE = re.compile(r'\(([A-Z]{4})(?:1)?\)')


def get(url: str, retries: int = 3) -> tuple[bytes, str]:
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "id-ID,id;q=0.9"})
    error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return response.read(), response.geturl()
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            error = exc
            if attempt < retries:
                time.sleep(attempt * 2)
    raise RuntimeError(f"gagal mengambil sumber resmi setelah {retries} percobaan: {error}")


def atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    os.replace(temporary, path)


def strip_tags(value: str) -> str:
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', value))).strip()


def pdf_text(payload: bytes) -> str:
    if not payload.startswith(b"%PDF"):
        raise ValueError("respons dokumen bukan PDF")
    with tempfile.TemporaryDirectory() as directory:
        pdf, txt = Path(directory) / "document.pdf", Path(directory) / "document.txt"
        pdf.write_bytes(payload)
        subprocess.run(["pdftotext", "-layout", str(pdf), str(txt)], check=True, timeout=30, capture_output=True)
        return txt.read_text(errors="replace")


def file_id(url: str) -> str:
    return urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get("file", [""])[0]


def parse_document(text: str, document_id: str, source_url: str, published_at: str, digest: str) -> dict:
    ticker_match, date_match = TICKER_RE.search(text), DATE_RE.search(text)
    if not ticker_match or not date_match:
        raise ValueError("ticker atau tanggal rapat tidak ditemukan secara eksplisit")
    day, month, year, hour, minute = date_match.groups()
    date = dt.date(int(year), int(month), int(day))
    kind = "RUPSLB" if re.search(r'Rapat Umum Pemegang Saham Luar Biasa|RUPSLB', text, re.I) else "RUPS"
    ticker = ticker_match.group(1)
    return {
        "id": f"KSEI:{document_id}", "symbol": ticker, "type": kind,
        "date": date.isoformat(), "timeWib": f"{int(hour):02d}:{int(minute or 0):02d}" if hour else None,
        "title": f"{kind} {ticker}", "description": f"Jadwal {kind} resmi yang diumumkan melalui KSEI.",
        "source": "KSEI_OFFICIAL", "sourceUrl": source_url, "publishedAt": published_at,
        "documentSha256": digest, "verification": "VERIFIED_PRIMARY_SOURCE",
    }


def fetch_document(item: dict) -> tuple[dict | None, dict | None]:
    try:
        payload, final_url = get(item["url"])
        digest = hashlib.sha256(payload).hexdigest()
        return parse_document(pdf_text(payload), item["id"], final_url, item["publishedAt"], digest), None
    except Exception as exc:
        return None, {"id": item["id"], "sourceUrl": item["url"], "period": item["period"], "reason": str(exc)}


def target_periods(years: list[int], now: dt.datetime) -> list[tuple[int, int]]:
    periods: list[tuple[int, int]] = []
    for year in years:
        last_month = now.month if year == now.year else (12 if year < now.year else 0)
        periods.extend((year, month) for month in range(1, last_month + 1))
    return periods


def read_snapshot(path: Path) -> dict | None:
    try:
        value = json.loads(path.read_text())
        return value if value.get("schemaVersion") == 1 and isinstance(value.get("documents"), dict) else None
    except (OSError, ValueError):
        return None


def sync_month(year: int, month: int, cache_dir: Path, workers: int) -> dict:
    period = f"{year}-{month:02d}"
    snapshot_path = cache_dir / f"{period}.json"
    previous = read_snapshot(snapshot_path)
    query = urllib.parse.urlencode({"setLocale": "id-ID", "Year": year, "Month": f"{month:02d}"})
    body, _ = get(f"{BASE}{LIST_PATH}?{query}")
    page = body.decode("utf-8", errors="replace")
    if "table table--zebra" not in page:
        raise RuntimeError(f"struktur daftar KSEI tidak dikenali: {period}")

    listed: list[dict] = []
    for href, _about, published in ROW_RE.findall(page):
        url = urllib.parse.urljoin(BASE, html.unescape(href))
        url = f"{url}{'&' if '?' in url else '?'}month={month:02d}"
        listed.append({"id": file_id(url), "url": url, "publishedAt": strip_tags(published), "period": period})
    upstream_ids = {item["id"] for item in listed}
    old_documents = previous.get("documents", {}) if previous else {}
    documents = {key: value for key, value in old_documents.items() if key in upstream_ids}
    # Event valid dipakai ulang; rejection selalu dicoba lagi. Ini membedakan
    # kegagalan jaringan sementara dari dokumen yang memang belum dapat diparse.
    pending = [item for item in listed if item["id"] not in documents or documents[item["id"]].get("rejection")]

    if pending:
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            for item, result in zip(pending, pool.map(fetch_document, pending)):
                event, rejection = result
                documents[item["id"]] = {"event": event, "rejection": rejection}

    snapshot = {
        "schemaVersion": 1, "source": "KSEI_OFFICIAL", "period": period,
        "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "listUrl": f"{BASE}{LIST_PATH}?{query}", "upstreamCount": len(listed), "documents": documents,
    }
    atomic_json(snapshot_path, snapshot)
    return snapshot


def sync(years: list[int], output: Path, workers: int) -> dict:
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=7)))
    cache_dir = output.parent / "months"
    snapshots: list[dict] = []
    failed_periods: list[dict] = []
    for year, month in target_periods(years, now):
        path = cache_dir / f"{year}-{month:02d}.json"
        try:
            snapshots.append(sync_month(year, month, cache_dir, workers))
        except Exception as exc:
            previous = read_snapshot(path)
            if previous:
                snapshots.append(previous)
                failed_periods.append({"period": f"{year}-{month:02d}", "reason": str(exc), "fallback": "LAST_VALID_SNAPSHOT"})
            else:
                raise RuntimeError(f"{year}-{month:02d} gagal dan belum punya snapshot valid: {exc}") from exc

    documents = [document for snapshot in snapshots for document in snapshot["documents"].values()]
    events = [document["event"] for document in documents if document.get("event")]
    rejected = [document["rejection"] for document in documents if document.get("rejection")]
    events.sort(key=lambda event: (event["date"], event["symbol"], event["type"], event["id"]))
    artifact = {
        "schemaVersion": 1, "source": "KSEI_OFFICIAL",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "coverage": {"years": years, "monthsRequested": len(snapshots), "documentsDiscovered": len(documents), "eventsVerified": len(events), "documentsRejected": len(rejected), "failedPeriods": failed_periods},
        "status": "COMPLETE" if not rejected and not failed_periods else "PARTIAL",
        "events": events, "rejected": rejected,
    }
    atomic_json(output, artifact)
    return artifact


def main() -> None:
    parser = argparse.ArgumentParser()
    current = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).year
    parser.add_argument("--years", nargs="+", type=int, default=[current])
    parser.add_argument("--out", type=Path, default=Path("data/corporate-calendar/ksei-rups.json"))
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    if not 1 <= args.workers <= 12:
        parser.error("--workers harus 1..12")
    result = sync(sorted(set(args.years)), args.out, args.workers)
    print(json.dumps({"status": result["status"], **result["coverage"], "output": str(args.out)}))
    if result["status"] != "COMPLETE":
        raise SystemExit(2)


if __name__ == "__main__":
    main()

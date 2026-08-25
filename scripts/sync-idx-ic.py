#!/usr/bin/env python3
"""Unduh klasifikasi emiten aktual langsung dari endpoint publik BEI.

Tidak ada fallback atau pemetaan buatan. Baris tanpa ticker/sektor resmi dilewati dan
dilaporkan. Output CSV dapat diimpor lewat Admin -> Decision Lab.
"""
from __future__ import annotations
import argparse, csv, os, re
from datetime import date
from curl_cffi import requests

ENDPOINT = "https://www.idx.co.id/primary/ListedCompany/GetCompanyProfiles"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=os.path.join(ROOT, "data", "idx-ic", f"idx-ic-{date.today().isoformat()}.csv"))
    args = parser.parse_args()
    response = requests.get(ENDPOINT, params={"start": 0, "length": 5000}, impersonate="chrome124", timeout=60)
    response.raise_for_status()
    payload = response.json()
    source = payload.get("data") or []
    rows = []
    rejected = 0
    for item in source:
        ticker = str(item.get("KodeEmiten") or "").strip().upper()
        sector = str(item.get("Sektor") or "").strip()
        if not re.fullmatch(r"[A-Z0-9]{4,6}", ticker) or not sector:
            rejected += 1
            continue
        rows.append({
            "ticker": ticker, "sector_name": sector,
            "subsector_name": str(item.get("SubSektor") or "").strip(),
            "industry_name": str(item.get("Industri") or "").strip(),
            "subindustry_name": str(item.get("SubIndustri") or "").strip(),
        })
    if not rows:
        raise RuntimeError("BEI tidak mengembalikan klasifikasi valid; output tidak ditulis")
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader(); writer.writerows(rows)
    print(f"IDX-IC: {len(rows)} baris valid, {rejected} dilewati -> {args.output}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

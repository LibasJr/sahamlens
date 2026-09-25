#!/usr/bin/env python3
"""Verifikasi sasaran inflasi resmi Bank Indonesia dari halaman siaran pers yang sudah tercatat.

Fungsi: mengambil ULANG halaman resmi yang dipakai baris bukti terakhir, membaca pernyataan
"sasaran ... X±Y% pada TAHUN", lalu melaporkan nilai resmi saat ini. Skrip TIDAK mengarang
angka: kalau halaman tidak bisa diakses atau kalimatnya tidak ditemukan, keluar GAGAL dengan
alasan eksplisit.

Catatan lapangan: sebagian halaman bi.go.id menolak TLS fingerprint tertentu (connection reset);
rantai fingerprint dicoba berurutan dan keberhasilannya dilaporkan apa adanya.
"""
from __future__ import annotations

import argparse
import json
import re
import sys

FINGERPRINTS = ("safari18_0", "chrome136", "chrome131", "edge101")
POLA = (
    re.compile(r"(\d(?:[.,]\d)?)\s*(?:\+/-|±|&#177;|&plusmn;)\s*(\d(?:[.,]\d)?)\s*%\s*(?:pada\s+)?(?:tahun\s+)?(20\d{2})", re.I),
    re.compile(r"sasaran\s+inflasi[^.]{0,80}?(\d(?:[.,]\d)?)\s*(?:\+/-|±)\s*(\d(?:[.,]\d)?)\s*%", re.I),
)
KONTEKS = ("sasaran inflasi", "sasaran", "inflasi", "target")


def gagal(reason: str, **extra) -> None:
    print(json.dumps({"status": "GAGAL", "reason": reason, **extra}, ensure_ascii=False))
    sys.exit(0)


def angka(teks: str) -> float:
    return float(teks.replace(",", "."))


def bersihkan(html: str) -> str:
    teks = re.sub(r"<script.*?</script>", " ", html, flags=re.S | re.I)
    teks = re.sub(r"<style.*?</style>", " ", teks, flags=re.S | re.I)
    teks = re.sub(r"<[^>]+>", " ", teks)
    teks = teks.replace("&nbsp;", " ").replace("&#160;", " ")
    return re.sub(r"\s+", " ", teks).strip()


def ambil(url: str) -> tuple[str, str] | None:
    try:
        from curl_cffi import requests as creq
    except Exception:
        gagal("CURL_CFFI_TIDAK_TERSEDIA")
    for fingerprint in FINGERPRINTS:
        try:
            response = creq.get(url, impersonate=fingerprint, timeout=45)
        except Exception:
            continue
        if response.status_code == 200 and response.text:
            return fingerprint, response.text
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-url", action="append", required=True)
    parser.add_argument("--output")
    args = parser.parse_args()

    catatan = []
    for url in args.source_url:
        hasil = ambil(url)
        if hasil is None:
            catatan.append({"url": url, "status": "TIDAK_TERJANGKAU"})
            continue
        fingerprint, html = hasil
        teks = bersihkan(html)
        for pola in POLA:
            for cocok in pola.finditer(teks):
                mulai = max(0, cocok.start() - 160)
                kutipan = teks[mulai : cocok.end() + 120]
                if not any(kata in kutipan.lower() for kata in KONTEKS):
                    continue
                tengah = angka(cocok.group(1))
                pita = angka(cocok.group(2))
                tahun = int(cocok.group(3)) if cocok.lastindex and cocok.lastindex >= 3 and cocok.group(3) else None
                if not 0.5 <= tengah <= 10 or not 0.1 <= pita <= 3:
                    continue
                keluaran = {
                    "status": "SUKSES",
                    "input_key": "INFLATION_TARGET_MID_PCT",
                    "mid_pct": tengah,
                    "pita_pct": pita,
                    "upper_pct": round(tengah + pita, 4),
                    "lower_pct": round(tengah - pita, 4),
                    "tahun": tahun,
                    "fingerprint": fingerprint,
                    "sumber_url": url,
                    "kutipan": kutipan.strip()[:400],
                }
                teks_keluar = json.dumps(keluaran, ensure_ascii=False)
                if args.output:
                    with open(args.output, "w", encoding="utf-8") as handle:
                        handle.write(teks_keluar)
                print(teks_keluar)
                return
        catatan.append({"url": url, "status": "PERNYATAAN_TIDAK_DITEMUKAN", "fingerprint": fingerprint, "panjang_teks": len(teks)})

    gagal("SUMBER_RESMI_TIDAK_TERBACA", catatan=catatan)


if __name__ == "__main__":
    main()
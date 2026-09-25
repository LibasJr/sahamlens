#!/usr/bin/env python3
"""Yield SBN benchmark 10 tahun - sumber RESMI DJPPR Kementerian Keuangan.

Sumber: halaman "Daftar Kuotasi Harga SBN Seri Benchmark Mingguan"
(https://djppr.kemenkeu.go.id/daftarkuotasihargasbnseribenchmarkmingguan) yang
dilayani API resmi https://api-djppr.kemenkeu.go.id/web/api/v1/page?url=...
Data harian harga + yield seri benchmark (5Y/10Y/15Y/20Y) ada di dalam berkas
PDF "Daftar Kuotasi Harga SUN Seri Benchmark <tahun>" (diperbarui mingguan).

Aturan keras:
  * Tidak ada angka cadangan/karangan. Bila PDF tidak terbaca, struktur berubah,
    atau kolom 10Y tidak teridentifikasi -> keluar GAGAL tanpa angka.
  * Seri, tanggal, harga, dan yield diambil apa adanya dari berkas resmi; URL
    media + SHA256 PDF ikut dicatat agar dapat diaudit ulang.

Keluaran: JSON ke stdout (atau --output <berkas>).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import urllib.request
from datetime import date

PAGE_URL = "https://api-djppr.kemenkeu.go.id/web/api/v1/page"
PAGE_SLUG = "daftarkuotasihargasbnseribenchmarkmingguan"
USER_AGENT = "Mozilla/5.0 (SahamLens risk-free collector; +https://sahamlens.id)"
TENOR_TARGET = "10Y"
RENTANG_YIELD = (3.0, 20.0)
RENTANG_HARGA = (50.0, 200.0)

BULAN_ID = {
    "januari": 1, "februari": 2, "maret": 3, "april": 4, "mei": 5, "juni": 6,
    "juli": 7, "agustus": 8, "september": 9, "oktober": 10, "november": 11,
    "desember": 12,
}
BULAN_EN = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
}
BULAN_ABBR = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7,
    "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def fail(reason: str, **extra: object) -> None:
    print(json.dumps({"status": "GAGAL", "reason": reason, **extra}, ensure_ascii=False))
    sys.exit(1)


def http_get(url: str, timeout: int = 120) -> tuple[bytes, dict]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 (URL resmi)
        return response.read(), dict(response.headers)


def parse_tanggal_terbit(text: str) -> date | None:
    """"per 18 September 2026" -> date(2026, 9, 18)."""
    match = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", text or "")
    if not match:
        return None
    hari, nama_bulan, tahun = match.groups()
    bulan = BULAN_ID.get(nama_bulan.lower()) or BULAN_EN.get(nama_bulan.lower())
    if not bulan:
        return None
    return date(int(tahun), bulan, int(hari))


def walk_widgets(node: object, collected: list) -> None:
    if isinstance(node, dict):
        if node.get("widgetType") == "repeater":
            collected.append(node)
        for value in node.values():
            walk_widgets(value, collected)
    elif isinstance(node, list):
        for value in node:
            walk_widgets(value, collected)


def item_kuotasi_sun_terbaru(repeaters: list) -> dict:
    """Item kuotasi SUN (bukan SBSN) dengan tanggal 'per ...' terbaru."""
    kandidat = []
    for repeater in repeaters:
        for item in repeater.get("data") or []:
            judul = str(item.get("@judul") or "")
            tautan = str(item.get("@link") or "")
            if not judul.startswith("Daftar Kuotasi Harga SUN Seri Benchmark"):
                continue
            if "SBSN" in judul:
                continue
            terbit = parse_tanggal_terbit(str(item.get("@deskripsi") or ""))
            if not tautan.startswith("http") or not terbit:
                continue
            kandidat.append({"judul": judul, "tautan": tautan, "terbit": terbit})
    if not kandidat:
        fail("ITEM_KUOTASI_SUN_TIDAK_DITEMUKAN")
    return max(kandidat, key=lambda item: item["terbit"])


def pdf_ke_teks(pdf_bytes: bytes) -> str:
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as handle:
            handle.write(pdf_bytes)
            handle.flush()
            hasil = subprocess.run(
                ["pdftotext", "-layout", handle.name, "-"],
                check=True,
                capture_output=True,
                timeout=240,
            )
    except FileNotFoundError:
        fail("PDFTOTEXT_TIDAK_TERSEDIA")
    except subprocess.CalledProcessError as error:
        fail("PDFTOTEXT_GAGAL", detail=error.stderr.decode("utf-8", "replace")[:200])
    return hasil.stdout.decode("utf-8", "replace")


def label_tenor(baris_header: str) -> list[str]:
    """Urutan label tenor dari baris header ('5Y 10 Y 15 Y 20 Y')."""
    label = re.findall(r"(\d{1,2})\s*Y", baris_header)
    if len(label) != 4:
        fail("HEADER_TENOR_TIDAK_TERBACA", jumlah_kolom=len(label), baris=baris_header.strip()[:120])
    return [f"{angka}Y" for angka in label]


def baca_baris(teks: str) -> tuple[list[dict], dict]:
    """Kembalikan (baris data, peta tenor -> kode seri) dari teks PDF.

    Posisi kolom pada header tidak sejajar dengan kolom angka (label tenor
    dipusatkan), jadi pasangan (harga, yield) dibaca berurutan dari setiap
    baris data: kolom ke-1..4 mengikuti urutan label header. Baris yang tidak
    memuat tepat 4 pasangan diabaikan (bukan baris data).
    """
    baris = teks.splitlines()
    tenor_urut: list[str] = []
    seri_per_tenor: dict = {}
    data: list[dict] = []
    tanggal_re = re.compile(r"^\s*(\d{1,2})-([A-Za-z]{3})-(\d{2})\s")
    angka_re = re.compile(r"(\d{1,3},\d{2})\s+(\d{1,2},\d{2})%")

    for indeks, baris_ini in enumerate(baris):
        if len(re.findall(r"\d{1,2}\s*Y", baris_ini)) == 4 and "Harga" not in baris_ini:
            tenor_urut = label_tenor(baris_ini)
            if indeks + 1 < len(baris):
                kode = re.findall(r"FR\d{4}", baris[indeks + 1])
                if len(kode) == 4:
                    seri_per_tenor = {tenor_urut[i]: kode[i] for i in range(4)}
            continue

        cocok_tanggal = tanggal_re.match(baris_ini)
        if not cocok_tanggal or len(tenor_urut) != 4:
            continue
        pasangan = angka_re.findall(baris_ini)
        if len(pasangan) != 4:
            continue
        hari, nama_bulan, tahun = cocok_tanggal.groups()
        bulan = BULAN_ABBR.get(nama_bulan.lower())
        if not bulan:
            continue
        tanggal = date(2000 + int(tahun), bulan, int(hari))
        tenor = {
            label: {"harga": float(harga.replace(",", ".")), "yield_pct": float(yield_.replace(",", "."))}
            for label, (harga, yield_) in zip(tenor_urut, pasangan)
        }
        data.append({"tanggal": tanggal.isoformat(), "tenor": tenor})

    return data, seri_per_tenor


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", help="tulis JSON ke berkas ini (selain stdout)")
    argumen = parser.parse_args()

    halaman_bytes, _ = http_get(f"{PAGE_URL}?url={PAGE_SLUG}")
    try:
        halaman = json.loads(halaman_bytes)
    except json.JSONDecodeError:
        fail("HALAMAN_BUKAN_JSON", panjang=len(halaman_bytes))

    konten = (halaman.get("Data") or {}).get("PageContentLive")
    if not konten:
        fail("KONTEN_HALAMAN_KOSONG")

    repeaters: list = []
    walk_widgets(json.loads(konten), repeaters)
    item = item_kuotasi_sun_terbaru(repeaters)

    pdf_bytes, headers = http_get(item["tautan"])
    if not pdf_bytes.startswith(b"%PDF"):
        fail("BERKAS_BUKAN_PDF", content_type=str(headers.get("Content-Type")))

    sidik = hashlib.sha256(pdf_bytes).hexdigest()
    teks = pdf_ke_teks(pdf_bytes)
    data, seri_per_tenor = baca_baris(teks)
    if not data:
        fail("TABEL_TIDAK_TERBACA")
    if TENOR_TARGET not in seri_per_tenor:
        fail("KOLOM_10Y_TIDAK_DITEMUKAN", tenor_terbaca=sorted(seri_per_tenor))

    baris_terbaru = max(data, key=lambda baris: baris["tanggal"])
    sel = baris_terbaru["tenor"].get(TENOR_TARGET)
    if not sel:
        fail("SEL_10Y_KOSONG_PADA_BARIS_TERBARU", tanggal=baris_terbaru["tanggal"])

    yield_pct = float(sel["yield_pct"])
    harga = float(sel["harga"])
    if not (RENTANG_YIELD[0] <= yield_pct <= RENTANG_YIELD[1]):
        fail("YIELD_DI_LUAR_RENTANG_WAJAR", yield_pct=yield_pct)
    if not (RENTANG_HARGA[0] <= harga <= RENTANG_HARGA[1]):
        fail("HARGA_DI_LUAR_RENTANG_WAJAR", harga=harga)

    tanggal_data = date.fromisoformat(baris_terbaru["tanggal"])
    if tanggal_data > date.today():
        fail("TANGGAL_DATA_MASA_DEPAN", tanggal=baris_terbaru["tanggal"])

    keluaran = {
        "status": "SUKSES",
        "input_key": "RISK_FREE_RATE_PCT",
        "tenor": TENOR_TARGET,
        "seri": seri_per_tenor[TENOR_TARGET],
        "tanggal_data": baris_terbaru["tanggal"],
        "harga": harga,
        "yield_pct": yield_pct,
        "sumber_nama": "DJPPR Kementerian Keuangan - Daftar Kuotasi Harga SUN Seri Benchmark",
        "sumber_judul": item["judul"],
        "sumber_terbit": item["terbit"].isoformat(),
        "sumber_url": item["tautan"],
        "tanggal_data_sama_dengan_terbit": tanggal_data == item["terbit"],
        "pdf_sha256": sidik,
        "baris_terbaca": len(data),
        "seri_per_tenor": seri_per_tenor,
    }

    teks_json = json.dumps(keluaran, ensure_ascii=False, indent=2)
    if argumen.output:
        with open(argumen.output, "w", encoding="utf-8") as berkas:
            berkas.write(teks_json)
    print(teks_json)


if __name__ == "__main__":
    main()
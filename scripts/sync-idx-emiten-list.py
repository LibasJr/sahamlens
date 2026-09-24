"""Sinkronkan katalog emiten (idx_emiten_900.csv) dengan daftar resmi BEI.

KENAPA ADA. Katalog ini dipakai loadEmitenList() sebagai daftar emiten aplikasi, calon universe
backfill, dan bahan validasi ticker di chat. Sampai sekarang isinya snapshot manual: tidak ada
skrip yang bisa memperbaruinya, jadi pemetaan papan (Utama/Pengembangan/Pemantauan Khusus/
Akselerasi) dan nama perusahaan hanya segar pada hari snapshot diambil. Pemetaan papan bukan
hiasan: status "Pemantauan Khusus" adalah sinyal risiko, dan backtest-universe-refresh memakai
kolom papan untuk menyaring kandidat.

KENAPA curl_cffi. idx.co.id menolak klien tanpa TLS/JA3 fingerprint browser (Cloudflare 403).
Pola ini sama dengan sync-idx-uma.py, sync-idx-suspension.py, dan sync-idx-ic.py.

SUMBER. GetCompanyProfiles - satu-satunya endpoint yang memberi NamaEmiten UTUH
("PT Fortune Resources Investment Tbk"). GetSecuritiesStock memotong nama pada ~32 karakter
("Fortune Resources Investment T") sehingga tidak layak dipakai untuk kolom nama.

PERILAKU. Tanpa --tulis skrip hanya melaporkan delta (aman dijalankan kapan pun). Dengan --tulis
katalog ditulis ulang dari data resmi: kode baru ditambahkan, kode yang hilang dari BEI
DIBIARKAN di laporan tetapi TIDAK dihapus dari katalog - menghapus emiten delisting justru
memperparah survivorship bias yang sudah terdokumentasi di validation-limitations.ts.
"""
from __future__ import annotations

import argparse
import csv
import io
import os
import shutil
import sys
from datetime import datetime, timezone

KATALOG = os.environ.get("SAHAMLENS_EMITEN_CSV", "idx_emiten_900.csv")
ENDPOINT = "https://www.idx.co.id/primary/ListedCompany/GetCompanyProfiles"
PAGE_SIZE = 1000  # halaman besar (mis. 5000) ditolak Cloudflare; 1000 diterima
HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.idx.co.id/id/perusahaan-tercatat/profil-perusahaan-tercatat",
}
HEADER = ["No", "Kode", "Nama Emiten", "Kode_YFinance", "Papan"]


def ambil_resmi() -> dict[str, dict]:
    try:
        from curl_cffi import requests
    except ImportError:  # pragma: no cover - dependensi lingkungan
        print("[!] curl_cffi belum terpasang. Jalankan: pip install curl_cffi", file=sys.stderr)
        raise SystemExit(2)

    import time

    session = requests.Session(impersonate="chrome")
    out: dict[str, dict] = {}
    total = None
    start = 0
    while True:
        url = f"{ENDPOINT}?start={start}&length={PAGE_SIZE}&language=id-id"
        for attempt in range(1, 5):
            res = session.get(url, headers=HEADERS, timeout=60)
            if res.status_code == 200:
                break
            print(f"  [ulang {attempt}/4] HTTP {res.status_code} pada start={start}", file=sys.stderr)
            time.sleep(2 * attempt)
        res.raise_for_status()
        payload = res.json()
        total = payload.get("recordsTotal")
        batch = payload.get("data") or []
        if not batch:
            break
        for row in batch:
            kode = (row.get("KodeEmiten") or "").strip().upper()
            if not kode:
                continue
            nama = (row.get("NamaEmiten") or "").strip()
            # Katalog memakai gaya ringkas tanpa awalan "PT " (lihat baris lama: "Mahaka Media Tbk.")
            if nama.upper().startswith("PT "):
                nama = nama[3:].strip()
            out[kode] = {"nama": rapikan_nama(nama), "papan": (row.get("PapanPencatatan") or "").strip()}
        start += len(batch)
        if total is not None and start >= int(total):
            break
    print(f"BEI: {len(out)} emiten diambil (recordsTotal={total})")
    return out


def rapikan_nama(nama: str) -> str:
    """Buang duplikasi sufiks/ spasi ganda dari data BEI (mis. 'Akasha Wira International Tbk  Tbk')."""
    nama = " ".join(nama.split())
    while nama.lower().endswith(" tbk tbk"):
        nama = nama[: -len(" tbk")]
    return nama


def _kunci_nama(nama: str) -> str:
    """Bentuk pembanding: buang titik/titik-titik dan samakan besar-kecil."""
    return nama.lower().replace(".", "").replace("  ", " ").strip()


def perlu_perbarui_nama(lama: str, baru: str) -> tuple[bool, str]:
    """Apakah nama katalog layak diganti? True hanya untuk nama TERPOTONG atau rename sungguhan.

    Katalog lama memotong nama pada 32 karakter ('Adira Dinamika Multi Finance T'), sedangkan
    BEI memberi nama utuh. Perbedaan yang cuma soal titik akhir ('Tbk.' vs 'Tbk') TIDAK dihitung
    sebagai perubahan supaya diff-nya tetap bisa ditinjau manusia.
    """
    if not lama or not baru:
        return False, "kosong"
    if _kunci_nama(lama) == _kunci_nama(baru):
        return False, "kosmetik"
    if len(lama) >= 28 and _kunci_nama(baru).startswith(_kunci_nama(lama)):
        return True, "nama terpotong"
    # Perbedaan lain bisa rename sungguhan ATAU sekadar gaya singkatan BEI ('Industry' -> 'Ind.')
    # yang justru menurunkan mutu katalog. Jangan diputuskan otomatis - laporkan untuk ditinjau.
    return False, "perlu-tinjauan"


def baca_katalog(path: str) -> list[dict]:
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def main() -> int:
    parser = argparse.ArgumentParser(description="Sinkronkan idx_emiten_900.csv dengan daftar resmi BEI.")
    parser.add_argument("--tulis", action="store_true", help="tulis ulang katalog dari data resmi BEI")
    parser.add_argument("--csv", default=KATALOG, help=f"lokasi katalog (default: {KATALOG})")
    args = parser.parse_args()

    resmi = ambil_resmi()
    lama = baca_katalog(args.csv)
    lama_map = {(r.get("Kode") or "").strip().upper(): r for r in lama if (r.get("Kode") or "").strip()}

    baru_kode = sorted(set(resmi) - set(lama_map))
    kode_hilang = sorted(set(lama_map) - set(resmi))
    papan_berubah = []
    nama_berubah = []
    perlu_tinjau = []
    for kode in sorted(set(resmi) & set(lama_map)):
        a, b = resmi[kode], lama_map[kode]
        papan_lama = (b.get("Papan") or "").strip()
        if a["papan"] and papan_lama != a["papan"]:
            papan_berubah.append((kode, papan_lama, a["papan"]))
        nama_lama = (b.get("Nama Emiten") or "").strip()
        ganti, alasan = perlu_perbarui_nama(nama_lama, a["nama"])
        if ganti:
            nama_berubah.append((kode, nama_lama, a["nama"], alasan))
        elif alasan == "perlu-tinjauan":
            perlu_tinjau.append((kode, nama_lama, a["nama"]))

    print(f"BEI resmi: {len(resmi)} emiten | katalog {args.csv}: {len(lama_map)} emiten")
    print(f"kode baru: {len(baru_kode)} | kode hilang dari BEI: {len(kode_hilang)} | papan berubah: {len(papan_berubah)} | nama berubah: {len(nama_berubah)}")
    for kode in baru_kode:
        print(f"  + {kode} | {resmi[kode]['papan']}")
    for kode in kode_hilang:
        print(f"  - {kode} | {lama_map[kode].get('Nama Emiten')} (tetap dipertahankan di katalog)")
    for kode, a, b in papan_berubah:
        print(f"  ~ {kode}: papan {a or '(kosong)'} -> {b}")
    for kode, a, b, alasan in nama_berubah:
        print(f"  ~ {kode} [{alasan}]: '{a}' -> '{b}'")

    if perlu_tinjau:
        print(f"\nuntuk ditinjau manusia (TIDAK diubah otomatis, {len(perlu_tinjau)}):")
        for kode, a, b in perlu_tinjau:
            print(f"  ? {kode}: katalog '{a}' | BEI '{b}'")

    if not args.tulis:
        print("\n(dry-run; tambahkan --tulis untuk menulis ulang katalog)")
        return 0

    if not lama:
        print("[!] katalog lama tidak ditemukan/kosong - menulis katalog baru dari BEI")
    # Urutan dipertahankan seperti katalog lama supaya diff-nya minimal dan bisa ditinjau;
    # kode yang belum ada di katalog diletakkan di belakang.
    urutan = [(r.get("Kode") or "").strip().upper() for r in lama]
    urutan = [k for k in urutan if k in resmi]
    urutan += [k for k in sorted(resmi) if k not in set(urutan)]

    baris = []
    for i, kode in enumerate(urutan, start=1):
        nama_lama = (lama_map.get(kode, {}).get("Nama Emiten") or "").strip()
        ganti, _alasan = perlu_perbarui_nama(nama_lama, resmi[kode]["nama"])
        nama = resmi[kode]["nama"] if (ganti or not nama_lama) else nama_lama
        baris.append({"No": str(i), "Kode": kode, "Nama Emiten": nama,
                      "Kode_YFinance": f"{kode}.JK", "Papan": resmi[kode]["papan"]})

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=HEADER, lineterminator="\n")
    writer.writeheader()
    writer.writerows(baris)

    if os.path.exists(args.csv):
        cadangan = f"{args.csv}.bak-{datetime.now(timezone.utc):%Y%m%d%H%M%S}"
        shutil.copy2(args.csv, cadangan)
        print(f"cadangan: {cadangan}")
    with open(args.csv, "w", encoding="utf-8") as handle:
        handle.write(buf.getvalue())
    print(f"[ditulis] {args.csv}: {len(baris)} emiten")
    return 0


if __name__ == "__main__":
    sys.exit(main())
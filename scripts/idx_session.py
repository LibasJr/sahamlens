"""Sesi curl_cffi tahan Cloudflare untuk endpoint publik IDX.

Kenapa modul ini ada (insiden 2026-09-24/25):
Endpoint publik idx.co.id berada di belakang Cloudflare dan menolak klien tanpa
fingerprint TLS browser (HTTP 403 "Just a moment..."). Skrip-skrip IDX memakai
`requests.Session(impersonate="chrome124")` sebagai satu-satunya jalur yang bekerja tanpa
akun privat - sampai Cloudflare berhenti menerima fingerprint itu. Efeknya SELURUH pipeline
IDX berhenti serentak (foreign flow, UMA, suspension, broker summary, laporan keuangan):
job tetap tercatat, tetapi datanya tidak bertambah sejak 2026-09-23.

Terbukti pada 2026-09-25 pukul 03:00 UTC dari VPS ini:
    chrome124 -> HTTP 403 | chrome131 -> HTTP 403 | chrome136 -> HTTP 200
    safari17_0 -> HTTP 403 | safari18_0 -> HTTP 200

Karena daftar fingerprint yang lolos bisa berubah kapan saja, modul ini MENGUJI beberapa
kandidat dan memakai yang pertama berhasil (uji nyata ke endpoint, bukan asumsi). Ia tidak
mengarang data apa pun - hanya memilih fingerprint HTTP yang diterima server.
Pengaturan ulang rantai: env `IDX_IMPERSONATE_CHAIN` (dipisah koma).
"""

from __future__ import annotations

import os
from datetime import date

from curl_cffi import requests

DEFAULT_CHAIN = "chrome136,safari18_0,chrome131,safari17_0,chrome124"

CANDIDATE_IMPERSONATIONS: tuple[str, ...] = tuple(
    value.strip()
    for value in (os.environ.get("IDX_IMPERSONATE_CHAIN") or DEFAULT_CHAIN).split(",")
    if value.strip()
)

PROBE_URL = os.environ.get("IDX_PROBE_URL") or (
    "https://www.idx.co.id/primary/TradingSummary/GetBrokerSummary"
    f"?date={date.today().isoformat()}&start=0&length=1"
)

_PROBE_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.idx.co.id/",
}


def build_session(timeout: int = 30, probe_url: str | None = None) -> "requests.Session":
    """Kembalikan sesi curl_cffi dengan fingerprint pertama yang lolos Cloudflare IDX.

    `probe_url=None` melewati uji dan memakai kandidat pertama (dipakai hanya bila pemanggil
    memang sudah menguji endpoint-nya sendiri).
    """
    target = probe_url if probe_url is not None else PROBE_URL
    failures: list[str] = []

    for name in CANDIDATE_IMPERSONATIONS:
        try:
            session = requests.Session(impersonate=name)
            if target:
                response = session.get(target, timeout=timeout, headers=dict(_PROBE_HEADERS))
                if response.status_code == 403:
                    failures.append(f"{name}: HTTP 403")
                    continue
                if response.status_code >= 500:
                    failures.append(f"{name}: HTTP {response.status_code}")
                    continue
            print(f"[idx-session] fingerprint aktif: {name}", flush=True)
            return session
        except Exception as error:  # noqa: BLE001 - laporkan apa adanya, jangan tebak
            failures.append(f"{name}: {type(error).__name__} {str(error)[:80]}")

    raise RuntimeError(
        "Tidak ada fingerprint curl_cffi yang diterima Cloudflare IDX. Dicoba: "
        + "; ".join(failures)
        + ". Perbarui paket curl_cffi (pip install -U curl_cffi) atau setel IDX_IMPERSONATE_CHAIN."
    )
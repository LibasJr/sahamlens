# Status Broker Summary — NONAKTIF, SENGAJA DIPERTAHANKAN

> **Disabled because ingestion currently requires manual source upload.
> Retained for future automated/legal data source.**

---

## Ringkasan

Broker Summary **dinonaktifkan**, bukan dihapus. Tidak ada satu pun baris data,
tabel, atau modul yang dibuang.

| Aspek | Status |
|---|---|
| Kode sumber (`modules/broker-flow/`) | **utuh** |
| Skema database | **utuh**, tidak ada migrasi destruktif |
| Data historis | **utuh** |
| Route API & halaman admin | **utuh dan dapat diakses** |
| Cron `broker-summary-scan` | **nonaktif** (timer systemd disabled 2026-08-14) |
| Menu sidebar admin | terlihat, diberi label `(nonaktif)` |
| Kartu di halaman admin | terlihat, diredupkan + badge `Nonaktif` |

---

## Kenapa dinonaktifkan

Ingestion-nya menuntut **upload berkas sumber secara manual per emiten**.
Melakukannya untuk ratusan ticker setiap hari bursa tidak realistis, jadi fitur
ini tidak pernah benar-benar terpakai — sementara cron-nya tetap gagal setiap
kali berjalan (`INDEXALPHA_API_KEY` tidak dikonfigurasi di VPS), yang membuat
panel admin terus menampilkan `FAILED`.

Lihat catatan pada entri `/api/cron/broker-summary-scan` di
`config/scheduled-jobs.json`.

---

## Yang TIDAK boleh dilakukan

- ❌ Menghapus tabel atau kolom broker summary
- ❌ Membuat migrasi destruktif
- ❌ Menghapus `modules/broker-flow/`
- ❌ Mengaktifkan kembali cron-nya hanya demi menyelesaikan pekerjaan lain
- ❌ Menganggap Ownership Flow sebagai penggantinya

## Yang perlu terjadi sebelum diaktifkan kembali

1. Tersedia sumber broker summary yang **legal, stabil, dan dapat diotomasi**
   (tanpa upload manual)
2. Kredensial/kontrak sumber terkonfigurasi di VPS
3. Cron didaftarkan ulang dan diverifikasi lewat `systemctl list-timers`
4. `config/scheduled-jobs.json` diperbarui dengan jadwal yang **terbukti**

---

## Hubungannya dengan Ownership Flow

**Ownership Flow bukan pengganti Broker Summary.**

Keduanya mengukur besaran yang berbeda secara fundamental — transaksi per kode
broker vs komposisi kepemilikan — dan yang satu tidak dapat disimpulkan dari
yang lain. Ownership Flow dibuat sebagai **modul baru yang independen**, dengan
tabel, service, cron, API, dan menu sendiri.

Penjelasan lengkap: `docs/ownership-flow/broker-vs-ownership.md`.

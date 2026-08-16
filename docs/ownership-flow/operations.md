# Ownership Flow — panduan operator

Ringkas: apa yang harus dilakukan, dalam urutan apa, dan apa yang **tidak** boleh
dilakukan.

---

## Keadaan saat ini

```
OWNERSHIP_FLOW_ENABLED           = true    → menu, API, panel admin terlihat
OWNERSHIP_FLOW_CRON_ENABLED      = false   → cron belum dijadwalkan
OWNERSHIP_FLOW_INGESTION_ENABLED = false   → penulisan database tertutup
KSEI_REGISTERED_SECURITY         = UNVERIFIED
```

UI menampilkan panel "Verifikasi sumber belum selesai" dan tabel kosong. Itu
**keadaan sebenarnya**, bukan kerusakan — tidak ada angka contoh yang dibuat
untuk mengisinya.

---

## Alur data

```
cron → fetch (bounded) → parse → validate → PostgreSQL → Redis → API → frontend
```

Server **tidak pernah** menembak KSEI pada request pengguna. Membuka halaman
BBRI membaca database, bukan sumber.

---

## Langkah 1 — audit sumber (di VPS)

```bash
npm run audit:ksei-ownership
```

Menghasilkan `reports/ksei-ownership-source-audit.json` dan fixture tersanitasi
di `data/source-fixtures/ksei/`. Exit code 1 bila ada yang gagal.

**Ulangi beberapa hari berturut-turut** dan bandingkan nilai `As of` — itu
satu-satunya cara menentukan cadence. Jangan menebak.

Checklist lengkap: [`source-audit.md`](./source-audit.md).

## Langkah 2 — parser terhadap fixture nyata

Kirimkan laporan + fixture. Parser diimplementasikan/dikoreksi terhadap fixture
itu, dengan test yang membacanya, lalu:

- `cadence` diubah dari `UNKNOWN` ke nilai terbukti
- `auditStatus` → `VERIFIED`, dalam commit yang sama dengan fixture + test
- `source-registry.test.ts` diperbarui (saat ini ia menegaskan `UNVERIFIED`)

## Langkah 3 — aktifkan ingestion

```bash
OWNERSHIP_FLOW_INGESTION_ENABLED=true
OWNERSHIP_FLOW_CRON_ENABLED=true
```

Uji manual dulu dengan universe kecil:

```bash
OWNERSHIP_FLOW_UNIVERSE_LIMIT=5 \
  curl -H "Authorization: Bearer $CRON_SECRET" \
       https://sahamlens.id/api/cron/ownership-flow-scan
```

Periksa `/admin/ownership-flow`: tanggal observasi harus tanggal **sumber**,
bukan hari ini.

## Langkah 4 — jadwalkan cron

**1× sehari.** Jam diambil dari hasil langkah 1, bukan tebakan. Pola timer
systemd sama dengan `screener-scan`/`calendar-scan`. Setelah terpasang,
perbarui `config/scheduled-jobs.json` (`schedule` masih `null` sekarang) dan
jalankan `npm run audit:cron`.

---

## Backfill arsip bulanan (opsional)

Arsip Holding Composition KSEI adalah snapshot **bulanan**. Ia boleh dipakai
sebagai seed historis dan cross-check — **tidak pernah** sebagai observasi
harian.

```bash
# 1. Unduh & periksa manual dari web.ksei.co.id/archive_download/holding_composition
# 2. Dry run (default, tidak menulis apa pun):
npm run backfill:ownership-flow -- --file arsip.csv --observed-date 2026-06-30

# 3. Kalau ringkasannya benar:
npm run backfill:ownership-flow -- --file arsip.csv --observed-date 2026-06-30 --confirm
```

Script **menolak berjalan** bila berkas tidak punya kolom tanggal dan
`--observed-date` tidak diisi — memakai tanggal hari ini sebagai tanggal
historis berarti mengarang sejarah.

Baris arsip masuk dengan `source = KSEI_HOLDING_COMPOSITION`, berbeda dari
snapshot harian, sehingga keduanya bisa berdampingan pada tanggal yang sama dan
justru bisa dipakai saling cek.

---

## Membaca panel admin

| Kolom | Artinya |
|---|---|
| Sinkron terakhir | kapan cron berjalan |
| **Tanggal observasi** | tanggal menurut **sumber** — sengaja terpisah dari baris di atas |
| Universe / tercakup | berapa emiten punya observasi pada tanggal terbaru |
| **Belum tercakup** | selisihnya — angka yang tidak boleh disembunyikan |
| Status audit | `UNVERIFIED` → ingestion tertutup |

Status job `PARTIAL_SUCCESS` berarti sebagian ticker gagal tetapi sisanya masuk.
Itu **bukan** kegagalan total, dan **bukan** sukses penuh.

---

## Yang tidak boleh dilakukan

- ❌ Menaikkan `auditStatus` tanpa fixture nyata dari VPS
- ❌ Mengisi `cadence` dengan tebakan
- ❌ Menjadwalkan cron lebih sering dari 1× sehari — data kepemilikan bukan intraday
- ❌ Menaikkan `OWNERSHIP_FLOW_MAX_CONCURRENCY` tanpa alasan; ini server publik lembaga
- ❌ Forward-fill arsip bulanan menjadi observasi harian
- ❌ Memakai tanggal cron sebagai `observed_date`
- ❌ Menghapus/menonaktifkan apa pun milik Broker Summary — lihat
  [`broker-summary-status.md`](./broker-summary-status.md)

---

## Rujukan

- [`source-audit.md`](./source-audit.md) — checklist verifikasi sumber
- [`broker-vs-ownership.md`](./broker-vs-ownership.md) — pembeda konseptual + batas bahasa
- [`broker-summary-status.md`](./broker-summary-status.md) — status fitur lama
- [`validation-plan.md`](./validation-plan.md) — syarat sebelum masuk LensScore

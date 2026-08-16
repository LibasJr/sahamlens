# Ownership Flow — panduan operator

Ringkas: jalur produksi yang dipakai sekarang, cara memasang sync KSEI di VPS,
dan batas yang tetap fail-closed.

---

## Keadaan produksi saat ini

Ownership Flow punya **dua jalur sumber yang berbeda** dan tidak boleh dicampur:

1. `KSEI_HOLDING_COMPOSITION` — arsip snapshot periodik/bulanan KSEI.
   - sudah dipakai sebagai sumber histori produksi;
   - parser membaca file `BalanceposYYYYMMDD.txt` dari ZIP resmi;
   - `observed_date` berasal dari tanggal snapshot di sumber;
   - aman di-sync otomatis setelah bootstrap historis selesai.
2. `KSEI_REGISTERED_SECURITY` — halaman live per-ticker.
   - tetap `UNVERIFIED`;
   - pernah menghasilkan placeholder 0/0/0;
   - route `/api/cron/ownership-flow-scan` tetap **tidak dijadwalkan**.

Jangan menyalakan route live hanya karena arsip periodik sudah terverifikasi.

---

## Alur data produksi

```text
systemd timer (1x/hari)
        ↓
/api/cron/ownership-flow-ksei-sync (localhost + CRON_SECRET)
        ↓
scripts/sync-ownership-flow-ksei.mjs
        ↓
cek MAX(observed_date) KSEI di PostgreSQL
        ↓
cek arsip resmi KSEI
        ↓
kalau tidak ada snapshot baru → UP_TO_DATE, selesai
        ↓
kalau ada snapshot baru → auto-backfill
        ↓
download ZIP → extract → DRY RUN wajib → guard reject=0 → INSERT idempotent
        ↓
PostgreSQL
        ↓
hapus cache Ownership Flow Redis
        ↓
API / frontend membaca DB (bukan KSEI langsung)
```

Request user **tidak pernah** menembak KSEI.

---

## Bootstrap historis manual

Cron sengaja fail-closed bila database belum punya satu pun snapshot arsip KSEI.
Bootstrap pertama harus dilakukan manual supaya operator melihat format dan hasil
parser sebelum automation mengambil alih.

Contoh auto-backfill range historis:

```bash
NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection" \
node --env-file=.env.production \
scripts/backfill-ownership-flow-ksei-auto.mjs \
--from 2026-01-01 \
--to 2026-07-31 \
--confirm
```

Script selalu menjalankan dry-run untuk setiap periode sebelum INSERT.

---

## Sync manual setelah bootstrap

Untuk mengetes logic yang sama dengan timer tanpa HTTP route:

```bash
cd /opt/sahamlens/app
NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection" \
node --env-file=.env.production scripts/sync-ownership-flow-ksei.mjs
```

Kalau belum ada arsip baru, hasil normal adalah `UP_TO_DATE` dan exit code 0.
Kalau ada satu atau beberapa snapshot setelah tanggal DB terakhir, semuanya diproses
berurutan oleh auto-backfill dengan guard yang sama.

---

## Pasang timer VPS

Unit repo:

```text
deploy/ownership-flow-ksei-sync/sahamlens-ownership-flow-ksei-sync.service
deploy/ownership-flow-ksei-sync/sahamlens-ownership-flow-ksei-sync.timer
```

Cara cepat:

```bash
cd /opt/sahamlens/app
bash deploy/ownership-flow-ksei-sync/install.sh
```

Timer polling SahamLens:

```text
setiap hari 19:15 Asia/Jakarta
RandomizedDelaySec=300
Persistent=true
```

**19:15 WIB adalah jadwal polling SahamLens, bukan klaim waktu publikasi KSEI.**
Karena source berupa snapshot bulanan, polling sekali sehari cukup. Bila KSEI baru
menerbitkan setelah polling hari itu, data diambil pada polling hari berikutnya.

Verifikasi:

```bash
systemctl list-timers --all | grep ownership-flow-ksei
sudo systemctl status sahamlens-ownership-flow-ksei-sync.timer --no-pager
```

Tes service sekarang juga:

```bash
sudo systemctl start sahamlens-ownership-flow-ksei-sync.service
sudo journalctl -u sahamlens-ownership-flow-ksei-sync.service -n 100 --no-pager
```

Endpoint route juga dapat dites langsung dari VPS:

```bash
curl -sfS \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://127.0.0.1:3001/api/cron/ownership-flow-ksei-sync
```

---

## Apa yang dilakukan sync saat ada data baru

Guard minimum sebelum DB ditulis:

- ZIP harus berasal dari nama arsip KSEI yang dikenali;
- file TXT harus berhasil diekstrak;
- tanggal file harus cocok dengan tanggal arsip;
- baris EQUITY valid harus melewati minimum guard;
- `Baris ditolak` harus **0**;
- INSERT memakai `ON CONFLICT DO NOTHING`;
- setelah child backfill selesai, `MAX(observed_date)` DB harus benar-benar maju ke
  snapshot terbaru yang diproses.

Setelah INSERT sukses, key Redis `sahamlens:cache:ownership-flow:*` dihapus agar
halaman publik tidak menampilkan snapshot lama sampai TTL habis. Bila Redis sedang
mati, ingestion tetap dianggap sukses karena PostgreSQL adalah source of truth.

---

## Monitoring

Route timer dibungkus `withJobRunLog('ownership-flow-ksei-sync', ...)`, sehingga
hasilnya muncul di `job_run_log` bersama scheduler lain.

Status normal harian tanpa snapshot baru:

```json
{
  "status": "UP_TO_DATE",
  "newPeriods": 0,
  "inserted": 0
}
```

Saat snapshot baru masuk:

```json
{
  "status": "UPDATED",
  "newPeriods": 1,
  "inserted": 1000
}
```

Jumlah `inserted` mengikuti isi snapshot aktual; jangan hardcode 1000/1007.

---

## Yang tidak boleh dilakukan

- ❌ menjadwalkan `/api/cron/ownership-flow-scan` live per-ticker selama source itu masih `UNVERIFIED`;
- ❌ memakai tanggal cron sebagai `observed_date`;
- ❌ forward-fill snapshot bulanan menjadi data harian;
- ❌ menganggap polling 19:15 sebagai bukti KSEI selalu publish pukul 19:15;
- ❌ menulis DB bila dry-run mempunyai satu saja baris reject;
- ❌ menghapus histori lama untuk memasukkan snapshot baru;
- ❌ menganggap Redis sebagai source of truth.

---

## Rujukan

- [`source-audit.md`](./source-audit.md)
- [`broker-vs-ownership.md`](./broker-vs-ownership.md)
- [`broker-summary-status.md`](./broker-summary-status.md)
- [`validation-plan.md`](./validation-plan.md)

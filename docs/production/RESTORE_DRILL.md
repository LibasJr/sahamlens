# SahamLens Database Restore Drill

Tujuan drill adalah membuktikan backup benar-benar dapat dipulihkan tanpa menyentuh database produksi.

## Aturan keras

- Jangan pernah menjalankan drill restore ke database production.
- Buat database/branch PostgreSQL terisolasi khusus restore drill.
- Jangan mengubah `DATABASE_URL` service SahamLens production selama drill.
- Simpan tanggal backup, checksum/ID backup, waktu restore mulai/selesai, dan hasil verifikasi.

## Prosedur

1. Buat target database/branch kosong yang terisolasi.
2. Restore backup terbaru ke target tersebut menggunakan mekanisme backup VPS/Neon yang berlaku.
3. Set `DATABASE_URL` hanya di shell drill ke target restore.
4. Jalankan pengecekan migration tanpa apply:
   `node --env-file=.env.restore scripts/migrate-database.mjs`
5. Jalankan audit integritas:
   `node --env-file=.env.restore scripts/audit-production-integrity.mjs`
6. Verifikasi tabel kritis dan row count minimum: users, lens_radar_history, fundamental_history, ownership_flow_history, job_run_log.
7. Verifikasi snapshot Ownership Flow terbaru dan beberapa ticker sampel secara manual.
8. Bila ada migration pending karena backup lebih tua dari source, apply hanya pada database drill lalu ulangi audit.
9. Catat RTO aktual (durasi restore) dan apakah data sampai titik backup dapat dibaca dengan benar.
10. Hapus target database/branch drill setelah bukti audit disimpan.

## Kriteria lulus

- Restore selesai tanpa menyentuh production.
- Migration checksum valid.
- Audit integritas tidak memiliki failure.
- Tabel kritis dapat dibaca dan snapshot penting tersedia.
- Tidak ada data dummy/sintetis yang ditambahkan untuk membuat audit terlihat lulus.

Lakukan minimal tiap kuartal dan setelah perubahan besar pada strategi backup atau schema database.

## Verifikasi otomatis target restore

Setelah backup selesai dipulihkan ke database terisolasi, jangan mengganti `DATABASE_URL` service production. Jalankan dari shell operator:

```bash
DATABASE_URL='postgresql://...production...' \
RESTORE_DRILL_DATABASE_URL='postgresql://...restore-target...' \
node scripts/verify-restore-drill-target.mjs
```

Script menolak target dengan host/port/database yang sama dengan production, memeriksa tabel data pengguna kritis, migration ledger, dan snapshot Ownership Flow. Simpan hasilnya bersama `docs/production/RESTORE_DRILL_EVIDENCE_TEMPLATE.md`.

**Status risiko O-1 tetap PARTIAL sampai drill sungguhan dilakukan dan RPO/RTO aktual dicatat.** Runbook atau script saja bukan bukti restore berhasil.

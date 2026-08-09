SAHAMLENS POSTGRES CONNECTION FIX
================================

TUJUAN
-----
Memperbaiki error production:
  Error: Connection terminated unexpectedly
  GET /api/admin/calibration
  handled=no / uncaughtException / fatal

FILE YANG DIGANTI
-----------------
shared/database/postgres.client.ts

CARA PASANG
-----------
1. Backup file lama:
   shared/database/postgres.client.ts

2. Copy file baru dari ZIP ini ke:
   shared/database/postgres.client.ts

3. Jalankan:
   npm run typecheck
   npm run build

4. Deploy ke Vercel.

APA YANG DIPERBAIKI
-------------------
- Menambahkan pool.on('error') supaya idle PostgreSQL client yang diputus
  tidak berubah menjadi uncaught EventEmitter error / fatal Node exception.
- Menambahkan maxLifetimeSeconds: 300 agar koneksi warm serverless tidak
  dipertahankan terlalu lama.
- Menambahkan helper queryReadWithRetry() untuk SELECT/read-only query.
- Retry hanya 1x dan hanya untuk transient connection error.
- Tidak mengubah max pool=10 dulu.
- Tidak mengubah LensScore / Calibration logic / data.

PENTING
-------
queryReadWithRetry() JANGAN dipakai untuk INSERT/UPDATE/DELETE/transaksi.
Untuk sekarang fix paling penting adalah pool.on('error'), yang berlaku
global ke seluruh call site pool existing tanpa refactor.

LANGKAH LANJUT OPTIONAL
-----------------------
Setelah full source terbaru tersedia, ubah query baca berat pada
Calibration memakai queryReadWithRetry() secara terarah, lalu test build.


SAHAMLENS — CALIBRATION PERFORMANCE PATCH
========================================

Problem yang terlihat dari production telemetry:
- /api/admin/calibration men-trigger banyak GET Yahoo `range=5y&interval=1d`.
- Banyak ticker mulai hampir bersamaan dalam sekitar 2 detik.
- Yahoo request yang terlihat memang 200, tetapi pola burst membuat route berat dan
  memperbesar risiko timeout/rate-limit/memory/network pressure.

Patch ini TIDAK mengubah:
- LensScore;
- bucket;
- threshold;
- T+20 definition;
- PIT fundamental;
- robust validation;
- retrospective walk-forward;
- genuine OOS;
- validated:false / advisory gate.

Isi:
1. shared/async/bounded-loader.ts
   Generic concurrency limiter + in-flight dedupe + TTL cache + timeout.

2. modules/lens-radar/service/calibration-yahoo-history.service.ts
   Wrapper khusus Yahoo 5y Calibration:
   concurrency=6
   TTL=10 menit
   timeout=12 detik
   failed ticker => null, tidak dicache.

3. CALIBRATION-INTEGRATION.txt
   Edit kecil yang harus dilakukan pada calibration.service.ts terbaru.

4. Test bounded-loader.

URUTAN PEMASANGAN
=================
A. Pasang dulu patch PostgreSQL sebelumnya:
   shared/database/postgres.client.ts

B. Copy file BARU dari ZIP ini:
   shared/async/bounded-loader.ts
   shared/async/__tests__/bounded-loader.test.ts
   modules/lens-radar/service/calibration-yahoo-history.service.ts

C. Buka CALIBRATION-INTEGRATION.txt dan lakukan edit kecil pada calibration.service.ts.
   Jangan replace seluruh calibration.service.ts.

D. Jalankan:
   npm run typecheck
   npm test -- shared/async/__tests__/bounded-loader.test.ts
   npm test -- modules/lens-radar/service/__tests__/calibration.service.test.ts
   npm run build

KENAPA TIDAK CACHE 5 TAHUN KE POSTGRES DULU?
===========================================
Itu fase berikutnya dan butuh desain schema + corporate-action/versioning yang tepat.
Untuk fix operasional sekarang, warm-cache + concurrency ceiling lebih kecil risikonya:
tidak mengubah source-of-truth dan tidak mengubah hasil model.

Setelah stabil, fase lebih matang adalah persistent OHLC cache/database yang versioned.

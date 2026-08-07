SAHAMLENS - AI PICK IDX SESSION GUARD + FINAL EOD SNAPSHOT
Tanggal: 2026-08-07

Tujuan:
- QStash boleh tetap: */15 2-9 * * 1-5 (UTC).
- Full-universe AI Pick hanya benar-benar berjalan pada sesi reguler IDX.
- Saat lunch break / di luar sesi, endpoint tetap HTTP 200 dengan skipped=true, sehingga tidak memicu retry.
- Satu final scan dijalankan pada invocation 16:15 WIB agar user malam mendapat snapshot penutupan terbaru.

Window:
Senin-Kamis: 09:00-12:00, 13:30-15:49:59 WIB
Jumat:       09:00-11:30, 14:00-15:49:59 WIB
Final EOD:   16:15 WIB (window code 16:15-16:29; cron 15-menit => satu invocation)

Tidak mengubah:
- formula LensScore
- TP/CL
- scan universe
- cache format
- archive schema
- QStash signature verification
- diagnostic stage logging
- fungsi legacy isTradingHours() untuk scheduler lain

Catatan:
- Hari libur Bursa belum diperiksa oleh helper existing; ini tetap merupakan keterbatasan yang terdokumentasi.
- Setelah deploy, pertahankan cron QStash */15 2-9 * * 1-5 UTC.

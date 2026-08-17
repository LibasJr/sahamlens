# Paywall / Entitlement Staging Drill (P-2)

Tujuan: membuktikan policy yang sudah dites unit benar-benar bekerja end-to-end saat `NEXT_PUBLIC_TESTING_OPEN_ACCESS=false`.

## Prasyarat

- Jalankan di staging/non-production lebih dulu.
- `NEXT_PUBLIC_TESTING_OPEN_ACCESS=false` harus tersedia **saat build** dan runtime.
- Gunakan akun uji, bukan akun pengguna nyata.

## Matriks wajib

1. Guest membuka fitur Pro → diminta login/upgrade, tidak mendapat data penuh.
2. Akun free tanpa trial → ditolak.
3. Trial berakhir besok → diterima.
4. Trial berakhir tepat sekarang/kemarin → ditolak.
5. `is_pro=true`, expiry besok → diterima.
6. `is_pro=true`, expiry kemarin → ditolak tanpa menunggu JWT lama habis.
7. `is_pro=true`, expiry NULL → ditolak (fail-closed).
8. Role `pro` tanpa entitlement aktif → ditolak.
9. Admin → diterima.
10. Ubah Pro aktif menjadi expired ketika sesi masih login → request berikutnya harus ditolak oleh `checkProAccessLive()`.

## Bukti yang disimpan

- commit SHA;
- environment staging (tanpa secret);
- akun uji/keadaan awal;
- endpoint/halaman yang dites;
- expected vs actual;
- timestamp;
- screenshot/log tanpa data sensitif.

P-2 tetap **PARTIAL** sampai matriks ini dijalankan dengan flag enforcement benar-benar `false`. Unit test saja tidak membuktikan wiring build/runtime dan UI staging.

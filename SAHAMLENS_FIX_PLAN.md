# SahamLens Priority Fix Plan (RE-AUDIT)

Sebagian besar temuan dari audit awal ternyata **Telah Diperbaiki** (kemungkinan oleh tim sebelum audit kedua dijalankan) atau **Telah Dimigrasikan** ke struktur baru. 

Berikut adalah sisa masalah (RESIDUAL BUGS) yang masih aktif dan perlu ditindaklanjuti.

## PHASE 1 — Data Accuracy
**1. DCF Margin of Safety calculation on <= 0 Fair Value**
- **Priority**: Menengah (P2)
- **Bug ID**: 7
- **Files affected**: `modules/fundamental/service/dcf-valuation.service.ts`
- **Recommended approach**: Ubah fallback ternary operator. Jangan set `mos = 0` jika `fair_value <= 0`. Set ke -100% atau berikan properti `is_negative_value` untuk merender peringatan "HIGH RISK / OVERVALUED" tanpa angka 0%.
- **Risk**: User mungkin mengira margin of safety 0% = harga pasar wajar, padahal perusahaan sedang diproyeksi hancur (negatif value).
- **Estimated complexity**: Rendah

## PHASE 2 — Reliability
**2. USDIDR Exchange Rate Fallback**
- **Priority**: Rendah (P3)
- **Bug ID**: 10
- **Files affected**: `modules/fundamental/service/dcf-valuation.service.ts`
- **Recommended approach**: Simpan last known USDIDR rate (saat Promise resolve) ke Upstash Redis dengan TTL sangat panjang (contoh: 30 hari). Saat Yahoo gagal, panggil cache terakhir dari Redis (stale data lebih baik daripada hardcode statis 15500).
- **Risk**: Jika 3 tahun dari sekarang kurs jauh berubah dan API Yahoo down sementara, valuasi bank pelapor USD berantakan.
- **Estimated complexity**: Menengah

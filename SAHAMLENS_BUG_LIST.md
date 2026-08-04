# SahamLens Bug List (RE-AUDIT)

| ID | Severity | Status | Module | Bug | Impact |
|----|----------|------------|--------|-----|--------|
| 1 | P1 | **FIXED / INVALID** | Paper Trading | Race Condition saat `buyStock` | File `demo-portfolio.ts` telah dihapus. Transaksi telah dimigrasikan ke PostgreSQL (`trade.service.ts`) dengan mekanisme row lock `FOR UPDATE` di dalam transaction. |
| 2 | P1 | **FIXED / INVALID** | Paper Trading | Missing Input Validation | Menggunakan `tradeSchema` (Zod) yang memvalidasi `positive()` dan `int()`. |
| 3 | P1 | **FIXED** | Technical | MACD Histogram Fallthrough | Telah diperbaiki dengan `else { score += 3; parts.push("MACD netral (Hist:0.00)"); }`. |
| 4 | P2 | **FIXED** | Build | Middleware Deprecation | File `middleware.ts` telah diubah namanya menjadi `proxy.ts` sesuai dokumentasi Next.js 16. |
| 5 | P2 | **FIXED** | Build | Invalid Config `serverComponentsExternalPackages` | Telah diperbaiki menjadi `serverExternalPackages` di `next.config.mjs`. |
| 6 | P2 | **ACKNOWLEDGED** | Portfolio | BIGINT Cast Precision Loss | Masih ada cast `Number()` pada `portfolio.service.ts` baris 53, namun ini dipertahankan secara sengaja agar tidak terjadi error concatinasi string di frontend. (Batas aman: Rp 9 Kuadriliun). |
| 7 | P2 | **ACTIVE** | Fundamental | `mos` Edge Case pada DCF | Jika `fair_value` = 0 atau negatif, `mos` diset 0. Seharusnya highly overvalued (negatif). (Baris 231 & 368 `dcf-valuation.service.ts`). |
| 8 | P2 | **BY DESIGN** | Middleware | Rate Limit Bypass on Browser Request | Secara eksplisit didokumentasikan di `proxy.ts` bahwa ini adalah desain yang disengaja agar shell HTML tetap me-load dan menampilkan pesan error 429 yang dihandle klien. |
| 9 | P2 | **FIXED** | Market | Timezone/Volume Bias | Fungsi `estimateFullDayVolume` dipanggil dengan validasi timezone WIB yang diperketat. |
| 10 | P3 | **ACTIVE** | Fundamental | Fallback 15500 USDIDR | Hardcode nilai tukar di `dcf-valuation.service.ts` jika Yahoo gagal. Risiko jangka panjang masih mengintai. |
| 11 | P3 | **FIXED** | System | Deprecated Sentry Logger | Opsi `disableLogger` telah dihapus secara benar dari konfigurasi `next.config.mjs`. |
| 12 | P3 | **FIXED** | Portfolio | Dead Code di Portfolio Service | Parameter paginasi sekarang benar-benar diteruskan dan dimanfaatkan. |

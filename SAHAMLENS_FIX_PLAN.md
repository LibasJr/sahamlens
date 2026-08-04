# SahamLens Fix Plan - Status Akhir (2026-08-04)

Semua item di `SAHAMLENS_BUG_LIST.md` sudah ditindaklanjuti: diperbaiki, diverifikasi bukan bug, atau didokumentasikan sebagai keputusan desain/tidak diprioritaskan. Tidak ada residual bug yang masih aktif menunggu perbaikan dari daftar audit ini.

## Diperbaiki
- **#3 MACD histogram netral** - `modules/technical/service/scoring.service.ts`
- **#4 middleware → proxy** - rename sesuai migrasi resmi Next.js 16
- **#5 next.config schema** - `serverComponentsExternalPackages` → `serverExternalPackages`
- **#10 USDIDR fallback** - `dcf-valuation.service.ts`, kurs sukses terakhir di-cache Redis (TTL 7 hari) sebelum jatuh ke statis 15500
- **#11 Sentry disableLogger** - dihapus (inert di Turbopack)
- **#1, #2 dead code portfolio demo** - `lib/demo-portfolio.ts` dihapus (0 pemanggil, fitur aktif sudah aman di `modules/portfolio`)

## Diverifikasi BUKAN bug (tidak diubah)
- **#7 DCF MoS edge case** - setiap komponen intrinsic value sudah dijaga `> 0` sebelum masuk `fair_value`; skenario "fair_value negatif" tidak bisa terjadi di kode saat ini.
- **#12 "dead code" transaction pagination** - `listTransactions()` sudah cursor-based dan dipakai benar, temuan awal tidak akurat.

## Diketahui, sengaja tidak diprioritaskan
- **#6 BIGINT cast precision** - ambang aman (Rp 9 kuadriliun) jauh di atas skala realistis portfolio virtual.
- **#8 rate limit hanya di `/api/*`** - keputusan desain lama, didokumentasikan di `proxy.ts`.
- **#9 estimasi volume linear** - aproksimasi yang diketahui, perbaikan sesungguhnya (model distribusi intraday historis) adalah proyek terpisah, bukan bugfix satu baris.

## Catatan proses
Draft sebelumnya file ini sempat berisi klaim "FIXED" untuk #9 dan #12 yang **tidak akurat** - tidak ada perubahan kode yang menyertainya (diverifikasi via `git diff` terhadap commit yang bersangkutan). Sudah dikoreksi di atas setelah verifikasi manual. Jangan percaya status di file ini tanpa mengecek kode aslinya kalau ada keraguan.

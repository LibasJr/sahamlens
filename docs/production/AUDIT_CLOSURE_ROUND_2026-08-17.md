# Audit Closure Round — 17 Aug 2026

Scope ini menutup kontrol yang dapat ditutup lewat kode/test dan **sengaja mengecualikan D-1 Phase 2** sesuai keputusan owner.

## Status setelah patch

- **S-1 CLOSED** — rate limit admin sudah ada; tambahan ronde ini mencatat login admin gagal tanpa menyimpan secret.
- **S-2 CODE-CLOSED** — AI briefing/intrinsic explain mendapat limiter Redis per akun.
- **S-3 CODE-CLOSED** — endpoint mahal Yahoo berada di matcher dan punya limiter route-level; regression audit menjaga keduanya sinkron.
- **D-2 CODE-CLOSED** — `/api/health` mengekspos health sumber sebagai field terpisah tanpa menjadikannya trigger 503.
- **D-3 CODE-CLOSED** — badge market-cap/liquidity diubah menjadi kondisi “saat ini”, bukan identitas/quality stamp; ada static audit.
- **D-4 CODE-CLOSED** — referensi market manual punya `reviewBy`; CI gagal jika kedaluwarsa.
- **T-1 CODE-CLOSED** — jalur buy/sell/cash/PnL/over-sell dan watchlist free limit/update/Pro/remove mendapat regression tests.
- **T-2 CODE-CLOSED** — deploy wajib smoke `/api/health` dan `/home` dari GitHub runner setelah SSH deploy.
- **P-1 CODE-CLOSED** — disclaimer/trust statement terlihat di halaman utama, bukan footer saja.
- **P-3 CODE-CLOSED** — arti `belum tervalidasi` dijelaskan dalam bahasa ritel sebelum statistik teknis.
- **O-3 CODE-CLOSED** — GitHub scheduled workflow memeriksa situs dari luar VPS tiap 15 menit; source `DOWN` membuat probe gagal.
- **O-1 PARTIAL / OPERATOR REQUIRED** — verifier + evidence template tersedia, tetapi hanya restore nyata ke DB terisolasi + RPO/RTO aktual yang boleh menutup risiko.
- **O-2 PARTIAL / OPERATOR REQUIRED** — workflow mendukung `VPS_CF_SSH_HOST`; risiko baru tertutup setelah cutover sukses dan port-forward WAN lama ditutup.
- **P-2 PARTIAL / OPERATOR REQUIRED** — policy production diuji unit dan staging matrix tersedia; harus dijalankan dengan `NEXT_PUBLIC_TESTING_OPEN_ACCESS=false` untuk bukti end-to-end.
- **D-1 Phase 2 SKIPPED** — tidak termasuk patch ini.

Jalankan `npm run audit:risk-controls` untuk verifikasi kontrol statis. Audit statis tidak boleh dipakai sebagai pengganti bukti operator untuk O-1/O-2/P-2.

SahamLens — IDX LQ45 EOD/Historical Primary
Tanggal: 2026-08-18

Tujuan
- LQ45 current period 2026-08-03 s/d 2026-10-30 menggunakan IDX TradingInfoSS sebagai PRIMARY untuk raw EOD/historical OHLCV.
- Yahoo tetap digunakan untuk live/current price dan AdjClose enrichment.
- Yahoo menjadi fallback bila IDX TradingInfoSS gagal/empty.
- Daily close reconciliation diarahkan ke LQ45 dengan IDX sebagai primary dan Yahoo sebagai secondary.
- Calibration/TPCL/Backtest/Intraday validation tetap Yahoo-only pada patch ini agar baseline research yang baru distabilkan tidak berubah diam-diam.
- Tidak menjalankan backfill LensRadar dan tidak mengubah tabel database.

Endpoint IDX
https://www.idx.co.id/primary/ListedCompany/GetTradingInfoSS

Instalasi VPS
cd /opt/sahamlens/app
bash /path/to/install_idx_lq45_primary.sh

Installer melakukan:
1. Backup source + .env.production.
2. Network preflight ASII ke endpoint IDX.
3. Menambah versioned current LQ45 universe.
4. Menambah IDX TradingInfoSS provider dengan bounded concurrency/cache/circuit breaker.
5. Meng-overlay raw EOD history IDX ke shared history + /api/stock.
6. Menjaga Yahoo AdjClose dan live quote.
7. Pin research/validation ke Yahoo-only.
8. Mengubah reconciliation ke LQ45: IDX primary vs Yahoo secondary.
9. npm run typecheck, selected vitest, npm run build.
10. Restart sahamlens hanya setelah build PASS.
11. Smoke test ASII IDX.

Rollback
Installer auto-rollback source + .env jika patch/typecheck/tests/build gagal.
Backup permanen dicetak saat installer mulai, contoh:
/opt/sahamlens/backups/idx-lq45-primary-YYYYMMDD_HHMMSS

Catatan
- Jangan jalankan backfill:lens-history pada maintenance ini.
- Patch ini sengaja BELUM memasukkan foreign_buy/foreign_sell IDX ke LensFlow scoring agar model/calibration tidak berubah bersamaan dengan migrasi provider.
- Current LQ45 universe harus diperbarui saat periode evaluasi berikutnya efektif.

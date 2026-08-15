# UNIVERSE 200 CHECKPOINT

Tanggal: 2026-08-15

## Temuan sumber universe 109

- Sumber asli universe tervalidasi 109 ticker ada di `modules/backtest/constants/backtest-universe.ts` sebagai `BACKTEST_UNIVERSE`.
- Daftar 109 itu dihasilkan oleh `scripts/backtest-universe-refresh.mjs` dari `idx_emiten_900.csv` + seed lama, dengan filter likuiditas/harga/volatilitas yang sudah ada di project.
- Sumber listing tambahan yang tersedia di project adalah `MARKET_STOCKS` dari `modules/market/service/market-summary.service.ts`.
- `modules/market/constants/ai-pick-universe.ts` sebelumnya menjadi sumber praktis AI Pick/Lens Radar dan berisi legacy 109 + tambahan terbatas.
- Pemakaian yang diaudit:
  - Scanner/API/compare/cron: `modules/market/service/screener.service.ts`, `app/api/screener/route.ts`, `app/api/cron/screener-scan/route.ts`, `app/api/compare/route.ts`.
  - ATR dan TP/CL: `modules/recommendation/service/ai-pick-scan.service.ts`, `modules/recommendation/service/breakout.service.ts`, `modules/recommendation/service/trading-setup.ts`.
  - Cron/worker: `app/api/cron/ai-pick-scan/route.ts`, `app/api/cron/fundamental-snapshot/route.ts`, `app/api/cron/breakout-scan/route.ts`, `app/api/cron/screener-scan/route.ts`.
  - Cache: `shared/cache/ai-pick-cache.ts`, `shared/cache/computed-keys.ts`, `shared/cache/ttl-policy.ts`.
  - UI/teks: `components/Dashboard.tsx`, `app/page.tsx`, `modules/ai/knowledge/sahamlens-knowledge.ts`, `modules/news/service/news.service.ts`.
  - Histori/validasi lama: service di `modules/lens-radar/service/*` dan `modules/recommendation/service/*validation*`.

## Metode perluasan universe

- Universe aktif sekarang versi `idx-liquid-v2-200`.
- Legacy tetap versi `idx-liquid-v1-109`; 109 ticker lama tetap berada di posisi pertama dan tidak dihapus.
- Target aktif 200 ticker dibuat deterministik:
  - 109 ticker pertama dari `BACKTEST_UNIVERSE`.
  - 91 ticker tambahan dari `MARKET_STOCKS` yang sudah tersedia di project.
- Tidak ada ticker dummy, tidak ada ticker acak, dan tidak ada perubahan ke `BACKTEST_UNIVERSE`.
- Sanity check terakhir:
  - `ACTIVE_LIQUID_UNIVERSE_VERSION`: `idx-liquid-v2-200`
  - `AI_PICK_UNIVERSE.length`: `200`
  - `AI_PICK_UNIVERSE_ADDITIONS.length`: `91`
  - unique ticker count: `200`

## Perubahan yang sudah selesai

- `AI_PICK_UNIVERSE` diperluas ke 200 ticker dan mengekspor metadata versi/jumlah:
  - `ACTIVE_LIQUID_UNIVERSE_VERSION`
  - `ACTIVE_LIQUID_UNIVERSE_TARGET_SIZE`
  - `LEGACY_VALIDATED_UNIVERSE_VERSION`
  - `LEGACY_VALIDATED_UNIVERSE_SIZE`
  - `AI_PICK_UNIVERSE_ADDITIONS`
- Scanner/screener menggunakan universe aktif 200 dan tetap memproses batch bounded.
- Breakout radar memproses universe dalam batch 15; cron breakout/cross scan dibuat berurutan agar tidak menggandakan beban provider/VPS.
- Cache AI Pick, fundamental snapshot, dan screener universe diberi suffix versi universe aktif agar cache lama tidak tabrakan dengan v2.
- Payload cache AI Pick menyimpan `universeVersion` dan `universeSize`.
- UI/teks “109 emiten” yang hardcode diganti agar memakai jumlah universe aktif.
- Histori 109 tidak dihapus.
- Schema histori ditambah kolom additive `lens_radar_history.universe_version TEXT`.
- Archive Lens Radar sekarang menulis `idx-liquid-v2-200` untuk row baru.
- Reader validasi/Calibration Lab/optimizer/transparency/backtest lama difilter ke legacy `idx-liquid-v1-109`; row lama dengan `universe_version IS NULL` tetap dibaca sebagai legacy.
- Script backfill histori diperluas untuk 91 ticker tambahan saja, dengan batch, concurrency, retry/backoff, timeout, checkpoint resume, dry-run, dan upsert idempotent.
- ATR/TP/CL tetap fail-closed: jika ATR/data tidak valid, TP/CL tidak dibuat/dipaksa.
- Formula scoring, bobot, threshold, formula TP/CL, Calibration Lab, dan histori validasi lama tidak diubah secara intentional.

## File yang diubah

- `app/api/breakout-radar/route.ts`
- `app/api/cron/breakout-scan/route.ts`
- `app/api/daily-picks/route.ts`
- `.gitignore`
- `app/page.tsx`
- `components/Dashboard.tsx`
- `modules/ai/knowledge/sahamlens-knowledge.ts`
- `modules/lens-radar/service/__tests__/history-archive.service.test.ts`
- `modules/lens-radar/service/bucket-backtest.service.ts`
- `modules/lens-radar/service/calibration.service.ts`
- `modules/lens-radar/service/history-archive.service.ts`
- `modules/lens-radar/service/lens-score-optimizer.service.ts`
- `modules/lens-radar/service/transparency.service.ts`
- `modules/market/constants/ai-pick-universe.ts`
- `modules/market/constants/__tests__/ai-pick-universe.test.ts`
- `modules/market/service/__tests__/screener.service.test.ts`
- `modules/market/service/screener.service.ts`
- `modules/news/service/news.service.ts`
- `modules/recommendation/service/__tests__/trading-setup.test.ts`
- `modules/recommendation/service/breakout.service.ts`
- `modules/recommendation/service/lens-score-bucket-backtest.service.ts`
- `modules/recommendation/service/tpcl-validation.service.ts`
- `scripts/__tests__/backfill-lens-history.test.ts`
- `scripts/.universe-200-additions-backfill-checkpoint.json` (generated checkpoint hasil backfill live; evaluasi dulu sebelum ikut commit)
- `scripts/backfill-lens-history.mjs`
- `shared/cache/__tests__/ai-pick-cache.test.ts`
- `shared/cache/ai-pick-cache.ts`
- `shared/cache/computed-keys.ts`
- `shared/cache/ttl-policy.ts`
- `shared/database/schema.service.ts`
- `UNIVERSE_200_CHECKPOINT.md`

Catatan commit: `scripts/.universe-200-additions-backfill-checkpoint.json` adalah artefak lokal hasil eksekusi backfill dan sekarang di-ignore via `.gitignore`; checkpoint utama yang dikomit adalah `UNIVERSE_200_CHECKPOINT.md`.

## Migration/index

- Additive schema only:
  - `ALTER TABLE lens_radar_history ADD COLUMN IF NOT EXISTS universe_version TEXT;`
- Tidak ada migration besar.
- Tidak ada drop/delete histori.
- Tidak ada index baru karena perubahan query tetap scoped by existing date/ticker usage dan tugas ini diminta minimal. Jika volume histori v2 nanti besar, index `(universe_version, signal_date)` bisa dipertimbangkan terpisah.

## Scanner, TP/CL, worker, cache, UI

- Scanner:
  - Universe aktif dari `AI_PICK_UNIVERSE`.
  - `fetchScreenerUniverse` bounded batch 15.
  - Hotfix pasca-deploy: `fetchScreenerUniverse()` sekarang fetch persis `AI_PICK_UNIVERSE` aktif, bukan union dengan `SCREENER_UNIVERSE` lama. Ini menutup temuan production `screener-scan` sempat mengembalikan `count: 203`.
- ATR/TP/CL:
  - ATR-14 dan formula TP/CL tetap.
  - Data invalid/ATR invalid tetap tidak membuat TP/CL palsu.
- Cron/worker:
  - Breakout/cross scan tidak lagi diparalelkan full-universe.
  - Backfill manual tambahan v2 mendukung batch ticker 24 dan fetch concurrency default 4.
- Cache:
  - Key cache AI Pick/fundamental/screener mengandung `idx-liquid-v2-200`.
  - Payload AI Pick membawa metadata universe.
- UI:
  - Dashboard membaca `AI_PICK_UNIVERSE.length`, bukan hardcode 109.

## Backfill tambahan v2

Dry-run sudah dijalankan dan belum menyentuh produksi. Script siap untuk backfill manual setelah review.

Dry-run 91 ticker tambahan:

```powershell
cd C:\Users\TyaTyoKya\Documents\GitHub\sl\sahamlens
node scripts/backfill-lens-history.mjs --universe-additions --dry-run --skip-backtest --start=2025-08-15 --end=2026-08-15 --range=2y --ticker-batch-size=24 --concurrency=4 --retry-attempts=2 --checkpoint=scripts/.universe-200-additions-backfill-checkpoint.json
```

Backfill manual 91 ticker tambahan setelah dry-run oke:

```powershell
cd C:\Users\TyaTyoKya\Documents\GitHub\sl\sahamlens
node scripts/backfill-lens-history.mjs --universe-additions --skip-backtest --start=2025-08-15 --end=2026-08-15 --range=2y --ticker-batch-size=24 --concurrency=4 --retry-attempts=2 --checkpoint=scripts/.universe-200-additions-backfill-checkpoint.json
```

Catatan:

- `--universe-additions` hanya mengambil 91 ticker tambahan, bukan mengulang 109 legacy.
- Checkpoint default/eksplisit membuat proses bisa resume.
- Upsert idempotent berdasarkan key histori yang sudah ada.
- Ticker gagal fetch atau tidak punya row valid dicatat sebagai fail/skip, tidak dipaksa menghasilkan TP/CL.

Hasil dry-run 2026-08-15:

- Percobaan sandbox tanpa izin jaringan: `FAILED_ALL_TICKERS` karena 91/91 `fetch failed`.
- Dry-run dengan izin jaringan: `OK`.
- Ticker diproses: 91.
- Failed ticker: 0.
- Skipped no valid rows: 3 (`RANS.JK`, `JELI.JK`, `JECX.JK`).
- Built rows: 21.389.
- Saved rows: 0 karena `--dry-run`.
- Universe version: `idx-liquid-v2-200`.
- Price basis: `TOTAL_RETURN_ADJUSTED`.

Hasil backfill live 2026-08-15:

- Command:

```powershell
node scripts/backfill-lens-history.mjs --universe-additions --skip-backtest --start=2025-08-15 --end=2026-08-15 --range=2y --ticker-batch-size=24 --concurrency=4 --retry-attempts=2 --checkpoint=scripts/.universe-200-additions-backfill-checkpoint.json
```

- Status: `OK`.
- Ticker diproses: 91.
- Failed ticker: 0.
- Skipped no valid rows: 3 (`RANS.JK`, `JELI.JK`, `JECX.JK`).
- Built rows: 21.389.
- Saved/upserted rows: 21.389.
- Bucket stats saved rows: 0 karena `--skip-backtest`.
- Score version: `lens-score-v1.5.0`.
- Universe version: `idx-liquid-v2-200`.
- Price basis: `TOTAL_RETURN_ADJUSTED`.
- Checkpoint resume dibuat di `scripts/.universe-200-additions-backfill-checkpoint.json` dengan 88 completed ticker dan 3 `NO_VALID_ROWS`.

Verifikasi DB read-only setelah backfill live:

- Query `lens_radar_history WHERE universe_version = 'idx-liquid-v2-200'`.
- Rows: 21.389.
- Distinct tickers: 88.
- Min date: `2025-08-15`.
- Max date: `2026-08-14`.
- Window `2025-08-15..2026-08-15`: 21.389 rows / 88 tickers.
- Skipped ticker check: tidak ada row v2 untuk `RANS.JK`, `JELI.JK`, `JECX.JK`.

## Aktivasi dan rollback

Aktivasi setelah review:

```powershell
cd C:\Users\TyaTyoKya\Documents\GitHub\sl\sahamlens
npm run typecheck
npm test
npm run build
```

Setelah code direview/deploy lewat proses VPS yang biasa, jalankan cron/cache existing secara normal agar key `idx-liquid-v2-200` terisi. Backfill manual tambahan bisa dijalankan dengan command di atas; jangan jalankan backfill besar tanpa window dan monitoring.

Rollback aman jika perlu:

- Kembalikan active universe ke legacy 109 di `modules/market/constants/ai-pick-universe.ts`.
- Biarkan kolom `universe_version` tetap ada karena additive dan non-destruktif.
- Cache v2 bisa dibiarkan expire sesuai TTL; jangan hapus histori lama.
- Jalankan ulang typecheck/test/build sebelum redeploy.

## Hasil test

- Related tests:

```powershell
npm test -- modules/market/constants/__tests__/ai-pick-universe.test.ts shared/cache/__tests__/ai-pick-cache.test.ts modules/lens-radar/service/__tests__/history-archive.service.test.ts scripts/__tests__/backfill-lens-history.test.ts modules/recommendation/service/__tests__/trading-setup.test.ts modules/market/service/__tests__/screener.service.test.ts shared/market/__tests__/previous-close-guard.test.ts
```

PASS: 7 files / 50 tests.

- Type-check:

```powershell
npm run typecheck
```

PASS.

- Lint:

```powershell
npm run lint
```

PASS dengan warning lama terkait React hooks/image di beberapa file UI; tidak ada error.

- Full tests:

```powershell
npm test
```

PASS: 129 files / 1255 tests.

- Build:

```powershell
npm run build
```

PASS. Build perlu izin jaringan karena `next/font` mengambil Google Fonts.

- Final validation sebelum commit/deploy 2026-08-15:
  - `npm run audit:cron` -> PASS: 16 cron route tercatat, 6 systemd, 10 QStash, 0 Vercel.
  - `npm run typecheck` -> PASS.
  - `npm run lint` -> PASS dengan 13 warning lama, 0 error.
  - `npm test` -> PASS: 129 files / 1255 tests.
  - `npm run build` -> PASS.
- Post-deploy hotfix scanner count:
    - Production `GET /api/cron/screener-scan` setelah deploy pertama mengembalikan `count: 203`.
    - Root cause: `fetchScreenerUniverse()` masih union `SCREENER_UNIVERSE + AI_PICK_UNIVERSE`.
    - Fix: sumber fetch scanner aktif dikunci ke `AI_PICK_UNIVERSE` lewat `getScreenerFetchTickers()`.
    - `npm test -- modules/market/service/__tests__/screener.service.test.ts modules/market/constants/__tests__/ai-pick-universe.test.ts shared/cache/__tests__/ai-pick-cache.test.ts` -> PASS: 3 files / 33 tests.
    - `npm run typecheck` -> PASS.

## Commit/deploy production

- Commit utama: `9f24dec5888ff417d5dd892a3efeef6dc8335c74` (`Expand SahamLens universe to 200`).
  - CI GitHub Actions: PASS.
  - Deploy VPS GitHub Actions: PASS.
- Commit hotfix scanner: `e3d6c9c` (`Fix screener universe fetch target`).
  - CI GitHub Actions: PASS.
  - Deploy VPS GitHub Actions: PASS.
- Commit checkpoint final: akan dibuat setelah bagian ini ditulis.
- Production health setelah deploy hotfix:
  - `GET https://sahamlens.id/api/health` -> `status: ok`, database `ok`, redis `ok`.
- Production cache refresh yang sudah dipicu manual:
  - `GET https://sahamlens.id/api/cron/screener-scan` dengan `CRON_SECRET` -> PASS, `count: 200`.
  - `GET https://sahamlens.id/api/screener?profile=Moderat` -> PASS, endpoint membaca cache dan mengembalikan payload cached.
- QStash-only jobs (`ai-pick-scan`, `fundamental-snapshot`, `breakout-scan`) tidak dipublish manual dari workstation karena `QSTASH_TOKEN` di `.env.local` kosong. Route production jobs tersebut memang hanya menerima request signed QStash; jangan bypass manual di luar window IDX. Jadwal QStash production tetap akan refresh pada window bursa berikutnya.

- Backfill additions dry-run:

```powershell
node scripts/backfill-lens-history.mjs --universe-additions --dry-run --skip-backtest --start=2025-08-15 --end=2026-08-15 --range=2y --ticker-batch-size=24 --concurrency=4 --retry-attempts=2 --checkpoint=scripts/.universe-200-additions-backfill-checkpoint.json
```

PASS: status `OK`, 91 ticker, 0 failed, 3 skipped no valid rows (`RANS.JK`, `JELI.JK`, `JECX.JK`), 21.389 built rows, 0 saved rows.

- Backfill additions live:

```powershell
node scripts/backfill-lens-history.mjs --universe-additions --skip-backtest --start=2025-08-15 --end=2026-08-15 --range=2y --ticker-batch-size=24 --concurrency=4 --retry-attempts=2 --checkpoint=scripts/.universe-200-additions-backfill-checkpoint.json
```

PASS: status `OK`, 91 ticker, 0 failed, 3 skipped no valid rows (`RANS.JK`, `JELI.JK`, `JECX.JK`), 21.389 built rows, 21.389 saved/upserted rows.

- Post-backfill DB verification:

PASS: `idx-liquid-v2-200` berisi 21.389 rows / 88 ticker, tanggal `2025-08-15..2026-08-14`; skipped ticker tetap 0 row v2.

- Post-backfill related tests:

```powershell
npm test -- modules/market/constants/__tests__/ai-pick-universe.test.ts shared/cache/__tests__/ai-pick-cache.test.ts modules/lens-radar/service/__tests__/history-archive.service.test.ts scripts/__tests__/backfill-lens-history.test.ts modules/recommendation/service/__tests__/trading-setup.test.ts modules/market/service/__tests__/screener.service.test.ts shared/market/__tests__/previous-close-guard.test.ts
```

PASS: 7 files / 50 tests.

## Test coverage minimal yang ditambahkan/ditutup

- Jumlah universe aktif 200.
- Tidak ada ticker duplikat.
- Ticker invalid tidak masuk universe.
- Scanner fetch tickers tepat 200 dan tidak lagi union dengan `SCREENER_UNIVERSE`.
- 109 legacy tetap berada di prefix universe aktif.
- Tambahan v2 deterministik dan diekspor sebagai 91 ticker.
- Cache key/payload membedakan versi universe.
- Archive history menulis `universe_version`.
- Backfill additions memakai universe tambahan, batch/concurrency/retry/checkpoint args, dan upsert `universe_version`.
- TP/CL tidak dibuat ketika ATR/data invalid.

## Bukti scope formula tidak diubah

- Tidak ada perubahan intentional pada bobot/scoring/threshold rekomendasi.
- Tidak ada perubahan intentional pada formula TP/CL dan ATR-14.
- Perubahan `modules/recommendation/service/breakout.service.ts` menjaga previous-close guard/fail-closed; bukan perubahan scoring formula.
- Calibration Lab/optimizer/validasi lama difilter ke legacy agar histori 109 tidak tercampur dengan v2.

## Pekerjaan yang belum selesai

- Belum membuat protokol validasi v2 baru; validasi/Calibration Lab lama sengaja tetap legacy.
- Belum menambah index histori khusus `universe_version`; ditunda sampai ada kebutuhan volume/query nyata.

## Perintah tepat untuk melanjutkan pada sesi Codex berikutnya

```powershell
cd C:\Users\TyaTyoKya\Documents\GitHub\sl\sahamlens
git -c safe.directory=C:/Users/TyaTyoKya/Documents/GitHub/sl/sahamlens status --short
git -c safe.directory=C:/Users/TyaTyoKya/Documents/GitHub/sl/sahamlens diff --stat
node -e "const u=require('./modules/market/constants/ai-pick-universe.ts'); console.log(u.ACTIVE_LIQUID_UNIVERSE_VERSION, u.AI_PICK_UNIVERSE.length, u.AI_PICK_UNIVERSE_ADDITIONS.length, new Set(u.AI_PICK_UNIVERSE).size)"
npm run typecheck
npm test
npm run build
Get-Content -LiteralPath scripts/.universe-200-additions-backfill-checkpoint.json
```

# SahamLens - Deployment Notes

Catatan ini buat siapa pun/AI apa pun (Gemini, Cursor, Claude, dst) yang lanjutin kerjaan deploy
atau pembaruan program di project ini. Ditulis setelah deploy pertama ke Vercel (2026-07-29).

## Aturan wajib saat ada perubahan

- **Setiap perubahan kode/config/dependency/job/deployment harus ikut memperbarui `DEPLOYMENT.md`
  bila berdampak ke cara build, deploy, env var, cron/QStash, smoke test, cache, gating akses,
  atau jebakan operasional.**
- Kalau perubahan murni UI/logic kecil dan tidak mengubah cara deploy, tetap tambahkan catatan
  singkat di bagian "Log perubahan deployment" kalau commit itu sudah dipush ke production/main.
- Jangan mengandalkan ingatan percakapan AI. Keputusan operasional yang penting harus tertulis
  di dokumen ini supaya agen berikutnya tidak mengulang jebakan lama.

## Status live

- **Production URL**: https://sahamlens.vercel.app
  (2026-08-03: pindah dari `trading-three-liard.vercel.app`. Kalau menemukan URL lama di
  catatan/skrip lain, itu sudah usang - ganti ke domain ini.)
- **Vercel project**: `libas/trading` (projectId `prj_buCsXaT6sXen6LwAmeMcNLCBkYSO`, orgId `team_L8xvUeG8WKjNY8R0o9h8k8wE` - lihat `.vercel/project.json`)
- **GitHub**: `github.com/LibasJr/sahamlens`, branch `main`, sudah di-connect ke project Vercel di atas lewat `vercel link`.
- Vercel CLI di mesin dev sudah login sebagai akun `libasjr`. Kalau sesi expired, perlu `npx vercel login` ulang (device auth flow, buka browser).

## Log perubahan deployment

### 2026-08-06 - Admin UI Fundamental Backfill

- Halaman protected baru: `/admin/fundamental-backfill`.
- Menu admin/sidebar sekarang punya entry **Fundamental Backfill**.
- Admin bisa upload/paste CSV, klik **Dry Run**, lalu **Insert ke DB** tanpa terminal.
- API baru: `POST /api/admin/fundamental-backfill`, digerbang cookie admin yang sama
  dengan panel admin lain.
- Import tetap append-only ke `fundamental_history`:
  `ON CONFLICT (ticker, observed_date) DO NOTHING`.
- Checkbox `Lewati baris placeholder kosong` default aktif agar template besar bisa
  dipakai bertahap; baris kosong tidak diinsert, dan baris yang berisi angka invalid
  tetap ditolak.
- Tidak ada env var baru. Rollback: revert commit UI/API ini; data yang sudah masuk
  tetap bisa dihapus dengan filter tanggal+sumber spesifik jika memang diperlukan.

### 2026-08-06 - One-shot backfill fundamental_history point-in-time

- Script baru: `scripts/backfill-fundamental-history.mjs`.
- Cara jalan manual:
  - Dry-run dulu dari file CSV:
    `npm run backfill:fundamental-history -- --file=data/fundamental-awal-2026.csv --dry-run`
  - Eksekusi insert append-only:
    `npm run backfill:fundamental-history -- --file=data/fundamental-awal-2026.csv`
  - Jika satu file mewakili satu tanggal snapshot:
    `npm run backfill:fundamental-history -- --file=data/fundamental-awal-2026.csv --observed-date=2026-01-31 --source=IDX`
  - Opsi tambahan:
    `--format=csv|json`, `--tickers=BBCA.JK,TLKM.JK`, `--percent-input=percent|decimal`,
    `--source=<nama-sumber>`, `--skip-empty-rows`, `--dry-run`.
- Format kolom yang diterima: `ticker`, `observed_date`, `per`, `pbv`, `roe`, `der`,
  `current_ratio`, `revenue_growth`, `source`. Alias umum seperti `symbol`,
  `observedDate`, `publication_date`, `pe_ratio`, `priceToBook`, `returnOnEquity`,
  dan `revenueGrowth` juga diterima. Header CSV/JSON dibaca case-insensitive, jadi
  format Excel seperti `Kode`, `PER`, `PBV`, `ROE` tetap valid.
- Guard audit: `observed_date` wajib point-in-time, tidak boleh tanggal masa depan,
  dan minimal satu metrik harus terisi. Null tetap null; tidak diubah menjadi 0.
- Script **tidak** mengambil fundamental Yahoo hari ini untuk ditempel ke awal 2026.
  Backfill awal 2026 hanya sah jika file input berasal dari laporan/snapshot historis
  dengan tanggal publikasi/observed date yang bisa dipertanggungjawabkan.
- Template mass input tersedia di `data/fundamental-awal-2026-template-100-liquid.csv`.
  Isinya 100 ticker pertama dari universe likuid SahamLens plus DGWG yang ditambahkan
  manual; baris yang metriknya masih kosong adalah placeholder untuk diisi dari
  Excel/provider data, bukan untuk langsung di-import sebagai fundamental kosong.
  Jika template belum lengkap tapi ingin memproses baris yang sudah diisi, jalankan
  dengan `--skip-empty-rows`; tanpa flag ini, baris kosong tetap ditolak fail-closed.
- Insert ke `fundamental_history` idempoten dan append-only:
  `ON CONFLICT (ticker, observed_date) DO NOTHING`. Eksekusi ulang tidak menimpa
  angka lama, supaya audit trail point-in-time tidak berubah diam-diam.
- Env var: memakai `DATABASE_URL`; script akan load `.env.local` jika variabel belum ada.
- Rollback plan data: hapus hanya window dan sumber spesifik setelah verifikasi target,
  misalnya:
  `DELETE FROM fundamental_history WHERE observed_date BETWEEN <start> AND <end> AND source = <source>`.
  Jangan memakai delete luas tanpa filter tanggal+sumber.

### 2026-08-06 - LensRadar UI: breakdown skor komposit

- Halaman `LensRadar Live` (`/breakout-radar`) sekarang menampilkan kolom terpisah:
  `Total`, `Teknikal`, `Fundamental`, `Flow`, dan `Coverage`.
- Kolom `Total` tetap LensScore 0-100. `Teknikal` maksimum 40, `Fundamental` maksimum
  30, `Flow` maksimum 30, dan `Coverage` adalah porsi bobot skor yang punya data.
- Kolom lama `Rincian` diubah menjadi `Sinyal` agar label seperti `breakout`,
  `golden cross`, dan `akumulasi` tidak tercampur dengan angka coverage.
- Tidak ada perubahan formula scoring, API, database, cron, atau env var. Ini perubahan
  presentasi UI dari field yang sudah dikirim `/api/ai-pick`.

### 2026-08-06 - One-shot backfill LensRadar 1 tahun

- Script baru: `scripts/backfill-lens-history.mjs`.
- Cara jalan manual:
  - Dry-run satu/dua ticker dulu:
    `npm run backfill:lens-history -- --dry-run --tickers=BBCA.JK,TLKM.JK --skip-backtest`
  - Eksekusi penuh:
    `npm run backfill:lens-history`
  - Opsi tambahan:
    `--start=YYYY-MM-DD`, `--end=YYYY-MM-DD`, `--range=2y`,
    `--tickers=BBCA.JK,TLKM.JK`, `--skip-backtest`, `--score-version=<versi>`.
- Default mengambil universe 109 ticker dari `BACKTEST_UNIVERSE` dan fetch Yahoo Chart
  `range=2y`. Yang di-insert tetap window 1 tahun; ekstra 1 tahun hanya warm-up agar
  MA200/MACD/RSI tidak kosong di awal window.
- Script memakai require-hook lokal untuk memanggil fungsi TypeScript produksi:
  `calculateScore`, analyzer RSI/MACD, proxy flow, constant model version, price-basis
  guard, dan `runAndSaveLensBucketBacktest`. Ini sengaja agar rumus backfill tidak drift
  dari runtime.
- Fundamental historis **tidak di-backfill dari data hari ini**. Script hanya membaca
  `fundamental_history` dengan `observed_date <= tanggal sinyal`. Jika snapshot historis
  belum ada, input fundamental dikirim `null` dan coverage turun; ini mencegah look-ahead
  bias dan tidak membuat data dummy.
- Insert ke `lens_radar_history` idempoten dengan `ON CONFLICT (date, ticker) DO UPDATE`,
  termasuk metadata Fase 1/3: `score_version`, `valuation_version`, `signal_version`,
  `data_snapshot_version`, `calculation_timestamp`, `raw_close_price`,
  `adjusted_close_price`, `price_basis = TOTAL_RETURN_ADJUSTED`,
  `adjustment_factor`, `corporate_action_status`, `price_data_timestamp`,
  `price_data_version = price-adjustment-v1`.
- Setelah insert penuh, script otomatis menjalankan `runAndSaveLensBucketBacktest()` untuk
  mengisi `lens_bucket_stats`, kecuali diberi `--skip-backtest`.
- Cache `/api/transparency` dibump ke versi `backfill-v1` dan script akan menghapus
  key transparency setelah backtest selesai, supaya halaman publik tidak menampilkan
  payload lama `totalSamples=0` sampai TTL 30 menit habis.
- Env var: memakai `DATABASE_URL`; script akan load `.env.local` jika variabel belum ada.
- Rollback plan data: karena script upsert, rollback aman adalah restore dari backup/PITR
  atau hapus window spesifik secara eksplisit setelah menghitung target:
  `DELETE FROM lens_radar_history WHERE date BETWEEN <start> AND <end> AND score_version = 'lens-score-v1.3.0'`.
  Jangan pakai delete luas tanpa filter tanggal+versi.

### 2026-08-06 - Audit Ronde 3 Fase 3: Corporate Action & Price Basis

- Fase yang dikerjakan: **hanya Fase 3 - Corporate Action dan Konsistensi Price Basis**.
  Fase 1/2 tidak diubah kecuali kompatibilitas pembacaan histori yang sekarang membawa
  metadata basis harga.
- Kebijakan price basis:
  - `RETURN_PRICE_BASIS = TOTAL_RETURN_ADJUSTED` untuk forward return, calibration,
    bucket backtest, MA/RSI/MACD/momentum/market-flow return-based.
  - `TRADING_PRICE_BASIS = RAW` untuk harga display, support/resistance, ATR raw OHLC,
    tick/order level, dan chart tradable.
  - Yahoo `AdjClose` diperlakukan sebagai sumber adjusted provider untuk fase ini
    (`YAHOO_CHART_ADJCLOSE`, `price-adjustment-v1`). Jika adjusted price hilang,
    sistem fail-closed; tidak ada fallback `AdjClose ?? Close` di scoring path utama.
- Data model additive/idempotent di `shared/database/schema.service.ts`:
  `lens_radar_history` ditambah `raw_close_price`, `adjusted_close_price`,
  `price_basis`, `adjustment_factor`, `corporate_action_status`,
  `price_data_timestamp`, `price_data_version`; `lens_bucket_stats` ditambah
  `price_basis`, `price_data_version`.
- Histori LensRadar baru tetap mempertahankan `close_price` lama sebagai raw/display
  compatibility. Validasi/backtest baru hanya menerima row dengan
  `price_basis = TOTAL_RETURN_ADJUSTED` dan `adjusted_close_price` valid; legacy/unknown
  price basis tidak masuk sampel.
- `shared/market/price-basis.ts` menjadi guard bersama:
  normalisasi OHLC raw/adjusted, derivasi adjusted OHLC dari adjustment factor,
  `PriceBasisMismatchError`, status `MISSING_ADJUSTED_PRICE`,
  `INVALID_ADJUSTMENT_FACTOR`, `LEGACY_UNKNOWN_PRICE_BASIS`, dan corporate-action
  detector sebagai **[HIPOTESIS PENJAGA]**, bukan alat menebak rasio split.
- Endpoint/detail yang menampilkan analisis saham mulai membawa metadata `priceMeta`
  agar audit/debug/Ask AI tidak menyebut "harga" tanpa basis.
- Cache `/api/transparency` tetap versioned dan kini juga membawa `RETURN_PRICE_BASIS`
  + `PRICE_ADJUSTMENT_VERSION` dalam cache key.
- Sisa yang sengaja belum diubah di fase ini: beberapa endpoint context-only
  (`/api/chat`, `/api/council`, `/api/compare`) masih memiliki fallback `AdjClose ?? Close`
  untuk ringkasan/prompt, bukan validasi/backtest/scoring utama. Tandai untuk Fase 10
  Ask AI contract agar semua konteks harga punya basis eksplisit.
- Rollback plan: revert commit Fase 3. Kolom DB baru nullable/additive aman dibiarkan.
  Jika hard rollback DB diperlukan, drop hanya kolom/index price-basis baru setelah
  memastikan tidak ada consumer baru yang membacanya. Jangan menimpa/menghapus
  `close_price` lama karena itu raw audit trail.
- Tidak ada env var baru.

### 2026-08-06 - Audit Ronde 3 Fase 1: Model Versioning hardening

- Fase yang dikerjakan: **hanya Fase 1 - Model Versioning** dari
  `SAHAMLENS_AUDIT_KUANTITATIF_RONDE3_2026-08-05.md`.
- Default backtest/calibration sekarang hanya membaca `SCORE_VERSION` aktif
  (`lens-score-v1.3.0`). Baris legacy tanpa `score_version` dan baris versi lain ditolak
  secara fail-closed, bukan digabung diam-diam.
- Backtest menerima filter versi eksplisit:
  - Service cron: `calculateLensBucketStats(..., { scoreVersion })`.
  - Endpoint lama: `GET /api/lens-score-bucket-backtest?scoreVersion=<versi>`.
- Output analisis LensRadar sekarang membawa metadata audit versi:
  `scoreVersion`, `requestedScoreVersion`, `rejectedRows`, `unversionedRows`,
  `versionMixed`, `versionRejectedReason`.
- Cache publik `/api/transparency` ikut dibump menjadi cache key berbasis
  `SCORE_VERSION`. Ini penting agar Redis tidak menyajikan payload lama tanpa metadata versi
  setelah deploy Fase 1.
- `lens_bucket_stats` ditambah kolom idempoten `score_version` dan index
  `(score_version, run_date DESC)`. Snapshot stats terbaru dibaca per versi, bukan latest
  global lintas versi.
- Migration database mengikuti pola repo: additive/idempotent di
  `shared/database/schema.service.ts`, bukan file SQL terpisah (lihat aturan operasional di
  bagian bawah dokumen ini).
- Rollback plan: revert commit kode Fase 1. Kolom tambahan di Postgres aman dibiarkan karena
  nullable, additive, dan tidak mengubah primary key. Jika perlu hard rollback database manual,
  drop hanya `lens_bucket_stats.score_version` dan index
  `idx_lens_bucket_stats_score_version_run_date`; kolom versi di `lens_radar_history`
  sebaiknya tetap dipertahankan sebagai audit trail.
- Tidak ada env var baru.

### 2026-08-05 - Audit kuantitatif ronde 3: fail-closed validation & DCF bridge

- Validasi LensRadar diperketat:
  - Forward return T+1/T+5/T+20 sekarang memakai kalender hari bursa global, bukan indeks
    baris per ticker di `lens_radar_history`.
  - Observasi dengan gap harga harian >40% dalam window entry-exit dibuang sebagai mitigasi
    aksi korporasi/split yang belum punya adjusted close point-in-time.
  - T-test admin/transparency memakai sampel efektif non-overlap per ticker per 20 hari
    bursa, bukan sampel harian yang tumpang tindih.
  - Status produk LensRadar dipaksa `RESEARCH_ONLY`: p-value tetap ditampilkan untuk riset,
    tetapi flag/banner “tervalidasi” tidak boleh aktif sebelum uji out-of-sample tersedia.
- Equity curve `/transparency` Top 5 LensRadar sekarang compound per window 20 hari yang tidak
  tumpang tindih, bukan return 20-hari yang dikalikan setiap hari bursa.
- Cron `lens-bucket-backtest` memakai logika horizon/guard yang sama dengan calibration agar
  snapshot `lens_bucket_stats` tidak menyimpan statistik bias.
- `lens_radar_history` ditambah kolom versi model/audit trail secara idempoten:
  `score_version`, `valuation_version`, `signal_version`, `data_snapshot_version`,
  `calculation_timestamp`. Arsip harian baru menulis versi ini otomatis.
- Technical LensScore: volume 0 dinilai sebagai data valid dengan skor 0, bukan dianggap missing
  lalu bobotnya direnormalisasi.
- TP/CL LensRadar dibulatkan ke fraksi harga IDX dan RR dihitung ulang setelah pembulatan.
- DCF LensAI:
  - UI/backend tidak lagi melabeli `Rf + ERP` sebagai WACC aktual; sekarang disebut
    `discount_rate_pct` / cost-of-equity proxy.
  - DCF FCF menghasilkan enterprise value per share lalu dikurangi net debt per share sebelum
    menjadi fair value ekuitas. Jika data utang/kas tidak tersedia, DCF fail-closed sebagai
    `NO_BALANCE_SHEET_DATA`.
- Tidak ada env var baru.

### 2026-08-05 - Menu UI untuk Transparency & Calibration

- Sidebar sekarang menampilkan menu publik **Transparansi** (`/transparency`) di grup
  Intelligence, sehingga halaman validasi LensRadar tidak perlu dibuka manual lewat URL.
- Sidebar admin sekarang menampilkan **Kalibrasi LensRadar** (`/admin/calibration`) di grup
  Admin untuk role `admin`. Proteksi halaman tetap memakai `isAdminServer()`; link ini hanya
  menambah discoverability UI, bukan membuka akses baru.
- Sidebar juga membaca `GET /api/admin-status`, jadi admin yang masuk lewat
  `/admin-login/key?key=...` tetap melihat menu Admin meski tidak sedang login sebagai akun
  user ber-role `admin`.
- Tidak ada perubahan env var, dependency, cron, cache, atau schema database.

### 2026-08-05 - LensScore auto re-weight proposal (manual approval)

- Service baru `modules/lens-radar/service/lens-score-optimizer.service.ts`.
- Vercel Cron baru: `GET /api/cron/lens-score-optimizer`, schedule `0 11 * * 0` UTC =
  Minggu 18:00 WIB, protected dengan `CRON_SECRET`.
- Optimizer membaca `lens_bucket_stats` 90 hari terakhir untuk menentukan window validasi, lalu
  memakai histori point-in-time `lens_radar_history` yang punya breakdown komponen
  `technical_score`, `fundamental_score`, `flow_score` untuk simulasi bobot baru.
- Schema `lens_radar_history` ditambah kolom idempoten: `technical_score`,
  `fundamental_score`, `flow_score`, `coverage_pct`, `updated_at`.
- Cron `ai-pick-scan` sekarang mengarsipkan skor harian LensRadar ke `lens_radar_history`
  setelah menulis cache Redis, supaya optimizer punya data komponen real untuk run berikutnya.
- Tabel baru `lens_weight_proposals` menyimpan proposal bobot: baseline weights, proposed
  weights, spread T+20, p-value, jumlah sampel, status, reason, dan window 90 hari.
- Status proposal bisa `PENDING_APPROVAL`, `INSUFFICIENT_STATS`,
  `INSUFFICIENT_COMPONENT_HISTORY`, atau `NO_VALID_CANDIDATE`. Tidak ada perubahan otomatis ke
  bobot production; admin tetap harus approve/manual apply.
- `/admin/calibration` sekarang menampilkan kartu "Rekomendasi Bobot Baru" dari proposal terbaru.
- Tidak ada env var baru; reuse `CRON_SECRET` yang sudah diset untuk Vercel Cron.

### 2026-08-05 - Public Transparency Page LensRadar

- Halaman publik baru: `/transparency`, bisa diakses tanpa login.
- Endpoint publik baru: `GET /api/transparency`, tidak memakai gate Pro/admin, tetapi memakai
  cache Redis `LENS_TRANSPARENCY` 30 menit supaya pengunjung publik tidak memicu hitung ulang
  histori/Yahoo pada setiap request.
- Halaman menampilkan tabel bucket `80-100`, `70-79`, `60-69`, `<60` dari snapshot terbaru
  `lens_bucket_stats`: Avg T+1/T+5/T+20, Win Rate T+20, Total Sampel, Max Drawdown T+20,
  Avg Win T+20, Avg Loss T+20.
- Schema `lens_bucket_stats` ditambah kolom idempoten `max_drawdown_t20`, `avg_win_t20`,
  `avg_loss_t20`. Cron `lens-bucket-backtest` sekarang menghitung dan menyimpan metric ini
  dari return T+20 real; tidak ada data dummy.
- Equity curve publik dihitung dari `lens_radar_history` point-in-time: tiap tanggal sinyal
  ambil Top 5 LensRadar, entry Open H+1, exit T+20, biaya round-trip 0,5%, dibandingkan dengan
  IHSG (`^JKSE`) pada window entry/exit yang sama.
- Banner validasi:
  - `<90` hari validasi: kuning "Dalam masa pengumpulan data validasi".
  - `>=90` hari dan p-value Welch one-tailed `80-100 > <60` `<0.05`: hijau
    "Tervalidasi: Bucket 80-100 outperform signifikan".
  - selain itu: netral, data cukup panjang tapi belum signifikan.
- Disclaimer audit eksplisit: point-in-time, entry Open H+1, setelah fee 0,4% + slippage 0,1%,
  data sejak `startDate`, bukan nasihat investasi.
- Tidak ada env var baru. Pastikan cron `lens-bucket-backtest` jalan setelah deploy agar kolom
  metric baru di `lens_bucket_stats` terisi; sebelum itu halaman tetap fallback ke hitungan
  real on-demand bila snapshot metric baru masih null.

### 2026-08-05 - Admin Calibration Lab untuk LensRadar

- Halaman internal baru: `/admin/calibration`, protected dengan `isAdminServer()` dan redirect
  ke `/admin-login` kalau bukan admin.
- Admin Panel (`/admin`) sekarang punya link ke "LensRadar Calibration Lab".
- Endpoint admin baru:
  - `GET /api/admin/calibration` untuk data grafik bucket, t-test, dan simulasi threshold.
  - `POST /api/admin/calibration/recommend-threshold` untuk rekomendasi ambang via AI cascade
    (`generateAI`) dengan fallback rule-based bila semua provider gagal/limit.
- Service baru `modules/lens-radar/service/calibration.service.ts` menghitung observasi real dari
  `lens_radar_history` dan open H+1 Yahoo OHLC; tidak memakai dummy. Jika data T+20 belum cukup,
  UI menampilkan empty/insufficient-data state.
- Grafik batang menampilkan avg return T+20 bucket 80-100, 70-79, 60-69. Tabel t-test memakai
  Welch one-tailed t-test untuk hipotesis `80-100 > <60` dengan ambang signifikan p-value `<0.05`.
- Slider threshold 60-90 menunjukkan win rate T+20, jumlah sinyal, avg return T+20, dan delta
  vs baseline ambang 80.
- Tidak ada env var baru. Fitur AI memakai provider AI yang sudah ada (`GEMINI_API_KEY`,
  `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `KIMI_API_KEY`, `NVIDIA_API_KEY`) dan tetap punya fallback
  deterministic jika provider tidak tersedia.

### 2026-08-05 - Strategy Builder: Lens bucket stats via Vercel Cron

- Ditambahkan service `modules/lens-radar/service/bucket-backtest.service.ts` untuk validasi
  LensScore per bucket dari tabel real `lens_radar_history` (`date`, `ticker`, `lens_score`,
  `close_price`, `market_cap`).
- Bucket skor: 80-100, 70-79, 60-69, `<60`. Entry price memakai open H+1 dari OHLC Yahoo
  (`fetchYahooHistory`, sumber yang sudah dipakai layer teknikal), bukan close hari sinyal,
  untuk menjaga point-in-time dan mengurangi look-ahead bias.
- Forward return dihitung untuk T+1, T+5, T+20 dari entry H+1, lalu dikurangi biaya round-trip
  0,5% (fee 0,4% + slippage 0,1%).
- Output service: `{ bucket, avg_T1, avg_T5, avg_T20, winRate_T5, winRate_T20, totalSamples }`
  plus metadata run untuk penyimpanan/audit.
- Schema Postgres ditambah secara idempoten: guard tabel input `lens_radar_history` + kolom
  `market_cap`, dan tabel output `lens_bucket_stats` dengan primary key `(run_date, bucket)`.
- Endpoint cron baru: `GET /api/cron/lens-bucket-backtest`, job log
  `lens-bucket-backtest`, guarded dengan `CRON_SECRET`.
- `vercel.json` ditambahkan untuk Vercel Cron: `0 10 * * 1-5` UTC = 17:00 WIB Senin-Jumat.
- Env var baru yang wajib ada di Production: `CRON_SECRET` (sudah ditambahkan sebagai
  Sensitive env via Vercel CLI pada 2026-08-05). Tanpa ini, route sengaja membalas 401 supaya
  endpoint tidak bisa dijalankan publik.
- Tidak menambah dependency Python/yfinance baru; implementasi memakai fetch Yahoo Finance
  yang sudah ada di TypeScript agar tetap cocok dengan runtime serverless Vercel.

### 2026-08-05 - LensScore bucket backtest di LensRadar

- Ditambahkan service `modules/recommendation/service/lens-score-bucket-backtest.service.ts`
  yang membaca tabel `lens_radar_history` (`date`, `ticker`, `lens_score`, `close_price`)
  dan menghitung bucket 80-100, 70-79, 60-69, `<60`.
- Return dihitung dengan sinyal close T, entry di close H+1, horizon 1/5/20 hari bursa
  dari entry aktual, lalu dikurangi biaya round-trip 0,5% (fee 0,4% + slippage 0,1%).
- Output mencakup Avg Return, Win Rate, jumlah sampel, dan Welch t-test sederhana
  bucket 80-100 vs 60-69.
- Endpoint baru: `/api/lens-score-bucket-backtest`, gating sama seperti LensRadar
  (trial anonim aktif/login Pro).
- Halaman `/breakout-radar` menampilkan tabel validasi bucket sebagai pengganti pesan
  kuning bila histori LensRadar sudah lebih dari 90 hari kalender.
- Tidak ada env var baru. Perlu memastikan tabel production `lens_radar_history` benar-benar
  terisi harian; jika tabel belum ada, endpoint mengembalikan histori belum siap, bukan 500.

### 2026-08-05 - Brand icon scope di header SahamLens

- Ikon kecil di sebelah teks "SahamLens" pada landing header, auth shell, dan halaman
  market category diganti dari logo lama/kotak "SL" menjadi `public/sahamlens-scope.png`.
- Sidebar sudah memakai asset scope yang sama, jadi perubahan ini menyamakan identitas
  brand antar halaman.
- Tidak ada perubahan env var, dependency, cron, cache, atau aturan scoring.

### 2026-08-05 - LensRadar scanner tetap tampil saat advisory belum tervalidasi

- `/api/ai-pick` sekarang tetap mengirim ranking hasil scan data real sebagai scanner/pantauan
  walau `modelValidation.validated=false`.
- Ranking memiliki dua mode: `advisory` tetap fail-closed atas cache legacy, sedangkan
  `scanner` boleh menampilkan cache sesi terakhir tanpa `eligibilityStatus` bila
  `kategori`/`coverage` membuktikan data skor cukup.
- Guard validasi model tidak dihapus: response menambahkan `advisoryEnabled=false` dan `note`
  eksplisit bahwa LensRadar belum boleh dibaca sebagai rekomendasi beli/jual.
- Beranda mengubah panel dari "Rekomendasi LensRadar" menjadi "Pantauan LensRadar" dan
  menampilkan catatan validasi model supaya pengguna tidak melihat panel kosong tanpa sebab.
- Empty-state "Proyeksi Level Harga" diperjelas: jika top scanner ada tetapi TP/CL kosong,
  berarti belum ada setup TP/CL valid dengan RR minimal 1,5 atau cache sesi terakhir belum
  berisi setup valid, bukan data dummy yang disembunyikan.
- `/breakout-radar` ikut diselaraskan menjadi halaman scanner/pantauan, bukan wording
  rekomendasi aksi.
- Smoke test yang perlu dicek setelah deploy Ready:
  - `/api/ai-pick` harus mengembalikan `items` kalau cache skor berisi saham lolos ranking,
    dengan `advisoryEnabled=false` selama LensScore belum tervalidasi.
  - `/` harus menampilkan "Pantauan LensRadar" dan daftar top scanner bila API berisi item.

### 2026-08-05 - Quant/data integrity audit (`23e8229`)

- Commit `23e8229 Audit SahamLens quant data integrity` sudah dipush ke `origin/main`.
- Auto-deploy Vercel seharusnya terpicu dari push ke `main` sesuai pola yang sudah terverifikasi.
  Status Ready production **tetap harus dicek** dengan `npx vercel ls` setelah push.
- Validasi lokal sebelum push:
  - `npm.cmd run typecheck` lulus.
  - `npm.cmd test` lulus: 51 file, 423 test.
  - `npm.cmd run build` lulus.
  - `git diff --check` bersih.
- Perubahan operasional penting:
  - AI Pick/Breakout kini fail-closed untuk setup trading: TP/CL hanya muncul kalau setup
    struktur + ATR punya RR minimal 1.5.
  - LensScore tetap ditahan sebagai rekomendasi aksi sampai validasi model point-in-time
    tersedia (`modules/validation/service/lens-score-validation.service.ts`).
  - Endpoint fundamental kini mengirim `dataQuality` berbasis identity checks PER/PBV/ROE.
  - `estimateFullDayVolume()` memakai profil intraday U-shape konservatif, bukan linear.
  - Backtest limitation menambahkan catatan restatement AdjClose/corporate action.
- Smoke test yang perlu diprioritaskan setelah deployment Ready:
  - `/api/ai-pick` harus boleh kosong dengan `modelValidation.validated=false`, bukan error.
  - `/api/fundamental/BBCA.JK` harus menyertakan field `dataQuality`.
  - `/api/daily-picks` harus tetap respons, termasuk kategori `relativeStrength`.
  - `/breakout-radar` harus tetap render walau setup TP/CL null untuk sebagian saham.

## Cara deploy ulang setelah ubah kode

1. Pastikan lolos check dulu sebelum push/deploy:
   ```
   npx tsc --noEmit -p tsconfig.json
   npm run build
   ```
2. Commit & push ke `main` seperti biasa. **Auto-deploy dari push TERKONFIRMASI jalan
   sendiri** (diverifikasi 2026-08-03: dua push berturut-turut masing-masing memicu
   deployment Production baru tanpa perintah manual apa pun). Cukup tunggu dan pantau:
   ```
   npx vercel ls
   ```
   Deployment baru muncul berstatus `● Building` dalam hitungan detik setelah push, lalu
   `● Ready` sekitar 2 menit kemudian.
3. Deploy manual **hanya kalau** setelah beberapa menit tidak ada deployment baru di
   `npx vercel ls`:
   ```
   npx vercel --prod --yes
   ```
4. Smoke test setelah deploy (ganti URL kalau domain berubah) - **DIPERBARUI 2026-08-03**:
   cookie contoh lama (`role=admin`, `sahamlens_demo_session=...` buatan tangan) sudah tidak
   berlaku - session sekarang JWT bertanda tangan (`shared/auth/session.ts`), tidak bisa
   dipalsukan lewat `-H "Cookie: ..."` biasa. Smoke test tanpa login (anonymous trial otomatis
   aktif untuk sebagian besar fitur, lihat bagian "Gating akses" di bawah):
   ```
   curl -s -o /dev/null -w "%{http_code}\n" https://sahamlens.vercel.app/
   curl -s -o /dev/null -w "%{http_code}\n" https://sahamlens.vercel.app/technical/DGWG.JK
   curl -s "https://sahamlens.vercel.app/api/screener?profile=Moderat" | head -c 300
   ```
   Buat smoke test jalur admin: buka `https://sahamlens.vercel.app/admin-login/key?key=<ADMIN_SECRET_KEY>`
   di browser (bukan curl - butuh redirect + cookie httpOnly tersimpan di browser), baru lanjut
   ke `/admin` atau menu Pro-gated lainnya.

   Waktu respons acuan (diukur 2026-08-03, setelah deploy AI Pick satu tab):

   | Endpoint | Waktu | Catatan |
   |---|---|---|
   | `/breakout-radar` | 0,28 s | halaman AI Pick, murni baca cache |
   | `/` | 0,80 s | |
   | `/api/ai-pick` | 0,97 s | murni baca cache |
   | `/api/daily-picks` | 3,77 s | paling lambat - `getMarketSummary()` atas 250 saham, dipakai widget beranda |

   Request pertama setelah deploy selalu lebih lambat karena cold start lambda; ukur yang
   kedua kalau mau angka yang mewakili.

## ⚠️ Jebakan yang sudah pernah bikin deploy gagal

**Folder `mobile/` (React Native app terpisah, ~469MB) bikin deploy CLI gagal** dengan error
`File size limit exceeded (100 MB)`. Penyebab: `mobile/android/.gradle/.../executionHistory.bin`
(141MB) dan `mobile/android/app/build/outputs/apk/release/app-release.apk` (66MB) - keduanya
sudah di-`.gitignore` (gak ke-push ke GitHub), TAPI `vercel --prod` CLI meng-upload dari working
directory lokal dan **tidak menghormati `.gitignore`**, cuma menghormati `.vercelignore`.

Fix-nya sudah ada di `.vercelignore` (root repo) yang exclude `mobile/` + beberapa script test.
**Jangan hapus/skip `.vercelignore` ini**, dan kalau nambah folder besar baru yang gak perlu
ikut ke-deploy, tambahkan di sana juga.

**`output: 'standalone'` di `next.config.mjs` BIKIN DEPLOY VERCEL GAGAL** (ditemukan 2026-08-05,
setelah 4 deploy Production berturut-turut gagal ~7 jam). Opsi ini ditambahkan buat `Dockerfile`
(jalur self-host, BUILD 010) dengan komentar yang KELIRU bilang "tidak memengaruhi Vercel" - untuk
Next.js 16 + Turbopack, mode standalone melewatkan `.next/next-server.js.nft.json` yang justru
dibaca pipeline build Vercel sendiri setelah `next build` selesai, jadi build sukses penuh
(compile+typecheck+prerender lolos semua) lalu tetap gagal `ENOENT` di step terakhir. Fix: gated
lewat `output: process.env.VERCEL ? undefined : 'standalone'` (Vercel set `VERCEL=1` otomatis,
Dockerfile tidak) - **kalau mengubah `next.config.mjs` lagi, jangan hapus guard `process.env.VERCEL`
ini** kecuali sudah verifikasi ulang lewat `npx vercel ls` bahwa deploy tetap Ready.

**`eslint-config-next` versi harus align sama `eslint`** - upgrade Next.js 14→16 (2026-08-04) naikin
`eslint-config-next` ke `^16.3.0` yang butuh peer `eslint@>=9`, tapi `eslint` devDependency dibiarkan
`^8.57.0`. Vercel selalu install bersih (tanpa cache `node_modules` lokal), jadi `npm install`
ERESOLVE-fail keras di sana meskipun mesin dev lokal masih punya install lama yang "kelihatan" jalan.
Fix sementara: root `.npmrc` isi `legacy-peer-deps=true`. **Perbaikan jangka panjang yang lebih
benar**: upgrade `eslint` ke `^9` + migrasi `.eslintrc.json` ke flat config `eslint.config.mjs`
(ESLint 9 default-nya tidak baca `.eslintrc.*` lagi) - belum dikerjakan, `.npmrc` cuma nge-relax
resolusi peer-dep, bukan benerin akar masalahnya.

## Environment variables yang sudah di-set di Vercel (Production)

**REWRITE TOTAL (audit BUILD 002, 2026-08-03)** - tabel dan seluruh bagian di bawah ini
sebelumnya menjelaskan arsitektur Telegram-login + fake-Supabase-shim + JSON lokal yang
**SUDAH DIGANTI TOTAL** oleh restrukturisasi DDD (2026-07-31): auth sekarang email/password
(JWT session, `shared/auth/session.ts`), storage sekarang Postgres (Neon) beneran lewat `pg`
(bukan file JSON/shim), cache Redis (Upstash) beneran, cron lewat QStash beneran. Isi
sebelumnya dibuang total (bukan ditambal) karena hampir semua file yang dirujuk (`lib/auth.ts`,
`lib/constants.ts`, `lib/dbLocal.ts`, `lib/supabase.ts`, `lib/supabaseClient.ts`, `lib/cache.ts`,
`components/TelegramLogin.tsx`, `modules/user/service/telegram-auth.service.ts`,
`app/api/auth/telegram`, `app/api/watchlist/migrate`) **sudah tidak ada di repo sama sekali**
(diverifikasi lewat `ls`/`grep` sebelum ditulis ulang, bukan asumsi).

Set lewat `printf '%s' "$VALUE" | npx vercel env add NAME production` (ganti `production` jadi
`preview` buat scope satunya). Cek status: `npx vercel env ls production`.

Dikelompokkan REQUIRED / OPTIONAL / LEGACY (audit BUILD 002) - diverifikasi lewat `vercel env ls`
+ grep pemakaian di source tanggal 2026-08-03:

**REQUIRED** (app tidak berfungsi penuh tanpa ini):
| Var | Dipakai untuk |
|---|---|
| `DATABASE_URL` (+ alias Neon lain: `POSTGRES_URL`, `PGHOST`, dst - lihat catatan di bawah) | Postgres (Neon) - portfolio, watchlist, alert, macro_indicators, job_run_log, lens_bucket_stats. Kode HANYA baca `DATABASE_URL` (`shared/config/env.ts`) - var Neon lain (`POSTGRES_URL_NON_POOLING`, `PGHOST_UNPOOLED`, dst, ada belasan) di-inject otomatis oleh integrasi Neon-Vercel, tidak dibaca kode manapun, aman dibiarkan (bukan sampah manual, punya integrasi). |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Cache (`shared/cache/redis-cache.ts`) - kalau kosong, semua fungsi cache degrade aman ke cache-miss (tidak crash), tapi performa jauh lebih lambat & Yahoo Finance kena request lebih sering. |
| `QSTASH_TOKEN` / `QSTASH_URL` / `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | Cron scheduler QStash untuk mayoritas job lama, lihat bagian "Jadwal QStash" di bawah. |
| `CRON_SECRET` | Proteksi endpoint Vercel Cron native, saat ini dipakai `GET /api/cron/lens-bucket-backtest`. Nilai harus sama dengan header `Authorization: Bearer <CRON_SECRET>` yang dikirim Vercel Cron. |
| `JWT_SECRET_KEY` | Session login email/password (`shared/auth/session.ts`, `jose`). |
| `ADMIN_SECRET_KEY` | Jalur darurat login admin (`/admin-login/key?key=...`) - password admin utama disimpan sebagai hash di tabel `admin_secret` (database), bisa diganti sendiri lewat `/admin` tanpa deploy ulang. Nilai TIDAK BISA dibaca ulang dari Vercel setelah tersimpan (Sensitive) - simpan juga di `.env.local` lokal (gitignored). |
| `GEMINI_API_KEY` | AI cascade (`lib/aiProviders.ts generateAI()`) - tanpa ini fallback ke heuristik rule-based per fitur (Council lokal, sentimen kata kunci, dst), BUKAN error. |

**OPTIONAL** (fitur spesifik degrade dengan aman kalau kosong):
| Var | Dipakai untuk |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | Error tracking (`@sentry/nextjs`). |
| `SMTP_EMAIL` / `SMTP_PASSWORD` | Kirim email (reset password, dst - `nodemailer`). |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | **BUKAN login Telegram** (itu sudah dihapus total) - dipakai `lib/telegram.ts sendTelegramMessage()`, satu-satunya pemanggil `app/api/payment/notify/route.ts` (notifikasi ke admin saat ada bukti bayar manual masuk). |
| `NEXT_PUBLIC_PAYMENT_*` (BANK_ACCOUNT_NAME/NUMBER, BANK_NAME, GOPAY_NAME/NUMBER, DANA_NAME/NUMBER) | Metode pembayaran manual di `PaywallModal` (`shared/config/payment.ts`). Baris otomatis disembunyikan kalau salah satu metode belum diisi. |

**LEGACY - SUDAH DIHAPUS dari Vercel (2026-08-03, dikonfirmasi pemilik produk):**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (sisa
rencana Supabase yang tidak pernah jadi dipakai), `ADMIN_TELEGRAM_ID`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
(sisa sistem login Telegram yang sudah dihapus total - beda dari `TELEGRAM_BOT_TOKEN`/
`TELEGRAM_CHAT_ID` di atas yang MASIH dipakai untuk notifikasi pembayaran). Diverifikasi 0
pemakaian di kode sebelum dihapus, lalu dihapus lewat `npx vercel env rm <NAME> production`
(+ `preview` untuk 3 var Supabase yang scope-nya dua-duanya).

`INTERNAL_API_SECRET` (`shared/auth/internal-service.ts`, dipakai cron/alert evaluation supaya
panggilan server-to-server ke `/api/stock`, dst bisa lewati gate session) - **cek ulang statusnya
di `vercel env ls`**, dokumen sebelumnya bilang belum di-set tapi itu klaim lama, tidak
diverifikasi ulang di sesi ini.

## Arsitektur data (sudah bukan Supabase/JSON lokal lagi)

Satu layer penyimpanan: **Postgres (Neon)**, diakses lewat `pg` (bukan ORM), tabel dibuat
idempoten (`CREATE TABLE IF NOT EXISTS`) oleh `shared/database/schema.service.ts` saat boot -
`portfolios`, `holdings`, `transactions`, `watchlists`, `alerts`, `macro_indicators`,
`job_run_log`, dst. Data PERSISTEN antar cold start Vercel (beda total dari arsitektur lama yang
cuma in-memory/file JSON dan hilang tiap cold start).

Cache Redis (Upstash) terpisah dari database - murni cache hasil hitungan (screener universe,
market summary, AI Pick scores, dst), TTL terpusat di `shared/cache/ttl-policy.ts`. Redis gagal/
belum dikonfigurasi = degrade aman ke cache-miss, tidak pernah menggagalkan request user.

## Gating akses (auth email/password, bukan Telegram lagi)

Login sekarang email/password biasa (`app/signup`, `app/login`) - JWT session lewat
`shared/auth/session.ts getSession()`. Akses fitur Pro dicek per-route lewat
`checkProAccessLive(session)`, BUKAN blanket 429 untuk semua non-login seperti dulu.

Pengunjung TANPA login (anonim) tetap dapat akses trial 7 hari otomatis
(`shared/auth/anonymous-trial.ts readOrIssueAnonymousTrial()`) untuk sebagian besar fitur
berbayar (Backtest, Recommendations, dst) - baru setelah trial habis, endpoint balas 402
`SUBSCRIPTION_REQUIRED` dan frontend menampilkan `<PaywallModal>`. Halaman itu sendiri (route
Next.js) TIDAK di-gate login sama sekali (`middleware.ts PROTECTED_PAGES = []`) - siapa pun bisa
buka URL-nya, cuma data dari API yang digerbang. Ini SUDAH sesuai prinsip "Page = Public,
Premium Data/API = Protected" (BUILD 002).

Admin: satu sumber kebenaran `isAdminServer()`, cookie `sahamlens_admin` (`ADMIN_COOKIE` di
`shared/constants/cookie-names.ts`) - login lewat `/admin-login/key?key=<ADMIN_SECRET_KEY>` atau
password admin di database (bisa diganti sendiri lewat `/admin`). Tidak ada lagi Telegram Login
Widget atau dua-skema-cookie-yang-gak-nyambung seperti versi arsitektur sebelumnya.

## File yang jangan diubah tanpa alasan kuat

- `.vercelignore` - exclude `mobile/` wajib ada (lihat bagian jebakan deploy di atas).
- `shared/database/schema.service.ts` - satu-satunya sumber definisi skema Postgres, idempoten.
  Kalau nambah tabel baru, tambahkan `CREATE TABLE IF NOT EXISTS` di sini, jangan bikin file SQL
  terpisah yang tidak pernah dijalankan (pelajaran dari `supabase/schema.sql`, dihapus 2026-08-03
  karena sudah lama superseded dan tidak direferensikan kode manapun).

## Jadwal Vercel Cron

Vercel Cron didefinisikan di `vercel.json`, otomatis dibuat/diupdate saat deploy Production,
dan ekspresi cron-nya memakai UTC. Endpoint cron native harus tetap dilindungi `CRON_SECRET`
supaya tidak bisa dipicu publik.

| Endpoint | Nama job | Cron (UTC) | Setara WIB | Config | Guard |
|---|---|---|---|---|---|
| `/api/cron/lens-bucket-backtest` | `lens-bucket-backtest` | `0 10 * * 1-5` | 17:00 Senin-Jumat | `vercel.json` | `Authorization: Bearer <CRON_SECRET>` |
| `/api/cron/lens-score-optimizer` | `lens-score-optimizer` | `0 11 * * 0` | 18:00 Minggu | `vercel.json` | `Authorization: Bearer <CRON_SECRET>` |

Catatan operasional: job ini membaca `lens_radar_history`, mengambil open H+1 dari Yahoo
OHLC lewat layer teknikal yang sudah ada, lalu menyimpan agregat ke `lens_bucket_stats`.
Kalau `CRON_SECRET` belum diset di Vercel Production, request cron akan 401 by design.

`lens-score-optimizer` hanya membuat proposal bobot di `lens_weight_proposals`, tidak
mengubah bobot production secara otomatis. Kalau proposal berstatus
`INSUFFICIENT_COMPONENT_HISTORY`, tunggu beberapa run `ai-pick-scan` karena breakdown
komponen baru mulai diarsipkan ke `lens_radar_history` sejak perubahan 2026-08-05 ini.

## Jadwal QStash

Mayoritas cron lama dijalankan lewat QStash dan diverifikasi dengan
`verifyQStashSignature()` di tiap route. Nama job di kolom kedua sama persis dengan
argumen `withJobRunLog()`, jadi riwayat jalannya bisa ditelusuri lewat log job.

9 jadwal (8 diverifikasi live lewat `GET /v2/schedules` semua status SUCCESS terakhir
jalan, `market-summary` ditambahkan 2026-08-05 - lihat catatan optimasi loading di
bawah tabel):

| Endpoint | Nama job | Cron (UTC) | Setara WIB |
|---|---|---|---|
| `/api/cron/recommendation-scan` | `recommendation-scan` | `*/15 2-8 * * 1-5` | tiap 15 menit, 09:00-15:00 hari bursa |
| `/api/cron/breakout-scan` | `breakout-scan` | `*/5 2-8 * * 1-5` | tiap 5 menit, 09:00-15:00 hari bursa |
| `/api/cron/market-pulse` | `market-pulse` | `*/5 2-8 * * 1-5` | tiap 5 menit, 09:00-15:00 hari bursa |
| `/api/cron/market-summary` | `market-summary` | `*/5 2-8 * * 1-5` | tiap 5 menit, 09:00-15:00 hari bursa |
| `/api/cron/ai-pick-scan` | `ai-pick-scan` | `*/5 2-9 * * 1-5` | tiap 5 menit, 09:00-16:00 hari bursa |
| `/api/cron/watchlist-alert` | `watchlist-alert` | `*/5 2-8 * * 1-5` | tiap 5 menit, 09:00-15:00 hari bursa |
| `/api/cron/macro` | `macro` | `0 3 * * 1-5` | 10:00 hari bursa |
| `/api/cron/fundamental-snapshot` | `fundamental-snapshot` | `0 22 * * 0-4` | 05:00 hari bursa (Senin-Jumat) |
| `/api/cron/backtest-precompute` | `backtest-precompute` | `30 22 * * 0-4` | 05:30 hari bursa (Senin-Jumat) |

**Optimasi loading 2026-08-05**: `market-summary` adalah satu-satunya endpoint publik
berat (scan 250 saham) yang SEBELUMNYA tidak punya cron warmer - murni `getOrCompute()`
on-demand dengan TTL 2 menit. Karena endpoint ini dipakai landing page `/` dan `/home`
(halaman paling sering dibuka, tanpa login), pengunjung pertama tiap 2 menit menanggung
scan live 250 saham (bisa berumur beberapa detik) - salah satu penyebab utama keluhan
"aplikasi lemot". Sekarang dijadwalkan sama seperti `market-pulse`, TTL `MARKET_SUMMARY`
diperpanjang ke 6 menit (`shared/cache/ttl-policy.ts`). **Jadwal ini masih perlu
didaftarkan manual ke QStash** (lihat perintah `curl` di bawah) - kode dan cache TTL-nya
sudah dideploy, tapi schedule baru tidak otomatis terdaftar hanya dari push kode.

Sesi ini juga men-code-split `jsPDF`/`jspdf-autotable`/`xlsx` di `/dashboard`,
`/portfolio`, dan `/admin` (ExportButton) - ketiga library itu sebelumnya di-import
statis padahal hanya dipakai saat tombol Export/Download PDF diklik, jadi ikut terbundel
ke JS awal dua halaman tersibuk aplikasi ini. Sekarang `import()` dinamis di dalam
handler klik.

QStash menjadwalkan dalam UTC; WIB = UTC+7. Karena itu jadwal harian ditulis di hari
sebelumnya (`0-4` = Minggu-Kamis UTC menghasilkan Senin-Jumat WIB).

`backtest-precompute` didaftarkan 2026-08-03 (sebelumnya ADA di kode tapi TIDAK terdaftar
di QStash - `/api/backtest` selalu jatuh ke precompute sinkron lambat di dalam request).
Dijadwalkan 30 menit setelah `fundamental-snapshot` (murni supaya tidak start di detik yang
sama, keduanya independen satu sama lain) - cache `BACKTEST_INDICATORS` TTL 36 jam
(`shared/cache/ttl-policy.ts`), cukup untuk gap harian + buffer akhir pekan.

Mendaftarkan jadwal baru - ganti `<DOMAIN>` dengan domain produksi, `QSTASH_TOKEN` diambil
dari dashboard Upstash:

```bash
curl -XPOST "https://qstash.upstash.io/v2/schedules/https://<DOMAIN>/api/cron/ai-pick-scan" \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Upstash-Cron: */5 2-9 * * 1-5"

curl -XPOST "https://qstash.upstash.io/v2/schedules/https://<DOMAIN>/api/cron/fundamental-snapshot" \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Upstash-Cron: 0 22 * * 0-4"
```

Memeriksa jadwal yang aktif:

```bash
curl -s "https://qstash.upstash.io/v2/schedules" -H "Authorization: Bearer $QSTASH_TOKEN"
```

Kalau `ai-pick-scan` belum pernah jalan, `/api/ai-pick` menjawab `ready: false` dan halaman
AI Pick menampilkan "Data sedang disiapkan" - itu perilaku yang disengaja, bukan error.
Endpoint sengaja TIDAK memindai sendiri saat cache kosong, karena satu request pengguna
akan menanggung ~109 fetch Yahoo.

**Urutan pendaftaran penting: `fundamental-snapshot` dulu, baru `ai-pick-scan`.** Diukur
2026-08-03 dengan universe yang sama: tanpa snapshot fundamental, `fundamental_score`
selalu 0 sehingga skor maksimal cuma 70 (teknikal 40 + flow 30), dan **tidak satu pun dari
109 saham mencapai ambang 60** - daftar tampil nyaris kosong. Dengan snapshot terisi,
sebarannya `{">=75": 3, "60-74": 10, "45-59": 46, "<45": 50}` dan daftar penuh 10 baris
berskor 64-91.

Snapshot fundamental baru terisi saat jadwal hariannya jalan (05:00 WIB). Untuk memicunya
sekali saat itu juga - misalnya tepat setelah deploy pertama - pakai `publish`, bukan
`schedules`:

```bash
curl -XPOST "https://qstash.upstash.io/v2/publish/https://sahamlens.vercel.app/api/cron/fundamental-snapshot" \
  -H "Authorization: Bearer $QSTASH_TOKEN"
```

Status per 2026-08-03: **ketujuh jadwal SUDAH terdaftar dan aktif** (lihat tabel di atas,
semua `lastScheduleStates: SUCCESS` saat terakhir dicek). Kalau menemukan halaman AI Pick
menampilkan "Data sedang disiapkan" padahal jadwal aktif, curigai cache Redis kosong/expired
atau job terakhir gagal - cek `job_run_log` (tabel Postgres) atau `GET /v2/schedules`, bukan
asumsi jadwalnya belum didaftarkan.

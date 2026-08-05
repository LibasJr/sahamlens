import { pool } from './postgres.client';

// BUILD 005 (Database Hardening) - satu titik definisi skema untuk semua tabel yang
// SEBELUMNYA tidak punya guard sama sekali (audit: hanya modules/user/repository/
// user.repository.ts yang self-provision, 7 tabel lain - portfolios/holdings/
// transactions/macro_indicators/alerts/watchlists/job_run_log - diam-diam
// mengasumsikan tabel sudah ada di Neon tanpa definisi ter-commit di manapun).
//
// CREATE TABLE/INDEX IF NOT EXISTS - idempoten & aditif murni, TIDAK PERNAH
// menyentuh/menghapus data. Terhadap tabel yang sudah hidup di produksi, blok
// CREATE TABLE otomatis no-op (tabel sudah ada); CREATE INDEX-nya yang benar-benar
// menambah index baru kalau belum ada. Kolom di sini disamakan PERSIS dengan nama
// yang dipakai query nyata di masing-masing repository (bukan tebakan) - lihat
// komentar per tabel untuk sumbernya.
//
// TIDAK menambah FOREIGN KEY / soft-delete di sini secara sepihak: constraint FK
// yang dipasang belakangan ke tabel produksi bisa GAGAL kalau ada baris yatim
// (orphan) yang sudah terlanjur ada, dan itu tidak bisa diverifikasi dari kode -
// butuh pengecekan data dulu. Soft-delete juga sengaja dilewati untuk alerts/
// watchlists karena mengubah semantik ON CONFLICT (user_id, symbol) yang sudah
// dipakai fitur upsert - risiko regresi lebih besar dari manfaatnya untuk data
// non-finansial seperti ini. `transactions` sendiri sudah berfungsi sebagai audit
// log insert-only untuk trading (tidak pernah di-UPDATE/DELETE oleh kode manapun).

let schemaReady: Promise<void> | null = null;

export function ensureSharedSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool
      .query(
        `
      -- modules/portfolio/repository/portfolio.repository.ts
      CREATE TABLE IF NOT EXISTS portfolios (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        name TEXT,
        cash NUMERIC NOT NULL DEFAULT 0,
        initial_cash NUMERIC NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- modules/portfolio/repository/holdings.repository.ts
      CREATE TABLE IF NOT EXISTS holdings (
        portfolio_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        lots NUMERIC NOT NULL DEFAULT 0,
        avg_price NUMERIC NOT NULL DEFAULT 0,
        PRIMARY KEY (portfolio_id, symbol)
      );

      -- modules/portfolio/repository/transaction.repository.ts
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        portfolio_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        type TEXT NOT NULL,
        price NUMERIC,
        lots NUMERIC,
        pnl NUMERIC,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- Index baru: query cursor-pagination listTransactions() selalu WHERE
      -- portfolio_id = $1 [AND created_at < $2] ORDER BY created_at DESC.
      CREATE INDEX IF NOT EXISTS idx_transactions_portfolio_created
        ON transactions (portfolio_id, created_at DESC);

      -- modules/macro/repository/macro.repository.ts
      CREATE TABLE IF NOT EXISTS macro_indicators (
        id BIGSERIAL PRIMARY KEY,
        indicator TEXT NOT NULL,
        value NUMERIC NOT NULL,
        source TEXT,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- Index baru: getLatestIndicator() selalu WHERE indicator = $1 ORDER BY recorded_at DESC LIMIT 1.
      CREATE INDEX IF NOT EXISTS idx_macro_indicators_indicator_recorded
        ON macro_indicators (indicator, recorded_at DESC);

      -- modules/watchlist/repository/alert.repository.ts
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        condition_type TEXT NOT NULL,
        condition_value NUMERIC,
        triggered BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- Index baru: listAlerts()/countAlerts() selalu WHERE user_id = $1.
      CREATE INDEX IF NOT EXISTS idx_alerts_user_created
        ON alerts (user_id, created_at DESC);
      -- Index baru: listPendingAlerts() (job evaluasi, lintas SEMUA user) full-scan
      -- WHERE triggered = false tanpa filter user - partial index jauh lebih kecil
      -- daripada index penuh karena baris triggered=true (mayoritas seiring waktu)
      -- tidak pernah masuk index ini.
      CREATE INDEX IF NOT EXISTS idx_alerts_pending
        ON alerts (triggered) WHERE triggered = false;

      -- modules/watchlist/repository/watchlist.repository.ts
      CREATE TABLE IF NOT EXISTS watchlists (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        buy_price NUMERIC,
        alert_price NUMERIC,
        lot NUMERIC,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, symbol)
      );
      -- Index baru: listAllWatchlistsPaginated() (admin, lintas user) ORDER BY
      -- created_at DESC tanpa filter user_id - UNIQUE(user_id, symbol) di atas tidak
      -- membantu query ini karena user_id bukan kolom pertama yang di-filter.
      CREATE INDEX IF NOT EXISTS idx_watchlists_created
        ON watchlists (created_at DESC);

      -- modules/fundamental/repository/fundamental-history.repository.ts
      -- ARSIP POINT-IN-TIME (Phase 0 / P0-5). Append-only: satu baris per
      -- (ticker, observed_date), TIDAK PERNAH di-UPDATE/DELETE oleh kode manapun.
      -- Alasannya spesifik: writeFundamentalSnapshot() menulis ke SATU key Redis
      -- ber-TTL 24 jam, jadi setiap eksekusi cron menimpa hari sebelumnya - data
      -- fundamental hari kemarin hilang permanen dan tidak bisa diambil kembali
      -- dengan cara apa pun. Tabel ini yang menyimpannya supaya backtest fundamental
      -- kelak punya data "apa yang KITA ketahui pada tanggal T", bukan data hari ini
      -- yang diterapkan mundur (look-ahead bias).
      --
      -- observed_date = tanggal KALENDER WIB saat snapshot diambil (bukan
      -- tanggal laporan keuangan - Yahoo tidak menyediakan tanggal publikasinya).
      -- DATE, bukan TIMESTAMPTZ: yang bermakna di sini adalah harinya, dan
      -- membandingkan timestamp lintas zona waktu justru sumber bug as-of.
      --
      -- Kolom nilai NUMERIC NULL - null berarti "sumber data tidak menyediakan
      -- angka ini pada hari itu", dan itu FAKTA yang wajib ikut terarsip, bukan
      -- baris yang di-skip (kalau di-skip, as-of query akan mengembalikan angka
      -- hari sebelumnya seolah masih berlaku).
      CREATE TABLE IF NOT EXISTS fundamental_history (
        ticker TEXT NOT NULL,
        observed_date DATE NOT NULL,
        per NUMERIC,
        pbv NUMERIC,
        roe NUMERIC,
        der NUMERIC,
        current_ratio NUMERIC,
        revenue_growth NUMERIC,
        source TEXT NOT NULL DEFAULT 'yahoo-quoteSummary',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (ticker, observed_date)
      );
      -- PRIMARY KEY (ticker, observed_date) sudah menjadi index untuk as-of query
      -- (WHERE ticker = $1 AND observed_date <= $2 ORDER BY observed_date DESC
      -- LIMIT 1) karena btree multikolom bisa dipakai untuk range scan mundur pada
      -- kolom kedua begitu kolom pertama terikat. Index tambahan di bawah untuk
      -- query lintas-ticker per tanggal (mis. "seluruh universe per 2026-09-01"),
      -- yang TIDAK bisa memakai index PK karena ticker tidak difilter.
      CREATE INDEX IF NOT EXISTS idx_fundamental_history_date
        ON fundamental_history (observed_date);

      -- modules/lens-radar/service/bucket-backtest.service.ts
      -- Histori LensRadar point-in-time yang menjadi input validasi bucket.
      -- Tabel ini bisa sudah dibuat oleh job scanner lama; definisi di sini hanya
      -- guard idempoten supaya production tidak 500 saat kolom market_cap belum ada.
      CREATE TABLE IF NOT EXISTS lens_radar_history (
        date DATE NOT NULL,
        ticker TEXT NOT NULL,
        lens_score NUMERIC NOT NULL,
        close_price NUMERIC NOT NULL,
        market_cap NUMERIC,
        technical_score NUMERIC,
        fundamental_score NUMERIC,
        flow_score NUMERIC,
        coverage_pct NUMERIC,
        score_version TEXT,
        valuation_version TEXT,
        signal_version TEXT,
        data_snapshot_version TEXT,
        calculation_timestamp TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (date, ticker)
      );
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS market_cap NUMERIC;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS technical_score NUMERIC;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS fundamental_score NUMERIC;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS flow_score NUMERIC;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS coverage_pct NUMERIC;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS score_version TEXT;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS valuation_version TEXT;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS signal_version TEXT;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS data_snapshot_version TEXT;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS calculation_timestamp TIMESTAMPTZ;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
      CREATE INDEX IF NOT EXISTS idx_lens_radar_history_ticker_date
        ON lens_radar_history (ticker, date);

      -- Agregasi validasi harian LensScore per bucket. Diisi Vercel Cron jam 17:00 WIB
      -- setelah sesi reguler bursa selesai. Idempoten per (run_date, bucket) supaya
      -- rerun/manual trigger memperbarui angka hari itu, bukan membuat baris dobel.
      CREATE TABLE IF NOT EXISTS lens_bucket_stats (
        run_date DATE NOT NULL,
        bucket TEXT NOT NULL,
        avg_t1 NUMERIC,
        avg_t5 NUMERIC,
        avg_t20 NUMERIC,
        win_rate_t5 NUMERIC,
        win_rate_t20 NUMERIC,
        max_drawdown_t20 NUMERIC,
        avg_win_t20 NUMERIC,
        avg_loss_t20 NUMERIC,
        total_samples INTEGER NOT NULL DEFAULT 0,
        source_rows INTEGER NOT NULL DEFAULT 0,
        unique_tickers INTEGER NOT NULL DEFAULT 0,
        round_trip_cost_pct NUMERIC NOT NULL DEFAULT 0.5,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (run_date, bucket)
      );
      ALTER TABLE lens_bucket_stats
        ADD COLUMN IF NOT EXISTS max_drawdown_t20 NUMERIC;
      ALTER TABLE lens_bucket_stats
        ADD COLUMN IF NOT EXISTS avg_win_t20 NUMERIC;
      ALTER TABLE lens_bucket_stats
        ADD COLUMN IF NOT EXISTS avg_loss_t20 NUMERIC;
      CREATE INDEX IF NOT EXISTS idx_lens_bucket_stats_run_date
        ON lens_bucket_stats (run_date DESC);

      -- modules/lens-radar/service/lens-score-optimizer.service.ts
      -- Proposal bobot LensScore dari optimizer mingguan. Tidak pernah dipakai otomatis
      -- oleh scoring production; admin harus approve/manual apply di luar tabel ini.
      CREATE TABLE IF NOT EXISTS lens_weight_proposals (
        id BIGSERIAL PRIMARY KEY,
        run_date DATE NOT NULL,
        status TEXT NOT NULL,
        reason TEXT,
        baseline_weights JSONB NOT NULL,
        proposed_weights JSONB,
        baseline_spread_t20 NUMERIC,
        proposed_spread_t20 NUMERIC,
        baseline_p_value NUMERIC,
        proposed_p_value NUMERIC,
        baseline_sample_size INTEGER NOT NULL DEFAULT 0,
        proposed_sample_size INTEGER NOT NULL DEFAULT 0,
        component_sample_size INTEGER NOT NULL DEFAULT 0,
        candidate_count INTEGER NOT NULL DEFAULT 0,
        lookback_days INTEGER NOT NULL DEFAULT 90,
        stats_window_start DATE,
        stats_window_end DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        approved_at TIMESTAMPTZ,
        approved_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_lens_weight_proposals_created
        ON lens_weight_proposals (created_at DESC);

      -- shared/scheduler/job-run-log.repository.ts
      CREATE TABLE IF NOT EXISTS job_run_log (
        id BIGSERIAL PRIMARY KEY,
        job_name TEXT NOT NULL,
        item_key TEXT,
        status TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at TIMESTAMPTZ,
        error_message TEXT,
        meta JSONB
      );
      -- Index baru: getLastRun() selalu WHERE job_name = $1 ORDER BY started_at DESC LIMIT 1.
      CREATE INDEX IF NOT EXISTS idx_job_run_log_name_started
        ON job_run_log (job_name, started_at DESC);
    `
      )
      .then(() => {});
  }
  return schemaReady;
}

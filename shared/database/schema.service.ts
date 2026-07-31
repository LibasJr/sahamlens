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

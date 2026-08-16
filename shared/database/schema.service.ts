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

      -- LensAI feedback: disimpan hanya setelah pengguna secara eksplisit menekan
      -- "Membantu" atau "Tidak tepat". Tidak ada profiling otomatis; payload dibatasi
      -- di route dan id pesan klien dibuat acak agar satu jawaban dapat diperbarui
      -- dari positif ke negatif (atau sebaliknya) tanpa menduplikasi catatan.
      CREATE TABLE IF NOT EXISTS lensai_feedback (
        id TEXT PRIMARY KEY,
        client_message_id TEXT UNIQUE NOT NULL,
        user_id TEXT,
        rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
        prompt TEXT NOT NULL,
        answer TEXT NOT NULL,
        intent TEXT,
        source_label TEXT,
        data_timestamp TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_lensai_feedback_created
        ON lensai_feedback (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_lensai_feedback_rating_created
        ON lensai_feedback (rating, created_at DESC);

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
      -- PIT v2: akhir periode laporan dipisahkan dari tanggal publikasi/observed_date.
      -- Nullable supaya seluruh snapshot historis lama (termasuk 2026-01-30) tetap valid
      -- dan TIDAK perlu diubah/backfill secara spekulatif.
      ALTER TABLE fundamental_history
        ADD COLUMN IF NOT EXISTS period_end DATE;
      CREATE INDEX IF NOT EXISTS idx_fundamental_history_period_end
        ON fundamental_history (ticker, period_end);

      -- KONTEKS SEKTOR POINT-IN-TIME (audit kuantitatif 2026-08-11, temuan C-02).
      --
      -- Kenapa di tabel INI dan bukan tabel sendiri: ketiga nilai ini datang dari
      -- panggilan quoteSummary yang SAMA, pada hari yang sama, dengan semantik as-of yang
      -- sama persis seperti kolom fundamental di atasnya. Tabel terpisah hanya akan
      -- menambah join dan satu lagi kesempatan untuk dua sumber kebenaran berbeda
      -- pendapat tentang tanggal.
      --
      -- Cron fundamental-snapshot SUDAH mengambil assetProfile.sector/industry dan
      -- summaryDetail.payoutRatio sejak temuan P1-10/P1-11 - nilainya masuk ke cache
      -- Redis lalu DIBUANG DIAM-DIAM saat pengarsipan karena tidak ada kolomnya. Akibatnya
      -- scripts/backfill-lens-history.mjs terpaksa mengirim sector berisi null semua
      -- ke calculateScore(), sementara app/api/stock/[ticker] mengirim sektor asli - dua
      -- model skor berbeda untuk emiten yang sama. Diuji atas 110.592 kombinasi: selisih
      -- sampai 10 poin LensScore dan 8,4% berpindah bucket.
      --
      -- Nullable: seluruh baris arsip lama tetap valid dan TIDAK di-backfill secara
      -- spekulatif. Baris tanpa sektor akan dinilai sebagai UNCLASSIFIED, sama seperti
      -- sebelumnya, dan itu terlihat apa adanya di keluaran scoring.
      ALTER TABLE fundamental_history
        ADD COLUMN IF NOT EXISTS yahoo_sector TEXT,
        ADD COLUMN IF NOT EXISTS yahoo_industry TEXT,
        ADD COLUMN IF NOT EXISTS payout_ratio NUMERIC;


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
        universe_version TEXT,
        valuation_version TEXT,
        signal_version TEXT,
        data_snapshot_version TEXT,
        calculation_timestamp TIMESTAMPTZ,
        raw_close_price NUMERIC,
        adjusted_close_price NUMERIC,
        price_basis TEXT,
        adjustment_factor NUMERIC,
        corporate_action_status TEXT,
        price_data_timestamp TIMESTAMPTZ,
        price_data_version TEXT,
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
        ADD COLUMN IF NOT EXISTS universe_version TEXT;

      -- VERDICT PEMBANDING (2026-08-12). Sampai sekarang hanya LensScore yang diarsipkan,
      -- sementara kartu "Konsensus AI" dihitung di browser, ditampilkan, lalu hilang.
      -- Akibatnya pertanyaan "mana yang paling mendekati kenyataan" tidak bisa dijawab -
      -- bukan karena sulit, melainkan karena rekam jejak salah satunya tidak pernah ada.
      -- Empat kolom ini membuat verdict miniCouncil bisa diuji terhadap return T+20 yang
      -- SAMA dengan yang dipakai menguji LensScore, di populasi yang sama.
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS council_signal TEXT;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS council_confidence NUMERIC;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS council_buy_pct NUMERIC;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS council_sell_pct NUMERIC;
      -- Dipisah dari signal='HOLD': "agen terpecah" dan "pasar netral" adalah dua keadaan
      -- berbeda, dan menyatukannya akan membuat keduanya tidak bisa diukur terpisah.
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS council_divided BOOLEAN;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS valuation_version TEXT;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS signal_version TEXT;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS data_snapshot_version TEXT;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS calculation_timestamp TIMESTAMPTZ;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS raw_close_price NUMERIC;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS adjusted_close_price NUMERIC;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS price_basis TEXT;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS adjustment_factor NUMERIC;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS corporate_action_status TEXT;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS price_data_timestamp TIMESTAMPTZ;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS price_data_version TEXT;
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
      -- ADV20 point-in-time: rata-rata (close x volume) 20 bar terakhir SAMPAI tanggal
      -- baris ini, dalam rupiah. Dipakai backtest untuk membuang sinyal pada saham yang
      -- pada hari itu terlalu sepi untuk dieksekusi. Disimpan alih-alih dihitung ulang
      -- saat backtest supaya angkanya terikat pada tanggal sinyal, bukan pada likuiditas
      -- hari ini - menghitungnya belakangan dari histori penuh adalah look-ahead.
      -- NULL berarti baris ini diarsipkan sebelum kolom ada; artinya "tidak tahu",
      -- dan backtest menghitungnya terpisah, tidak diam-diam meloloskannya sebagai likuid.
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS avg_value_20d NUMERIC;

      -- KELAYAKAN POINT-IN-TIME (audit kuantitatif 2026-08-11, temuan H-01).
      --
      -- Produksi menolak memberi rekomendasi kalau evaluateMinimalEligibility() tidak
      -- mengembalikan ELIGIBLE - histori terlalu pendek, kemungkinan tidak
      -- diperdagangkan, data basi, kelengkapan di bawah 55%, atau likuiditas di bawah
      -- lantai. Backtest DULU tidak menerapkan satu pun gerbang itu, jadi tabel bucket
      -- memuat sinyal yang aplikasinya sendiri tidak akan pernah rekomendasikan.
      --
      -- Statusnya diarsipkan, BUKAN dihitung ulang saat backtest, karena alasan yang
      -- sama dengan avg_value_20d: gerbang ini menilai apa yang diketahui PADA tanggal
      -- sinyal. Menghitungnya belakangan dari histori penuh akan menyatakan saham layak
      -- karena hari ini ia likuid.
      --
      -- NULL = baris diarsipkan sebelum kolom ada, artinya "tidak tahu". Backtest
      -- menghitungnya terpisah dan membuangnya, tidak meloloskannya sebagai layak.
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS eligibility_status TEXT,
        ADD COLUMN IF NOT EXISTS eligibility_reason_codes TEXT;

      -- Bobot yang BENAR-BENAR punya data per kelompok, dalam satuan bobot kelompok
      -- (temuan H-03). Penyebut yang benar untuk merekonstruksi kualitas kelompok saat
      -- calibration lab mensimulasikan bobot alternatif. coverage_pct adalah TOTAL dan
      -- tidak bisa dipecah balik menjadi per-kelompok, jadi angkanya harus diarsipkan.
      ALTER TABLE lens_radar_history
        ADD COLUMN IF NOT EXISTS technical_available_max NUMERIC,
        ADD COLUMN IF NOT EXISTS fundamental_available_max NUMERIC,
        ADD COLUMN IF NOT EXISTS flow_available_max NUMERIC;

      CREATE INDEX IF NOT EXISTS idx_lens_radar_history_ticker_date
        ON lens_radar_history (ticker, date);
      CREATE INDEX IF NOT EXISTS idx_lens_radar_history_score_price_basis_date
        ON lens_radar_history (score_version, price_basis, date);

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
        worst_mae NUMERIC,
        max_dd_p95 NUMERIC,
        avg_win_t20 NUMERIC,
        avg_loss_t20 NUMERIC,
        total_samples INTEGER NOT NULL DEFAULT 0,
        source_rows INTEGER NOT NULL DEFAULT 0,
        unique_tickers INTEGER NOT NULL DEFAULT 0,
        round_trip_cost_pct NUMERIC NOT NULL DEFAULT 0.5,
        score_version TEXT,
        price_basis TEXT,
        price_data_version TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (run_date, bucket)
      );
      -- max_drawdown_t20 dulu menyimpan drawdown equity curve yang selalu -100% karena
      -- sinyal tumpang tindih dikalikan beruntun. Kolomnya dipertahankan tetapi diganti
      -- nama jadi worst_mae supaya isinya jujur: satu trade terburuk. max_dd_p95 adalah
      -- metrik yang ditampilkan di UI.
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'lens_bucket_stats' AND column_name = 'max_drawdown_t20'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'lens_bucket_stats' AND column_name = 'worst_mae'
        ) THEN
          ALTER TABLE lens_bucket_stats RENAME COLUMN max_drawdown_t20 TO worst_mae;
        END IF;
      END $$;
      ALTER TABLE lens_bucket_stats
        ADD COLUMN IF NOT EXISTS worst_mae NUMERIC;
      ALTER TABLE lens_bucket_stats
        ADD COLUMN IF NOT EXISTS max_dd_p95 NUMERIC;
      -- Deploy lama yang masih hidup akan membuat ulang max_drawdown_t20 lewat
      -- ensureSharedSchema-nya sendiri. DROP ini membersihkannya setelah rollout selesai.
      ALTER TABLE lens_bucket_stats
        DROP COLUMN IF EXISTS max_drawdown_t20;
      -- avg_t20 SUDAH bersih biaya (round_trip_cost_pct dikurangkan di dalam
      -- calculateForwardReturnPct). Kolom gross disimpan berdampingan supaya besarnya
      -- ongkos terhadap edge terlihat, bukan supaya ada dua definisi "return T+20".
      ALTER TABLE lens_bucket_stats
        ADD COLUMN IF NOT EXISTS avg_t20_gross NUMERIC;
      -- Berapa trade dibuang gerbang likuiditas ADV20 pada run ini. Disimpan per baris
      -- bucket karena angkanya adalah bagian dari cara sampel bucket itu terbentuk.
      ALTER TABLE lens_bucket_stats
        ADD COLUMN IF NOT EXISTS illiquid_rows_skipped INTEGER;
      ALTER TABLE lens_bucket_stats
        ADD COLUMN IF NOT EXISTS unknown_liquidity_rows INTEGER;
      ALTER TABLE lens_bucket_stats
        ADD COLUMN IF NOT EXISTS avg_win_t20 NUMERIC;
      ALTER TABLE lens_bucket_stats
        ADD COLUMN IF NOT EXISTS avg_loss_t20 NUMERIC;
      ALTER TABLE lens_bucket_stats
        ADD COLUMN IF NOT EXISTS score_version TEXT;
      ALTER TABLE lens_bucket_stats
        ADD COLUMN IF NOT EXISTS price_basis TEXT;
      ALTER TABLE lens_bucket_stats
        ADD COLUMN IF NOT EXISTS price_data_version TEXT;
      CREATE INDEX IF NOT EXISTS idx_lens_bucket_stats_run_date
        ON lens_bucket_stats (run_date DESC);
      CREATE INDEX IF NOT EXISTS idx_lens_bucket_stats_score_version_run_date
        ON lens_bucket_stats (score_version, run_date DESC);

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

      -- modules/ownership-flow/repository/ownership-flow-history.repository.ts
      --
      -- ARSIP KOMPOSISI KEPEMILIKAN POINT-IN-TIME. Tabel BARU dan TERPISAH dari
      -- seluruh tabel broker summary - Ownership Flow mengukur komposisi
      -- kepemilikan, bukan transaksi per kode broker (lihat
      -- docs/ownership-flow/broker-vs-ownership.md). Menggabungkan keduanya ke
      -- satu tabel akan mengundang kesimpulan yang tidak punya dasar data.
      --
      -- observed_date DATE, BUKAN TIMESTAMPTZ: yang bermakna adalah harinya, dan
      -- ia berasal dari pernyataan "As of ..." milik SUMBER - bukan dari jam
      -- cron berjalan. fetched_at TIMESTAMPTZ menyimpan kapan server kita
      -- mengambilnya. Keduanya sengaja kolom berbeda; menyamakannya menghapus
      -- kemampuan backtest point-in-time (§6).
      --
      -- NUMERIC(7,4) untuk persentase: cukup untuk 0.0000-100.0000 dengan 4
      -- desimal, dan TIDAK menyimpan angka sebagai TEXT. NUMERIC(24,0) untuk
      -- jumlah efek - emiten IDX bisa punya ratusan miliar lembar, jauh melewati
      -- BIGINT yang aman di JS, jadi presisinya dijaga di sisi database dan
      -- pembacanya mengubah ke number lewat toNum().
      --
      -- Kolom nilai NULLABLE: null berarti "sumber tidak menyediakan angka ini",
      -- sebuah FAKTA yang wajib ikut terarsip. Ia tidak boleh diubah jadi 0 -
      -- nol adalah klaim kuantitatif yang tidak pernah diukur.
      CREATE TABLE IF NOT EXISTS ownership_flow_history (
        id BIGSERIAL PRIMARY KEY,
        ticker TEXT NOT NULL,
        observed_date DATE NOT NULL,
        local_pct NUMERIC(7,4),
        foreign_pct NUMERIC(7,4),
        scripless_pct NUMERIC(7,4),
        total_securities NUMERIC(24,0),
        local_shares NUMERIC(24,0),
        foreign_shares NUMERIC(24,0),
        source TEXT NOT NULL,
        source_url TEXT,
        fetched_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- UNIQUE (ticker, observed_date, source) membuat cron IDEMPOTEN: eksekusi
      -- ulang pada hari yang sama jadi no-op lewat ON CONFLICT DO NOTHING, dan
      -- baris PERTAMA yang menang - yaitu keadaan sebagaimana pertama kali kita
      -- ketahui. Kolom source ikut menjadi kunci supaya snapshot harian per emiten
      -- dan arsip bulanan bisa hidup berdampingan untuk tanggal yang sama tanpa
      -- saling menimpa, sekaligus bisa dipakai saling cek.
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ownership_flow_history_ticker_date_source
        ON ownership_flow_history (ticker, observed_date, source);
      -- As-of lookup: WHERE ticker = $1 AND observed_date <= $2 ORDER BY
      -- observed_date DESC LIMIT 1 - btree multikolom dipakai mundur pada kolom
      -- kedua begitu ticker terikat.
      CREATE INDEX IF NOT EXISTS idx_ownership_flow_history_ticker_date
        ON ownership_flow_history (ticker, observed_date DESC);
      -- Query lintas-ticker per tanggal (panel admin: "berapa emiten yang punya
      -- observasi pada tanggal terbaru"), yang tidak bisa memakai index di atas
      -- karena ticker tidak difilter.
      CREATE INDEX IF NOT EXISTS idx_ownership_flow_history_observed_date
        ON ownership_flow_history (observed_date DESC);
    `
      )
      .then(() => {});
  }
  return schemaReady;
}

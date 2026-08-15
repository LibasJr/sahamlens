import { pool } from '@/shared/database/postgres.client';

// SKEMA LENSINTRADAY - TERPISAH TOTAL dari tabel LensScore T+20.
//
// Sengaja TIDAK ditambahkan ke shared/database/schema.service.ts: file itu adalah
// jalur yang dilewati hampir setiap request produksi, dan modul riset ini tidak
// boleh menambah kerja apa pun di sana. Fungsi di bawah hanya dipanggil oleh route
// admin/cron milik Intraday Validation Lab sendiri.
//
// Seluruh DDL bersifat ADITIF & IDEMPOTEN (CREATE ... IF NOT EXISTS). Tidak ada
// DROP, tidak ada RENAME, tidak ada UPDATE terhadap tabel milik modul lain.
// lens_radar_history, lens_bucket_stats, lens_weight_proposals, fundamental_history,
// dan seluruh tabel produksi lain TIDAK DISENTUH sama sekali oleh file ini.

let intradaySchemaReady: Promise<void> | null = null;

export function ensureIntradaySchema(): Promise<void> {
  if (!intradaySchemaReady) {
    intradaySchemaReady = pool
      .query(
        `
      -- Sinyal LensIntraday point-in-time. Satu baris = satu titik grid waktu untuk
      -- satu emiten pada satu hari bursa, pada satu versi model.
      --
      -- signal_timestamp TIMESTAMPTZ: instan absolut, bukan jam lokal tanpa zona.
      -- trading_date DATE terpisah karena "hari bursa WIB" adalah kunci pengelompokan
      -- yang dipakai bootstrap/embargo, dan menurunkannya dari timestamp di setiap
      -- query lintas zona waktu adalah sumber bug as-of yang sudah dikenal di repo ini
      -- (lihat catatan observed_date di shared/database/schema.service.ts).
      CREATE TABLE IF NOT EXISTS intraday_signals (
        id BIGSERIAL PRIMARY KEY,
        ticker TEXT NOT NULL,
        trading_date DATE NOT NULL,
        signal_timestamp TIMESTAMPTZ NOT NULL,
        signal_minute_wib SMALLINT NOT NULL,
        signal_score NUMERIC NOT NULL,
        score_bucket TEXT NOT NULL,
        component_snapshot JSONB NOT NULL,
        model_version TEXT NOT NULL,
        config_hash TEXT NOT NULL,
        data_provider TEXT NOT NULL,
        bar_interval TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- Kunci idempotensi worker: menjalankan ulang backfill hari yang sama TIDAK
      -- boleh menghasilkan sinyal kembar. config_hash ikut masuk kunci supaya dua
      -- konfigurasi berbeda bisa hidup berdampingan tanpa saling menimpa - itulah
      -- yang membuat protokol OOS lama tetap utuh saat formula baru diuji.
      CREATE UNIQUE INDEX IF NOT EXISTS uq_intraday_signals_identity
        ON intraday_signals (ticker, trading_date, signal_minute_wib, model_version, config_hash);
      CREATE INDEX IF NOT EXISTS idx_intraday_signals_date_model
        ON intraday_signals (trading_date, model_version, config_hash);
      CREATE INDEX IF NOT EXISTS idx_intraday_signals_ticker_date
        ON intraday_signals (ticker, trading_date);
      CREATE INDEX IF NOT EXISTS idx_intraday_signals_score
        ON intraday_signals (model_version, config_hash, signal_score);

      -- Hasil per horizon. entry/exit RAW disimpan berdampingan dengan harga setelah
      -- slippage supaya uji sensitivitas biaya bisa dihitung ulang TANPA menyimpan
      -- satu baris per skenario biaya (dan tanpa mengambil ulang data provider).
      CREATE TABLE IF NOT EXISTS intraday_outcomes (
        signal_id BIGINT NOT NULL REFERENCES intraday_signals(id) ON DELETE CASCADE,
        horizon TEXT NOT NULL,
        entry_timestamp TIMESTAMPTZ,
        entry_price NUMERIC,
        entry_price_raw NUMERIC,
        exit_timestamp TIMESTAMPTZ,
        exit_price NUMERIC,
        exit_price_raw NUMERIC,
        gross_return NUMERIC,
        net_return NUMERIC,
        total_cost NUMERIC,
        mfe NUMERIC,
        mae NUMERIC,
        minutes_to_mfe INTEGER,
        minutes_to_mae INTEGER,
        exit_reason TEXT NOT NULL,
        fill_status TEXT NOT NULL,
        hit_take_profit BOOLEAN NOT NULL DEFAULT false,
        hit_stop_loss BOOLEAN NOT NULL DEFAULT false,
        data_quality_status TEXT NOT NULL,
        cost_version TEXT NOT NULL,
        matured_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (signal_id, horizon)
      );
      CREATE INDEX IF NOT EXISTS idx_intraday_outcomes_horizon
        ON intraday_outcomes (horizon, fill_status);
      -- Aditif murni (pola ALTER ... ADD COLUMN IF NOT EXISTS yang sama dengan
      -- shared/database/schema.service.ts). Baris lama tetap valid; NULL berarti
      -- "diarsipkan sebelum kolom ada", bukan diam-diam dianggap false.
      --
      -- Kolom lama slippage_bps_applied/spread_floor_binding merekam sisi entry.
      -- Mulai model v0.1.1 sisi entry dan exit disimpan terpisah, karena harga keluar
      -- bisa melintasi pita fraksi IDX dan lantai biayanya tidak selalu sama.
      ALTER TABLE intraday_outcomes
        ADD COLUMN IF NOT EXISTS slippage_bps_applied NUMERIC,
        ADD COLUMN IF NOT EXISTS spread_floor_binding BOOLEAN,
        ADD COLUMN IF NOT EXISTS tradable BOOLEAN,
        ADD COLUMN IF NOT EXISTS entry_slippage_bps_applied NUMERIC,
        ADD COLUMN IF NOT EXISTS exit_slippage_bps_applied NUMERIC,
        ADD COLUMN IF NOT EXISTS entry_spread_floor_binding BOOLEAN,
        ADD COLUMN IF NOT EXISTS exit_spread_floor_binding BOOLEAN;
      -- Query "hanya sinyal yang benar-benar bisa dieksekusi" dijalankan tiap
      -- validation run, per horizon.
      CREATE INDEX IF NOT EXISTS idx_intraday_outcomes_tradable
        ON intraday_outcomes (horizon, tradable) WHERE fill_status = 'FILLED';

      -- Kualitas data per (ticker, hari bursa). Dipisah dari intraday_signals karena
      -- hari yang datanya rusak justru TIDAK menghasilkan sinyal - kalau disimpan di
      -- tabel sinyal, kegagalan yang paling penting untuk dilihat adalah kegagalan
      -- yang barisnya tidak pernah ada.
      CREATE TABLE IF NOT EXISTS intraday_data_quality (
        ticker TEXT NOT NULL,
        trading_date DATE NOT NULL,
        provider TEXT NOT NULL,
        bar_interval TEXT NOT NULL,
        expected_bars INTEGER NOT NULL,
        valid_bars INTEGER NOT NULL,
        missing_bars INTEGER NOT NULL,
        duplicate_bars INTEGER NOT NULL DEFAULT 0,
        invalid_ohlc_bars INTEGER NOT NULL DEFAULT 0,
        zero_volume_bars INTEGER NOT NULL DEFAULT 0,
        completeness_pct NUMERIC NOT NULL,
        status TEXT NOT NULL,
        max_abs_bar_move_pct NUMERIC,
        retrieved_at TIMESTAMPTZ NOT NULL,
        fetch_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (ticker, trading_date, provider, bar_interval)
      );
      CREATE INDEX IF NOT EXISTS idx_intraday_data_quality_date
        ON intraday_data_quality (trading_date DESC, status);

      -- Satu baris per eksekusi validation run. dataset_hash membuat dua run yang
      -- mengklaim hasil berbeda atas data yang sama langsung ketahuan.
      CREATE TABLE IF NOT EXISTS intraday_validation_runs (
        run_id BIGSERIAL PRIMARY KEY,
        dataset_hash TEXT,
        model_version TEXT NOT NULL,
        config_hash TEXT NOT NULL,
        protocol_version TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ,
        status TEXT NOT NULL,
        sample_raw INTEGER NOT NULL DEFAULT 0,
        sample_effective INTEGER NOT NULL DEFAULT 0,
        result JSONB,
        error_message TEXT,
        triggered_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_intraday_validation_runs_started
        ON intraday_validation_runs (started_at DESC);

      -- Protokol forward out-of-sample. Sekali dibekukan, baris ini TIDAK PERNAH
      -- di-UPDATE oleh kode mana pun (lihat freezeIntradayOosProtocol) - perubahan
      -- formula wajib membuat protocol_version baru, bukan menyunting yang lama.
      CREATE TABLE IF NOT EXISTS intraday_oos_protocols (
        protocol_version TEXT PRIMARY KEY,
        freeze_timestamp TIMESTAMPTZ NOT NULL,
        model_version TEXT NOT NULL,
        config_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        score_formula JSONB NOT NULL,
        weights JSONB NOT NULL,
        thresholds JSONB NOT NULL,
        entry_exit_rules JSONB NOT NULL,
        cost_config JSONB NOT NULL,
        acceptance_criteria JSONB NOT NULL,
        frozen_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_intraday_oos_protocols_freeze
        ON intraday_oos_protocols (freeze_timestamp DESC);

      -- Usulan bobot LensIntraday. TIDAK pernah dibaca oleh scoring produksi apa pun;
      -- ia berhenti di panel admin sampai ada persetujuan eksplisit.
      CREATE TABLE IF NOT EXISTS intraday_weight_proposals (
        proposal_id BIGSERIAL PRIMARY KEY,
        model_version TEXT NOT NULL,
        config_hash TEXT NOT NULL,
        current_weights JSONB NOT NULL,
        proposed_weights JSONB,
        train_result JSONB,
        validation_result JSONB,
        test_result JSONB,
        status TEXT NOT NULL,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        approved_by TEXT,
        approved_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_intraday_weight_proposals_created
        ON intraday_weight_proposals (created_at DESC);

      -- Usulan ambang skor dari threshold simulator. Dipisah dari weight proposals
      -- karena keduanya dipilih dari dataset yang berbeda dan punya risiko multiple
      -- testing sendiri-sendiri.
      CREATE TABLE IF NOT EXISTS intraday_threshold_proposals (
        proposal_id BIGSERIAL PRIMARY KEY,
        model_version TEXT NOT NULL,
        config_hash TEXT NOT NULL,
        proposed_threshold NUMERIC NOT NULL,
        selection_result JSONB NOT NULL,
        status TEXT NOT NULL,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        approved_by TEXT,
        approved_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_intraday_threshold_proposals_created
        ON intraday_threshold_proposals (created_at DESC);
    `
      )
      .then(() => {});
  }
  return intradaySchemaReady;
}

/** Hanya untuk test - membuang memoisasi supaya DDL bisa dipanggil ulang. */
export function resetIntradaySchemaCacheForTests(): void {
  intradaySchemaReady = null;
}

-- Snapshot skor LensRadar yang tidak bisa diubah (append-only).
--
-- KENAPA TABEL INI ADA. Audit arsip 2026-09-24 menemukan `lens_radar_history` menyimpan
-- 3.436.114 baris untuk 1.012.464 pasangan sesi-emiten unik (3,4x lipat): kunci utamanya
-- memuat `score_config_hash`, sehingga setiap kali skor dihitung ulang dengan konfigurasi
-- berbeda, baris BARU ditambahkan alih-alih menimpa. Akibatnya arsip tidak bisa menjawab
-- pertanyaan "skor apa yang benar-benar ditampilkan produk pada sesi itu?" - yang tersimpan
-- hanya hasil hitungan ulang terakhir.
--
-- Tabel ini menyimpan satu baris per (ticker, date) yang ditulis SEKALI. Pengisinya
-- `scripts/snapshot-lens-scores.mjs` memakai `on conflict do nothing`, jadi nilai yang
-- sudah terekam tidak pernah berubah walau skor di hulu dihitung ulang. Dengan begitu
-- klaim performa historis produk (bukan hitungan ulang) bisa diaudit dari sumbernya.
--
-- Additive, tanpa backfill: hanya sesi yang terekam setelah tabel ini ada.

CREATE TABLE IF NOT EXISTS lens_score_snapshot (
  ticker TEXT NOT NULL,
  date DATE NOT NULL,
  lens_score NUMERIC,
  technical_score NUMERIC,
  fundamental_score NUMERIC,
  flow_score NUMERIC,
  coverage_pct NUMERIC,
  score_version TEXT,
  score_config_hash TEXT,
  universe_version TEXT,
  source_calculation_timestamp TIMESTAMPTZ,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, date)
);

CREATE INDEX IF NOT EXISTS lens_score_snapshot_date_idx
  ON lens_score_snapshot (date DESC);

COMMENT ON TABLE lens_score_snapshot IS
  'Snapshot skor LensRadar append-only (satu baris per ticker+tanggal, tidak pernah diperbarui). Sumber: lens_radar_history, materialisasi terbaru saat snapshot diambil.';
-- Broker Summary EOD tingkat PASAR dari API resmi BEI (TradingSummary/GetBrokerSummary).
--
-- KENAPA TABEL BARU, BUKAN broker_summary_daily:
-- broker_summary_daily menyimpan transaksi broker PER EMITEN dengan beli dan jual
-- terpisah (trade_date, ticker, broker_code, buy_value, sell_value, ...). Endpoint
-- GetBrokerSummary tidak menyediakan satu pun dari tiga hal itu - ia hanya memberi
-- agregat SELURUH PASAR per kode broker per hari: Volume, Value, Frequency. Memasukkan
-- data ini ke broker_summary_daily akan menuntut ticker karangan dan pemecahan
-- beli/jual karangan, yang dilarang Zero Dummy Policy. Karena itu ia berdiri sebagai
-- tabelnya sendiri, dengan kolom yang persis sebanyak yang benar-benar diberikan Bursa.
--
-- broker_summary_daily beserta seluruh datanya TIDAK disentuh migration ini.

CREATE TABLE IF NOT EXISTS broker_market_daily (
  id BIGSERIAL PRIMARY KEY,
  trade_date DATE NOT NULL,
  broker_code TEXT NOT NULL,
  broker_name TEXT,
  -- Volume lembar saham yang ditransaksikan broker di seluruh pasar hari itu.
  volume BIGINT NOT NULL,
  -- Nilai transaksi dalam Rupiah. NUMERIC, bukan BIGINT/float: nilai harian satu broker
  -- besar bisa menembus 3,3 triliun dan pembulatan floating point tidak dapat diterima
  -- untuk angka uang.
  value NUMERIC(24, 2) NOT NULL,
  frequency BIGINT NOT NULL,
  source TEXT NOT NULL,
  source_file TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT broker_market_daily_unique UNIQUE (trade_date, broker_code, source)
);

CREATE INDEX IF NOT EXISTS broker_market_daily_date_idx
  ON broker_market_daily (trade_date DESC);

CREATE INDEX IF NOT EXISTS broker_market_daily_broker_date_idx
  ON broker_market_daily (broker_code, trade_date DESC);

COMMENT ON TABLE broker_market_daily IS
  'EOD Broker Summary tingkat pasar dari API resmi BEI TradingSummary/GetBrokerSummary. Agregat per kode broker per hari bursa - TANPA rincian per emiten dan TANPA pemisahan beli/jual, karena Bursa memang tidak menyediakannya di endpoint ini.';

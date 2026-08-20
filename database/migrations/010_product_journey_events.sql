-- Perjalanan riset: click stream beranotasi sesi untuk mengukur syarat beta
-- "Calm Intelligence" (docs/design/CALM_INTELLIGENCE.md, bagian Beta evaluation).
--
-- KENAPA TABEL BARU, BUKAN product_funnel_events:
-- product_funnel_events sengaja dibangun sebagai FUNNEL SEKALI-PER-HARI. Ia membawa
--   CHECK (event_type IN ('locked_view','signup_click','signup_completed'))
-- dan
--   UNIQUE (visitor_id, event_type, feature, event_date)
-- Kedua batasan itu adalah fiturnya, bukan kelalaian: pertanyaan yang dijawabnya
-- ("berapa browser unik yang melihat kartu terkunci lalu mendaftar") memang harus kebal
-- terhadap satu orang yang mengklik dua puluh kali.
--
-- Pertanyaan beta justru kebalikannya. "Berapa lama sampai tindakan berguna pertama",
-- "berapa yang menembus dari ringkasan ke bukti", dan "berapa klik LensRadar yang
-- berlanjut ke analisis" semuanya menghitung URUTAN DI DALAM SATU SESI. Dideduplikasi
-- per hari, angka-angka itu tidak berarti apa-apa - kunjungan kedua di hari yang sama
-- hilang tanpa jejak, dan tidak ada satu pun kolom yang bisa memberi tahu mana yang
-- lebih dulu. Menumpangkannya di tabel funnel juga akan meledakkan kardinalitas kolom
-- `feature` yang dipakai halaman admin.
--
-- product_funnel_events beserta seluruh datanya TIDAK disentuh migration ini.
--
-- KENAPA TANPA CHECK PADA event_name:
-- Daftar event beta masih akan berubah selama masa pengujian. Mengunci daftarnya di DDL
-- berarti setiap event baru menuntut migrasi produksi, dan itulah cara paling pasti agar
-- pengukurannya berhenti dipakai. Yang menjaga kardinalitas adalah allowlist di
-- modules/user/controller/product-journey.controller.ts - satu-satunya jalan tulis ke
-- tabel ini - dan daftarnya dikunci test. Nilai di luar daftar itu ditolak 400 dan tidak
-- pernah sampai ke sini.

CREATE TABLE IF NOT EXISTS product_journey_events (
  id BIGSERIAL PRIMARY KEY,
  -- Browser anonim, kunci yang sama dengan product_funnel_events. Bukan user_id: metrik
  -- beta harus ikut menghitung tamu, dan menautkannya ke akun akan mengubah pengukuran
  -- produk menjadi pelacakan orang.
  visitor_id UUID NOT NULL,
  -- Satu kunjungan. Direset saat tab ditutup (sessionStorage), sehingga "urutan di dalam
  -- satu sesi" punya arti yang sama di data dan di kepala pengguna.
  session_id UUID NOT NULL,
  event_name TEXT NOT NULL,
  -- Permukaan tempat event terjadi (home, technical, breakout_radar, ...). Ikut
  -- di-allowlist di controller; kolom terpisah supaya event yang sama bisa dibandingkan
  -- antar halaman tanpa memecah nama event.
  surface TEXT NOT NULL,
  -- Jarak dari event pertama sesi, dalam milidetik, diukur di klien.
  --
  -- Bukan selisih created_at: event dikirim berkelompok dan bisa tertahan sampai tab
  -- ditutup (keepalive), jadi jam server mengukur kapan paketnya tiba - bukan kapan
  -- pengguna melakukannya. INTEGER cukup untuk ~24 hari sesi.
  session_elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (session_elapsed_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_journey_events_created_at_idx
  ON product_journey_events (created_at DESC);

CREATE INDEX IF NOT EXISTS product_journey_events_name_created_idx
  ON product_journey_events (event_name, created_at DESC);

-- Seluruh metrik beta adalah pertanyaan per sesi, jadi hampir setiap query mengelompokkan
-- di sini lebih dulu.
CREATE INDEX IF NOT EXISTS product_journey_events_session_idx
  ON product_journey_events (session_id, created_at);

COMMENT ON TABLE product_journey_events IS
  'Click stream beranotasi sesi untuk metrik beta Calm Intelligence. Anonim per browser, tanpa user_id, tanpa ticker, dan tanpa deduplikasi harian - urutan di dalam satu sesi adalah pertanyaannya. Retensi dijalankan scripts/cleanup-privacy-retention.mjs (PRIVACY_JOURNEY_RETENTION_DAYS, bawaan 90 hari).';

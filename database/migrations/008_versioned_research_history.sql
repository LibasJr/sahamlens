-- SahamLens Research History Versioning
-- 2026-08-18
--
-- Sebelumnya PK lens_radar_history hanya (date, ticker), sehingga backfill model/universe
-- baru menimpa histori lama. Sekarang identitas dataset ikut score_version + universe_version.

UPDATE lens_radar_history
SET score_version = 'legacy-unversioned'
WHERE score_version IS NULL OR btrim(score_version) = '';

UPDATE lens_radar_history
SET universe_version = 'legacy-unversioned'
WHERE universe_version IS NULL OR btrim(universe_version) = '';

ALTER TABLE lens_radar_history
  ALTER COLUMN score_version SET NOT NULL;

ALTER TABLE lens_radar_history
  ALTER COLUMN universe_version SET NOT NULL;

ALTER TABLE lens_radar_history
  DROP CONSTRAINT IF EXISTS lens_radar_history_pkey;

ALTER TABLE lens_radar_history
  ADD CONSTRAINT lens_radar_history_pkey
  PRIMARY KEY (date, ticker, score_version, universe_version);

CREATE INDEX IF NOT EXISTS idx_lens_radar_history_dataset_date
  ON lens_radar_history (
    score_version,
    universe_version,
    date,
    ticker
  );

COMMENT ON TABLE lens_radar_history IS
'Append-safe LensRadar research history. Dataset identity includes date, ticker, score_version, universe_version.';

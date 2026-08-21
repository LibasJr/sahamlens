-- Bind every research-history observation to the exact frozen LensScore specification.
-- NULL marks legacy/unhashed rows and is intentionally rejected by validation readers.
ALTER TABLE lens_radar_history
  ADD COLUMN IF NOT EXISTS score_config_hash TEXT;

UPDATE lens_radar_history
SET score_config_hash = 'legacy-unhashed'
WHERE score_config_hash IS NULL OR btrim(score_config_hash) = '';

ALTER TABLE lens_radar_history
  ALTER COLUMN score_config_hash SET NOT NULL;

ALTER TABLE lens_radar_history
  DROP CONSTRAINT IF EXISTS lens_radar_history_pkey;

ALTER TABLE lens_radar_history
  ADD CONSTRAINT lens_radar_history_pkey
  PRIMARY KEY (date, ticker, score_version, score_config_hash, universe_version);

CREATE INDEX IF NOT EXISTS idx_lens_radar_history_model_config_date
  ON lens_radar_history (score_version, score_config_hash, universe_version, date, ticker);

COMMENT ON COLUMN lens_radar_history.score_config_hash IS
'Deterministic hash of the complete frozen LensScore specification; NULL means legacy/unverifiable.';

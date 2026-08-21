-- Preserve the exact frozen LensScore identity for every persisted backtest snapshot.
-- This is a new migration because numbered migration checksums are immutable.
ALTER TABLE lens_bucket_stats
  ADD COLUMN IF NOT EXISTS score_config_hash TEXT;

UPDATE lens_bucket_stats
SET score_version = 'legacy-unversioned'
WHERE score_version IS NULL OR btrim(score_version) = '';

UPDATE lens_bucket_stats
SET score_config_hash = 'legacy-unhashed'
WHERE score_config_hash IS NULL OR btrim(score_config_hash) = '';

ALTER TABLE lens_bucket_stats
  ALTER COLUMN score_version SET NOT NULL;

ALTER TABLE lens_bucket_stats
  ALTER COLUMN score_config_hash SET NOT NULL;

ALTER TABLE lens_bucket_stats
  DROP CONSTRAINT IF EXISTS lens_bucket_stats_pkey;

ALTER TABLE lens_bucket_stats
  ADD CONSTRAINT lens_bucket_stats_pkey
  PRIMARY KEY (run_date, bucket, score_version, score_config_hash);

CREATE INDEX IF NOT EXISTS idx_lens_bucket_stats_model_config_run_date
  ON lens_bucket_stats (score_version, score_config_hash, run_date DESC, bucket);

COMMENT ON COLUMN lens_bucket_stats.score_config_hash IS
'Deterministic hash of the frozen LensScore specification used to build this backtest snapshot.';

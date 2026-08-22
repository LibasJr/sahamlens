-- Purge obsolete LensScore v1.3.0 data after the production cutover to v1.5.0.
-- Keep this as a numbered migration so a rebuilt database does not reintroduce
-- the retired version and future agents can see the intentional data cleanup.
DELETE FROM lens_bucket_stats
WHERE score_version = 'lens-score-v1.3.0';

DELETE FROM lens_radar_history
WHERE score_version = 'lens-score-v1.3.0';

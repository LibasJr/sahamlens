-- Watchlist decision journal. Additive, nullable, no data backfill.
ALTER TABLE watchlists
  ADD COLUMN IF NOT EXISTS journal_note TEXT;

ALTER TABLE watchlists
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

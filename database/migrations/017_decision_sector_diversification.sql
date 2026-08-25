-- Exact sector-diversification guard for the internal paper pilot.
ALTER TABLE decision_agent_paper_accounts
  ADD COLUMN IF NOT EXISTS max_positions_per_sector INTEGER;

ALTER TABLE decision_agent_paper_accounts
  DROP CONSTRAINT IF EXISTS decision_agent_paper_accounts_max_positions_sector_check,
  ADD CONSTRAINT decision_agent_paper_accounts_max_positions_sector_check
    CHECK (max_positions_per_sector IS NULL OR (max_positions_per_sector > 0 AND max_positions_per_sector <= 30));

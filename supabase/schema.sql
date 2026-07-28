-- Schema for SahamLens Super App (Supabase)

CREATE TABLE IF NOT EXISTS watchlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    ticker VARCHAR(20) NOT NULL,
    company_name VARCHAR(255),
    sector VARCHAR(100),
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saved_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    module_name VARCHAR(100) NOT NULL,
    ticker VARCHAR(20),
    analysis_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_portfolios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    ticker VARCHAR(20) NOT NULL,
    allocation_pct NUMERIC(5, 2) NOT NULL,
    avg_price NUMERIC(12, 2),
    shares NUMERIC(12, 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

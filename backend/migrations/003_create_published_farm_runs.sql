CREATE TABLE IF NOT EXISTS published_farm_runs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visibility VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted', 'public')),
  poe_version VARCHAR(10) NOT NULL CHECK (poe_version IN ('poe1', 'poe2')),
  league VARCHAR(60) NULL,
  farm_type VARCHAR(80) NULL,
  run_count INTEGER NOT NULL DEFAULT 1 CHECK (run_count >= 1),
  started_at TIMESTAMP NULL,
  ended_at TIMESTAMP NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  setup_description TEXT NULL,
  investment_known BOOLEAN NOT NULL DEFAULT FALSE,
  calculation_status VARCHAR(20) NOT NULL DEFAULT 'notCalculated'
    CHECK (calculation_status IN ('calculated', 'zeroCalculated', 'partial', 'failed', 'notCalculated')),
  profit_chaos NUMERIC(14, 4) NULL,
  price_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  maps JSONB NOT NULL DEFAULT '[]'::jsonb,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  top_loot JSONB NOT NULL DEFAULT '[]'::jsonb,
  character_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  publisher_display_name VARCHAR(80) NULL,
  published_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_published_farm_runs_user_id ON published_farm_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_published_farm_runs_visibility ON published_farm_runs(visibility);
CREATE INDEX IF NOT EXISTS idx_published_farm_runs_context ON published_farm_runs(poe_version, league);
CREATE INDEX IF NOT EXISTS idx_published_farm_runs_farm_type ON published_farm_runs(farm_type);
CREATE INDEX IF NOT EXISTS idx_published_farm_runs_published_at ON published_farm_runs(published_at);
CREATE INDEX IF NOT EXISTS idx_published_farm_runs_profit_chaos ON published_farm_runs(profit_chaos);

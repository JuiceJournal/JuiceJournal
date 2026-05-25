CREATE TABLE IF NOT EXISTS farm_run_reactions (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES published_farm_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction VARCHAR(24) NOT NULL CHECK (reaction IN ('divine', 'holy', 'pog')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, user_id, reaction)
);

CREATE INDEX IF NOT EXISTS idx_farm_run_reactions_run_id ON farm_run_reactions(run_id);
CREATE INDEX IF NOT EXISTS idx_farm_run_reactions_user_id ON farm_run_reactions(user_id);

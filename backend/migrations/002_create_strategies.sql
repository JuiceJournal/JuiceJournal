CREATE TABLE IF NOT EXISTS strategies (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  description TEXT NULL,
  map_name VARCHAR(100) NOT NULL,
  poe_version VARCHAR(10) NOT NULL CHECK (poe_version IN ('poe1', 'poe2')),
  league VARCHAR(50) NOT NULL,
  visibility VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  published_at TIMESTAMP NULL,
  last_calculated_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategies_user_id ON strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_strategies_visibility ON strategies(visibility);
CREATE INDEX IF NOT EXISTS idx_strategies_context ON strategies(poe_version, league);
CREATE INDEX IF NOT EXISTS idx_strategies_published_at ON strategies(published_at);

CREATE TABLE IF NOT EXISTS strategy_sessions (
  id UUID PRIMARY KEY,
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(strategy_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_strategy_sessions_strategy_id ON strategy_sessions(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_sessions_session_id ON strategy_sessions(session_id);

CREATE TABLE IF NOT EXISTS strategy_tags (
  id UUID PRIMARY KEY,
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  tag VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(strategy_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_strategy_tags_strategy_id ON strategy_tags(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_tags_tag ON strategy_tags(tag);

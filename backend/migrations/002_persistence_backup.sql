-- Durable backup tables for user-created sources and learned transaction tags.
ALTER TABLE fin_transactions
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS email_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS excluded_from_cash_flow BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_fin_transactions_user_updated
  ON fin_transactions(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS fin_sources (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES fin_users(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  icon_type TEXT NOT NULL CHECK (icon_type IN ('gpay', 'cash', 'visa', 'mastercard', 'bank', 'other')),
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_sources_user_updated
  ON fin_sources(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS fin_category_mappings (
  user_id UUID NOT NULL REFERENCES fin_users(id) ON DELETE CASCADE,
  merchant_key TEXT NOT NULL,
  category TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, merchant_key)
);

CREATE INDEX IF NOT EXISTS idx_fin_category_mappings_user_updated
  ON fin_category_mappings(user_id, updated_at DESC);

ALTER TABLE fin_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_category_mappings ENABLE ROW LEVEL SECURITY;

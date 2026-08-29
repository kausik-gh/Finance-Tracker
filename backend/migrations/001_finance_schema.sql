-- Personal finance schema. The column names are mirrored by the frontend stores.
CREATE TABLE IF NOT EXISTS fin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  gmail_tokens JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_users_email ON fin_users(email);

CREATE TABLE IF NOT EXISTS fin_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES fin_users(id) ON DELETE CASCADE,
  unique_ref TEXT UNIQUE NOT NULL,
  transaction_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
  merchant TEXT,
  category TEXT,
  description TEXT,
  balance_after NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_transactions_user_date
  ON fin_transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_fin_transactions_user_unique_ref
  ON fin_transactions(user_id, unique_ref);

CREATE TABLE IF NOT EXISTS fin_balance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES fin_users(id) ON DELETE CASCADE,
  snapshot_date TIMESTAMPTZ NOT NULL,
  balance NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_balance_history_user_date
  ON fin_balance_history(user_id, snapshot_date DESC);

-- The API and worker use the service role. RLS prevents accidental public access.
ALTER TABLE fin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_balance_history ENABLE ROW LEVEL SECURITY;

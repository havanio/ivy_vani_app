CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (date DESC);
CREATE INDEX IF NOT EXISTS transactions_payer_idx ON transactions (payer);
CREATE INDEX IF NOT EXISTS transactions_category_idx ON transactions (category);

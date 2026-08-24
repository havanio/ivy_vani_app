CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  source text NOT NULL DEFAULT '' CHECK (source IN ('', 'Cash', 'Card', 'Banking', 'Momo')),
  amount integer NOT NULL CHECK (amount > 0),
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (date DESC);
CREATE INDEX IF NOT EXISTS transactions_payer_idx ON transactions (payer);
CREATE INDEX IF NOT EXISTS transactions_category_idx ON transactions (category);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT '';

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_source_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_source_check
  CHECK (source IN ('', 'Cash', 'Card', 'Banking', 'Momo'));

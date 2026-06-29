-- FinTrack Database Schema
-- Supabase / PostgreSQL / Colombia (COP)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CUENTAS
CREATE TABLE accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('bank','wallet','person','cash','credit')),
  color           TEXT,
  icon            TEXT,
  initial_balance BIGINT NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'COP',
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CATEGORÍAS
CREATE TABLE categories (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT NOT NULL UNIQUE,
  icon           TEXT,
  color          TEXT,
  budget_default BIGINT DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO categories (name, icon, color) VALUES
  ('Mercado',        '🛒', '#4caf50'),
  ('Comida',         '🍕', '#f44336'),
  ('Transporte',     '🚗', '#ff9800'),
  ('Servicios',      '💡', '#2196f3'),
  ('Salud',          '🏥', '#e91e63'),
  ('Viajes',         '✈️', '#009688'),
  ('Entretenimiento','🎬', '#9c27b0'),
  ('Ropa',           '👕', '#673ab7'),
  ('Educación',      '📚', '#3f51b5'),
  ('Gastos apto',    '🏠', '#795548'),
  ('Sueldo',         '💼', '#1d9e75'),
  ('Otros',          '📦', '#607d8b');

-- 3. TRANSACCIONES
CREATE TABLE transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  detail      TEXT,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount      BIGINT NOT NULL CHECK (amount > 0),
  type        TEXT NOT NULL CHECK (type IN ('debit','credit')),
  source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','email','sms')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_date    ON transactions(date DESC);

-- 4. PARTIDA DOBLE (journal_entries)
CREATE TABLE journal_entries (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount         BIGINT NOT NULL CHECK (amount > 0),
  entry_type     TEXT NOT NULL CHECK (entry_type IN ('debit','credit')),
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_journal_transaction ON journal_entries(transaction_id);

-- 5. PRESUPUESTOS
CREATE TABLE budgets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  month       TEXT NOT NULL,
  amount      BIGINT NOT NULL CHECK (amount > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, month)
);

-- 6. CONFIGURACIÓN
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
  ('currency',    'COP'),
  ('theme',       'dark'),
  ('language',    'es'),
  ('date_format', 'DD/MM/YYYY');

-- ============================================================
-- MIGRACIÓN — Supabase Auth (ejecutar en SQL Editor de Supabase)
-- ============================================================

-- 1. Agregar columna user_id a las tablas de datos del usuario
ALTER TABLE accounts        ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE transactions    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE budgets         ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. Actualizar constraint UNIQUE de budgets para incluir user_id
--    (dos usuarios distintos pueden presupuestar la misma categoría en el mismo mes)
ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_category_id_month_key;
ALTER TABLE budgets ADD CONSTRAINT budgets_user_category_month_key
  UNIQUE (user_id, category_id, month);

-- 3. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_accounts_user        ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user    ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user ON journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user         ON budgets(user_id);
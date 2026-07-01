-- FinTrack — Migración: categorías por usuario
-- Ejecutar en Supabase SQL Editor

-- 1. Agregar columna user_id a categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. Eliminar UNIQUE constraint solo sobre 'name'
--    (ahora dos usuarios pueden tener la misma categoría)
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key;

-- 3. Nueva UNIQUE constraint por (user_id, name)
--    Con NULLS DISTINCT (por defecto), múltiples filas con user_id=NULL son
--    tratadas como diferentes, por lo que los seeds globales no se ven afectados.
ALTER TABLE categories ADD CONSTRAINT categories_user_name_key
  UNIQUE (user_id, name);

-- 4. Índice para consultas por usuario
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);

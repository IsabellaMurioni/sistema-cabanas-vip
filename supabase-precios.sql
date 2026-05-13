-- ============================================================
-- Tabla de precios por período
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS precios (
  id           uuid     DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre       text     NOT NULL,
  fecha_inicio date     NOT NULL,
  fecha_fin    date     NOT NULL,
  precio_noche numeric  NOT NULL,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE precios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "precios_select" ON precios;
CREATE POLICY "precios_select" ON precios
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "precios_all" ON precios;
CREATE POLICY "precios_all" ON precios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

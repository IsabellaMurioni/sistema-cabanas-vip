-- =============================================
-- PRECIOS V2 — Ejecutar en Supabase SQL Editor
-- =============================================

-- 1. Eliminar tabla anterior si existe
DROP TABLE IF EXISTS precios CASCADE;

-- 2. Tabla de períodos
CREATE TABLE IF NOT EXISTS periodos_precios (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre        text NOT NULL,
  fecha_inicio  date NOT NULL,
  fecha_fin     date,            -- NULL = "en adelante"
  minimo_noches int  NOT NULL DEFAULT 1,
  activo        boolean NOT NULL DEFAULT true,
  orden         int  NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

-- 3. Tabla de precios por PAX
CREATE TABLE IF NOT EXISTS precios_pax (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  periodo_id     uuid NOT NULL REFERENCES periodos_precios(id) ON DELETE CASCADE,
  pax            int  NOT NULL CHECK (pax BETWEEN 2 AND 7),
  precio_noche   numeric NOT NULL DEFAULT 0,
  precio_semana  numeric NOT NULL DEFAULT 0,
  UNIQUE (periodo_id, pax)
);

-- 4. RLS
ALTER TABLE periodos_precios ENABLE ROW LEVEL SECURITY;
ALTER TABLE precios_pax      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "periodos_select" ON periodos_precios;
DROP POLICY IF EXISTS "periodos_all"    ON periodos_precios;
DROP POLICY IF EXISTS "precios_pax_select" ON precios_pax;
DROP POLICY IF EXISTS "precios_pax_all"    ON precios_pax;

CREATE POLICY "periodos_select" ON periodos_precios FOR SELECT TO authenticated USING (true);
CREATE POLICY "periodos_all"    ON periodos_precios FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "precios_pax_select" ON precios_pax FOR SELECT TO authenticated USING (true);
CREATE POLICY "precios_pax_all"    ON precios_pax FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- 5. Insertar 9 períodos por defecto
INSERT INTO periodos_precios (nombre, fecha_inicio, fecha_fin, minimo_noches, orden) VALUES
  ('01/03/2026 — 01/06/2026', '2026-03-01', '2026-06-01', 2, 1),
  ('01/06/2026 — 01/09/2026', '2026-06-01', '2026-09-01', 1, 2),
  ('01/09/2026 — 01/12/2026', '2026-09-01', '2026-12-01', 1, 3),
  ('01/12/2026 — 20/12/2026', '2026-12-01', '2026-12-20', 2, 4),
  ('20/12/2026 — 27/12/2026', '2026-12-20', '2026-12-27', 3, 5),
  ('27/12/2026 — 21/02/2027 (Temporada Alta)', '2026-12-27', '2027-02-21', 4, 6),
  ('21/02/2027 — 28/02/2027', '2027-02-21', '2027-02-28', 4, 7),
  ('01/03/2027 — 08/03/2027', '2027-03-01', '2027-03-08', 3, 8),
  ('08/03/2027 en adelante',  '2027-03-08', NULL,         2, 9);

-- 6. Insertar filas de precios_pax en $0 para cada período × cada PAX (2–7)
INSERT INTO precios_pax (periodo_id, pax, precio_noche, precio_semana)
SELECT p.id, x.pax, 0, 0
FROM periodos_precios p
CROSS JOIN (VALUES (2),(3),(4),(5),(6),(7)) AS x(pax);

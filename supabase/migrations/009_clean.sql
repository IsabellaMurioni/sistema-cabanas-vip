-- ============================================================
-- LIMPIEZA COMPLETA - Vaciar todos los datos de prueba
-- Ejecutar en Supabase SQL Editor
-- ⚠ ESTO BORRA TODOS LOS DATOS — no se puede deshacer
-- ============================================================

TRUNCATE TABLE caja_banco;
TRUNCATE TABLE caja_mercado_pago;
TRUNCATE TABLE caja_silvia;
TRUNCATE TABLE caja_juli;
TRUNCATE TABLE reservas;

-- Verificación: estas queries deben devolver 0 filas
-- SELECT COUNT(*) FROM reservas;
-- SELECT COUNT(*) FROM caja_silvia;
-- SELECT COUNT(*) FROM caja_juli;
-- SELECT COUNT(*) FROM caja_banco;
-- SELECT COUNT(*) FROM caja_mercado_pago;

-- NOTA: Los archivos en Supabase Storage (bucket "comprobantes")
-- deben eliminarse manualmente desde Storage → comprobantes en el dashboard.

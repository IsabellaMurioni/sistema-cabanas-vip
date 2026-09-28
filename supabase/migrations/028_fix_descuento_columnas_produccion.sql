-- ============================================================
-- 028_fix_descuento_columnas_produccion.sql
-- Corrige una divergencia real descubierta hoy: 006_descuento.sql
-- (que agrega descuento_porcentaje y descuento_motivo a `reservas`)
-- nunca se había aplicado en PRODUCCIÓN, a pesar de estar en el repo
-- desde antes de este proyecto. Nadie lo había notado porque la app
-- nunca había escrito en esas columnas hasta el cambio de hoy
-- (migración 027 + el nuevo código de descuento como monto fijo).
--
-- Confirmado por consulta directa contra producción: únicamente
-- `descuento_monto` (de la migración 027, aplicada hoy) existía ahí.
-- `descuento_motivo` y `descuento_porcentaje` faltaban por completo,
-- causando el error "Could not find the 'descuento_motivo' column"
-- al intentar guardar una reserva con descuento.
--
-- Staging SÍ tenía ambas columnas (006 se había aplicado ahí
-- correctamente en su momento) — la divergencia era exclusiva de
-- producción.
--
-- Aditiva únicamente, con IF NOT EXISTS en ambas columnas para que
-- sea segura de correr sin importar el estado real de cada una.
-- Ya aplicada y verificada en producción (2026-09-28) antes de crear
-- este archivo — este commit es retroactivo, para que el historial
-- de migrations del repo finalmente refleje la realidad.
-- ============================================================

alter table reservas
  add column if not exists descuento_porcentaje numeric default null,
  add column if not exists descuento_motivo     text    default null;

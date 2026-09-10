-- ============================================================
-- 019_movimientos_caja_monto_otros.sql
-- Migración correctiva: `movimientos_caja.monto_otros` ya existe en
-- staging (se usa en el código desde hace varias fases — ReservaForm,
-- ReservaPago, CajaTemporada — junto a monto_depositos/monto_efectivo)
-- pero ninguna migración de este repo la creaba, así que el historial
-- de migraciones no reflejaba el esquema real. Esta migración es
-- puramente correctiva/idempotente para que el historial coincida con
-- la realidad — no toca ninguna otra columna ni tabla.
--
-- Forma verificada contra staging (no asumida): insertar
-- monto_otros: null viola una constraint not-null (código 23502);
-- omitir la columna la deja en 0 por default — mismo tipo/forma que
-- monto_depositos/monto_efectivo (numeric not null default 0).
-- ============================================================

alter table movimientos_caja
  add column if not exists monto_otros numeric not null default 0;

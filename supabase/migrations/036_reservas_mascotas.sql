-- ============================================================
-- 036_reservas_mascotas.sql
-- Fase 3 de la integración del bot de WhatsApp: agrega `mascotas` a
-- `reservas` — cantidad de mascotas de la reserva, pedido por el
-- desarrollador del bot (Nacho) para el set de campos que devuelve
-- "consultar reserva". Mismo patrón que la columna `pax` ya existente
-- (cantidad de personas): integer, not null, default 0.
--
-- Límite real, documentado a propósito y no silenciado: NO hay
-- backfill posible. Esta información nunca se trackeó antes de este
-- archivo — no hay ningún dato histórico de dónde sacarla. Toda
-- reserva existente va a quedar en 0 por el DEFAULT que aplica
-- Postgres automáticamente al agregar la columna, pero ese 0 es
-- AMBIGUO: no hay manera de distinguir "esta reserva genuinamente no
-- tenía mascotas" de "nunca se le preguntó al huésped, el dato
-- simplemente no existe". Cualquier reporte o respuesta de API que
-- use este campo sobre una reserva vieja (anterior a este archivo)
-- tiene que tratar ese 0 con esa ambigüedad en mente, no asumirlo
-- como un hecho confirmado.
--
-- Idempotente: `add column if not exists` — correr este archivo una
-- segunda vez no rompe nada ni duplica nada.
-- ============================================================

begin;

alter table reservas
  add column if not exists mascotas integer not null default 0;

-- Verificación de solo lectura (SELECT, no RAISE NOTICE, para que se
-- vea directo en el panel de resultados del SQL Editor): la columna
-- existe, y ninguna fila (ni las ya existentes ni las nuevas) quedó
-- en NULL — el NOT NULL de la columna ya lo garantiza, pero se deja
-- explícito y visible acá.
select
  exists (
    select 1 from information_schema.columns
    where table_name = 'reservas' and column_name = 'mascotas'
  )
    as columna_mascotas_existe,
  (select count(*) from reservas where mascotas is null) = 0
    as ninguna_fila_en_null;

commit;

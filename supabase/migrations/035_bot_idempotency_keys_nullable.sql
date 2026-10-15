-- ============================================================
-- 035_bot_idempotency_keys_nullable.sql
-- Fase 2 de la integración del bot de WhatsApp — corrige un gap de
-- concurrencia real detectado al revisar el diseño original de
-- idempotencia (034_bot_idempotencia_version.sql), antes de que
-- cualquier código lo llame y antes de correr 034 en producción
-- (034 sólo corrió en staging hasta ahora).
--
-- El problema: el diseño original era "check, then act, then store"
-- — primero consultar si la Idempotency-Key ya existe, recién
-- DESPUÉS ejecutar la operación real, y recién AL FINAL guardar el
-- resultado. Dos reintentos casi simultáneos de la MISMA key nueva
-- pueden los dos ver "no existe todavía" (ninguno de los dos terminó
-- de guardar nada aún), los dos ejecutar la operación real, y recién
-- chocar más tarde al intentar guardar — para entonces el efecto real
-- (p.ej. crear la reserva) ya pasó dos veces. Exactamente el
-- problema que la idempotencia existe para evitar.
--
-- La solución es el patrón estándar "claim-first": el INSERT que
-- reclama la key pasa a ser el PRIMER paso, antes de ejecutar nada —
-- se inserta una fila placeholder (`response_status`/`response_body`
-- en NULL, significando "reclamada, todavía procesándose") ANTES de
-- tocar la operación real. El `primary key` de `idempotency_key` ya
-- hace que ese INSERT sea atómico: si dos requests concurrentes
-- intentan reclamar la misma key nueva, Postgres garantiza que sólo
-- uno de los dos INSERTs gana — el otro falla ahí mismo, y puede
-- fijarse qué pasó (hash distinto → conflicto; mismo hash, todavía
-- NULL → alguien más lo está procesando AHORA, pedirle al bot que
-- reintente en un rato, no re-ejecutar nada) en vez de correr la
-- operación real una segunda vez. Recién cuando la operación real
-- termina se hace un UPDATE (no un segundo INSERT) sobre esa misma
-- fila, completando el resultado.
--
-- Este archivo SÓLO afloja el NOT NULL de las dos columnas que ahora
-- pueden quedar en NULL mientras se procesa — no toca ninguna otra
-- columna, constraint, ni la RLS/cero-policies ya seteada en 034. No
-- se edita 034 en el lugar: ya corrió en staging, así que el cambio
-- va en un archivo nuevo, como corresponde.
--
-- Idempotente: `alter column ... drop not null` no falla si ya
-- estaba nullable (ni siquiera hace falta un IF EXISTS — Postgres no
-- tira error si la columna ya admite NULL y se vuelve a pedir lo
-- mismo).
-- ============================================================

begin;

alter table bot_idempotency_keys
  alter column response_status drop not null;
alter table bot_idempotency_keys
  alter column response_body drop not null;

-- Verificación de solo lectura: las dos columnas tienen que admitir
-- NULL ahora (is_nullable = 'YES'), y ninguna fila YA guardada (de
-- staging, bajo el diseño viejo) tiene que haber quedado con NULL —
-- este archivo sólo relaja el esquema, no toca filas existentes.
select
  (
    select is_nullable from information_schema.columns
    where table_name = 'bot_idempotency_keys' and column_name = 'response_status'
  ) = 'YES'
  and
  (
    select is_nullable from information_schema.columns
    where table_name = 'bot_idempotency_keys' and column_name = 'response_body'
  ) = 'YES'
    as columnas_ahora_nullable,
  (
    select count(*) from bot_idempotency_keys
    where response_status is null or response_body is null
  ) = 0
    as filas_existentes_sin_nulls_inesperados;

commit;

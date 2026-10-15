-- ============================================================
-- 034_bot_idempotencia_version.sql
-- Fase 2 de la integración del bot de WhatsApp: primera pieza de la
-- infraestructura común de API — esquema de base de datos para
-- idempotencia y concurrencia optimista. El resto (middleware de
-- auth, taxonomía de errores) es una pieza aparte, pendiente de
-- review de ésta primero.
--
-- (1) `bot_idempotency_keys` — soporta el header `Idempotency-Key`
-- que exige la spec de Nacho para los endpoints de escritura. Un
-- cliente (el bot) que reintenta la misma request (por timeout, red
-- caída, etc.) manda la MISMA idempotency_key — el endpoint debe
-- devolver la respuesta YA guardada de la primera vez, en vez de
-- ejecutar la operación de nuevo (evita, por ejemplo, crear la misma
-- reserva dos veces). `request_hash` es la pieza que distingue "este
-- es un reintento legítimo" de "alguien está reusando esta key con un
-- payload DISTINTO" — sin esto, una key reusada por error (o a
-- propósito, por un bug del lado del bot) devolvería silenciosamente
-- la respuesta cacheada de una request totalmente distinta, lo cual
-- es peor que no tener idempotencia: el endpoint tiene que comparar
-- el hash entrante contra el guardado y devolver 409 Conflict si no
-- coinciden, no 200 con la respuesta vieja.
--
-- RLS + cero policies, mismo razonamiento que `reserva_cabanas`
-- (Fase 1, ver 033): nada tiene que tocar esta tabla salvo las Edge
-- Functions del bot — pero la vía por la que la sortean es DISTINTA
-- a la de reserva_cabanas. `reserva_cabanas` dependía de una función
-- `SECURITY DEFINER` porque la escribía un trigger corriendo con los
-- privilegios de `authenticated` (quien hizo el write real a
-- `reservas`). Acá no hay trigger: las Edge Functions del bot escriben
-- directo a `bot_idempotency_keys` usando la service role key, que en
-- Supabase bypassea RLS por convención propia de la plataforma (no
-- por ser owner ni por SECURITY DEFINER) — alcanza con RLS habilitado
-- y cero policies para que `anon`/`authenticated` (la app web) no
-- puedan tocarla, sin necesitar ningún mecanismo adicional.
--
-- (2)+(3) `reservas.version` + trigger — concurrencia optimista para
-- el requisito `version`/`ETag`/`If-Match` de la spec de Nacho: el
-- bot lee una reserva, recibe su `version` actual; si más tarde
-- intenta escribirla, manda esa misma `version` de vuelta, y el write
-- se rechaza si ya no coincide (alguien —la app web, otro request del
-- bot— escribió esa fila en el medio). El trigger incrementa
-- `version` en CADA UPDATE ejecutado, sin mirar qué columnas
-- cambiaron — es la semántica estándar de optimistic locking: la
-- pregunta que contesta `version` es "¿alguien escribió esta fila
-- desde que la leí?", no "¿cambió algo visible?" — un UPDATE que
-- vuelve a guardar los mismos valores (p.ej. re-guardar sin tocar
-- nada) de todas formas cuenta como una escritura real a la fila, y
-- tiene que invalidar cualquier `version` vieja que alguien más
-- tuviera en mano.
--
-- Confirmado al revisar esto: el trigger de Fase 1
-- (`trg_sync_reserva_cabanas`, 033) es AFTER y escribe en una tabla
-- DISTINTA (`reserva_cabanas`) — no lee ni escribe `reservas.version`
-- en ningún punto. El nuevo trigger de este archivo
-- (`trg_bump_reserva_version`) es BEFORE UPDATE y sólo modifica
-- `NEW` en memoria antes de que la fila se escriba — no toca
-- `reserva_cabanas` ni ninguna otra tabla. Orden de ejecución en un
-- UPDATE: primero corre `trg_bump_reserva_version` (BEFORE, bumpea
-- NEW.version), la fila se escribe YA con el version incrementado,
-- y recién ahí corre `trg_sync_reserva_cabanas` (AFTER), que ve ese
-- mismo NEW pero nunca mira `version`. Dos triggers independientes,
-- sin ningún punto de contacto real.
--
-- Por qué `trg_bump_reserva_version` NO necesita `SECURITY DEFINER`
-- (a diferencia de `sync_reserva_cabanas` en Fase 1): no escribe en
-- ninguna otra tabla, sólo reasigna un campo de la misma fila que ya
-- se está actualizando — cualquier rol que ya tenga permiso de
-- UPDATE sobre `reservas` (la app web, o el futuro service role del
-- bot) puede disparar este trigger sin necesitar privilegios
-- adicionales a los que ya tiene.
--
-- Fuera de alcance a propósito: NO se toca `reserva_cabanas`, su
-- trigger, ni el exclusion constraint de Fase 1 (033) — este archivo
-- es aditivo puro sobre piezas nuevas.
--
-- Idempotente: create table usa IF NOT EXISTS, la función usa CREATE
-- OR REPLACE, el trigger se dropea/crea de nuevo, y `add column`
-- sobre `reservas` usa IF NOT EXISTS — correr este archivo una
-- segunda vez no rompe nada ni duplica nada.
-- ============================================================

begin;

-- (1) Idempotencia ------------------------------------------------

create table if not exists bot_idempotency_keys (
  idempotency_key  text primary key,
  request_hash     text not null,
  response_status  integer not null,
  response_body    jsonb not null,
  created_at       timestamptz not null default now()
);

alter table bot_idempotency_keys enable row level security;
-- A propósito, CERO policies — ver header: sólo las Edge Functions
-- del bot (service role, bypassea RLS por convención de Supabase)
-- tienen que tocar esta tabla. Ni la app web ni ningún rol cliente
-- tienen ninguna razón para leerla o escribirla directo.

-- (2) Concurrencia optimista ---------------------------------------

alter table reservas
  add column if not exists version integer not null default 1;

-- (3) Trigger que bumpea version en cada UPDATE -------------------

create or replace function bump_reserva_version() returns trigger as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_bump_reserva_version on reservas;
create trigger trg_bump_reserva_version
  before update on reservas
  for each row execute function bump_reserva_version();

-- (4) Verificación de solo lectura ----------------------------------
-- Visible directo en el panel de resultados del SQL Editor (SELECT,
-- no RAISE NOTICE). `bot_idempotency_keys_ok` y `version_ok` tienen
-- que dar `true` las dos.
select
  exists (
    select 1 from information_schema.columns
    where table_name = 'bot_idempotency_keys' and column_name = 'idempotency_key'
  )
  and exists (
    select 1 from information_schema.columns
    where table_name = 'bot_idempotency_keys' and column_name = 'request_hash'
  )
  and exists (
    select 1 from information_schema.columns
    where table_name = 'bot_idempotency_keys' and column_name = 'response_status'
  )
  and exists (
    select 1 from information_schema.columns
    where table_name = 'bot_idempotency_keys' and column_name = 'response_body'
  )
  and exists (
    select 1 from information_schema.columns
    where table_name = 'bot_idempotency_keys' and column_name = 'created_at'
  )
    as bot_idempotency_keys_ok,
  (
    exists (
      select 1 from information_schema.columns
      where table_name = 'reservas' and column_name = 'version'
    )
    -- "defaults to 1" se chequea contra el metadata de la columna
    -- (column_default), no contra el valor actual de cada fila —
    -- eso es lo que hace a este check seguro de re-correr: si el
    -- trigger ya bumpeó alguna fila a version 2+ después de la
    -- primera corrida de esta migración, ESO es el comportamiento
    -- esperado, no una regresión. "No nula en toda fila existente" sí
    -- se chequea contra los datos reales, porque ESO tiene que ser
    -- cierto siempre (ya lo garantiza el NOT NULL de la columna, pero
    -- se deja explícito y visible acá).
    and exists (
      select 1 from information_schema.columns
      where table_name = 'reservas' and column_name = 'version' and column_default = '1'
    )
    and (select count(*) from reservas where version is null) = 0
  )
    as version_ok;

commit;

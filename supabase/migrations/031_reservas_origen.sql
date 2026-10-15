-- ============================================================
-- 031_reservas_origen.sql
-- Fase 0 de la integración del bot de WhatsApp: agrega una columna
-- `origen` a `reservas` para poder distinguir, a futuro, reservas
-- creadas desde la web (flujo actual) de las que cree el bot o un
-- operador manual. Puramente aditiva y de preparación — ninguna
-- fila existente cambia de significado: todas las reservas actuales
-- quedan marcadas 'web' (su origen real), vía el DEFAULT aplicado
-- automáticamente por Postgres al agregar la columna.
--
-- No hay escritura de datos manual ni UPDATE en este archivo: el
-- único cambio a filas existentes es el que Postgres aplica solo,
-- de forma atómica, al agregar una columna NOT NULL... DEFAULT (acá
-- es nullable con default, así que ni siquiera hace falta ese caso).
--
-- `if not exists` en la columna y `if not exists` en el constraint
-- (vía drop/add, mismo patrón que 005_estado.sql) para que correr
-- este archivo dos veces sea seguro.
-- ============================================================

alter table reservas
  add column if not exists origen text default 'web';

alter table reservas
  drop constraint if exists reservas_origen_check;
alter table reservas
  add constraint reservas_origen_check
  check (origen in ('web', 'bot', 'manual'));

-- Verificación de solo lectura: confirma que la columna existe, que
-- el constraint quedó bien definido, y que todas las filas
-- preexistentes cayeron en 'web' por el default (no se escribe nada
-- acá, solo se reporta).
do $$
declare
  total_filas integer;
  filas_no_web integer;
begin
  select count(*) into total_filas from reservas;
  select count(*) into filas_no_web from reservas where origen <> 'web';
  raise notice 'reservas.origen agregada. Total filas: %, filas con origen distinto de ''web'': % (esperado: 0, ya que recién se agrega la columna)', total_filas, filas_no_web;
end $$;

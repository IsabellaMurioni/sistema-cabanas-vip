-- ============================================================
-- 038_cabanas_categoria_planta.sql
-- Fase 3 de la integración del bot de WhatsApp: agrega `categoria`
-- (categoría comercial) y `planta` (planta baja/alta/desconocida) a
-- `cabanas` como campos estructurados propios, pedido por el
-- desarrollador del bot (Nacho) — hoy esa información sólo existe
-- embebida como texto libre dentro de `nombre` (ej. "2 Ambientes
-- Planta Baja 4", "Clásica 8"), que no sirve para filtrar/responder
-- programáticamente.
--
-- `categoria text`, nullable, SIN restricción de valores — a
-- diferencia de `planta`, que SÍ se restringe a un conjunto fijo (ver
-- más abajo): "categoría comercial" es un concepto más abierto, cuyo
-- vocabulario real todavía no está confirmado por el negocio, así que
-- no tiene sentido inventarle un CHECK con valores adivinados hoy.
--
-- `planta text`, nullable, con CHECK a un conjunto chico y fijo
-- ('planta_baja', 'planta_alta') o NULL ("desconocida" = NULL, no un
-- tercer valor string tipo 'desconocida' — NULL ya significa eso sin
-- necesidad de otro caso especial). A propósito NO se permite texto
-- libre acá: el objetivo explícito de este campo es dejar de depender
-- de parsear "Planta Baja"/"Planta Alta" del string de `nombre`, así
-- que dejarlo como texto libre recrearía exactamente la misma
-- ambigüedad que se está tratando de evitar.
--
-- SIN BACKFILL, a propósito, para las DOS columnas — ninguna fila
-- queda con un valor deducido de `nombre` ni de ningún otro criterio
-- automático. Mismo criterio ya aplicado a `pax_min`/`pax_max`
-- (037_cabanas_vip_pax_backfill.sql): nunca inferir de un string de
-- texto libre pensado para humanos, siempre confirmar con una persona
-- del negocio antes de cargar el valor real. "2 Ambientes Planta Baja
-- 4" sugiere planta_baja a simple vista, pero un parser automático no
-- tiene manera de distinguir con certeza casos ambiguos o mal
-- tipeados — la carga real, cabaña por cabaña, queda para una
-- migración de datos separada y posterior, igual que pasó con
-- pax_min/pax_max.
--
-- Idempotente: `add column if not exists` + `drop constraint if
-- exists` antes de recrearlo — correr este archivo una segunda vez no
-- rompe nada ni duplica nada.
-- ============================================================

begin;

alter table cabanas
  add column if not exists categoria text;

alter table cabanas
  add column if not exists planta text;

alter table cabanas
  drop constraint if exists cabanas_planta_check;

alter table cabanas
  add constraint cabanas_planta_check
  check (planta is null or planta in ('planta_baja', 'planta_alta'));

-- Verificación de solo lectura (SELECT, no RAISE NOTICE, para que se
-- vea directo en el panel de resultados del SQL Editor): las dos
-- columnas existen, el CHECK quedó aplicado, y CERO filas tienen un
-- valor no-NULL todavía (confirma que esta migración no backfillea
-- nada, como dice el comentario de arriba).
select
  exists (
    select 1 from information_schema.columns
    where table_name = 'cabanas' and column_name = 'categoria'
  ) as columna_categoria_existe,
  exists (
    select 1 from information_schema.columns
    where table_name = 'cabanas' and column_name = 'planta'
  ) as columna_planta_existe,
  exists (
    select 1 from pg_constraint where conname = 'cabanas_planta_check'
  ) as constraint_planta_existe,
  (select count(*) from cabanas where categoria is not null) as filas_con_categoria,
  (select count(*) from cabanas where planta is not null) as filas_con_planta;

commit;

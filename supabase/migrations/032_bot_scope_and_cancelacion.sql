-- ============================================================
-- 032_bot_scope_and_cancelacion.sql
-- Fase 0 de la integración del bot de WhatsApp — dos cambios
-- independientes, aditivos, decididos en la misma ronda de review.
--
-- (a) `cabanas.habilitado_bot`: marca, a nivel de base de datos,
-- exactamente qué cabañas puede tocar el bot. Se usa una lista
-- explícita de 9 IDs (el grupo "MIMMO I" confirmado en la auditoría
-- de Fase 0) en lugar de derivarlo de `grupo`/`zona`, para que el
-- resultado no dependa de supuestos sobre esas columnas ni cambie
-- solo si alguien edita `grupo` más adelante. Este flag es lo que
-- va a dejar que los futuros endpoints de API restrinjan el bot
-- server-side — no confiando en que el bot se porte bien.
--
-- (b) `reservas.motivo_cancelacion`: por qué se canceló una reserva
-- (vencimiento automático del cron vs. cancelación manual). NO hay
-- backfill: toda fila existente (incluidas las ya Canceladas) queda
-- en NULL, porque no podemos saber retroactivamente por qué se
-- canceló una reserva vieja y no vamos a adivinar. `reservas.estado`
-- y su constraint existente NO se tocan acá.
--
-- Mismo patrón idempotente que 031/005: `add column if not exists`
-- y `drop constraint if exists` + `add constraint`, seguro de correr
-- más de una vez.
-- ============================================================

-- (a) Alcance del bot sobre cabañas ------------------------------

alter table cabanas
  add column if not exists habilitado_bot boolean not null default false;

update cabanas
set habilitado_bot = true
where id in (
  '4f5c64d5-2eec-4cea-ac6b-4f7681ff7d1b',
  'd38eb4ce-4991-41f2-afdf-069e6320823e',
  'edcfded9-b2d8-42e3-8b0f-e4942c7d3c3d',
  '822f0044-2f08-4d55-9389-cfc9c342a269',
  'f81634f6-0c40-4ace-955f-c5579f41a6eb',
  'a8ea69b4-fedf-4a74-9d65-523216336571',
  '157ce2d6-f587-4ca8-a47e-8dcbf1d00293',
  '57efa2e0-fe66-496d-a2d7-745124c32839',
  '09ec8f65-3288-46b4-b39a-01e5ca25b9de'
);

-- Verificación de solo lectura: confirma que son exactamente 9 filas
-- con habilitado_bot = true, y que son EXACTAMENTE las 9 de la lista
-- de arriba (no solo el conteo — también que no haya ninguna cabaña
-- extra marcada ni ninguna de la lista sin marcar).
do $$
declare
  total_habilitadas integer;
  ids_esperados uuid[] := array[
    '4f5c64d5-2eec-4cea-ac6b-4f7681ff7d1b',
    'd38eb4ce-4991-41f2-afdf-069e6320823e',
    'edcfded9-b2d8-42e3-8b0f-e4942c7d3c3d',
    '822f0044-2f08-4d55-9389-cfc9c342a269',
    'f81634f6-0c40-4ace-955f-c5579f41a6eb',
    'a8ea69b4-fedf-4a74-9d65-523216336571',
    '157ce2d6-f587-4ca8-a47e-8dcbf1d00293',
    '57efa2e0-fe66-496d-a2d7-745124c32839',
    '09ec8f65-3288-46b4-b39a-01e5ca25b9de'
  ]::uuid[];
  ids_inesperados integer;
  ids_faltantes integer;
begin
  select count(*) into total_habilitadas from cabanas where habilitado_bot = true;

  select count(*) into ids_inesperados
  from cabanas
  where habilitado_bot = true and id <> all (ids_esperados);

  select count(*) into ids_faltantes
  from unnest(ids_esperados) as esperado(id)
  where not exists (
    select 1 from cabanas c where c.id = esperado.id and c.habilitado_bot = true
  );

  raise notice 'cabanas.habilitado_bot: % filas en true (esperado: 9). Cabañas marcadas que NO están en la lista esperada: % (esperado: 0). Cabañas de la lista esperada que NO quedaron marcadas: % (esperado: 0)', total_habilitadas, ids_inesperados, ids_faltantes;
end $$;

-- (b) Motivo de cancelación ---------------------------------------

alter table reservas
  add column if not exists motivo_cancelacion text;

alter table reservas
  drop constraint if exists reservas_motivo_cancelacion_check;
alter table reservas
  add constraint reservas_motivo_cancelacion_check
  check (motivo_cancelacion in ('vencimiento_automatico', 'manual'));

-- Verificación de solo lectura: todas las filas existentes (incluidas
-- las ya Canceladas) deben seguir en NULL — no hay backfill acá.
do $$
declare
  total_filas integer;
  filas_no_null integer;
begin
  select count(*) into total_filas from reservas;
  select count(*) into filas_no_null from reservas where motivo_cancelacion is not null;
  raise notice 'reservas.motivo_cancelacion agregada. Total filas: %, filas con motivo_cancelacion NO nulo: % (esperado: 0, sin backfill)', total_filas, filas_no_null;
end $$;

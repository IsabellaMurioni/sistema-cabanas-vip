-- ============================================================
-- 039_cabanas_activa.sql
-- Fase 3 de la integración del bot de WhatsApp: agrega `activa` a
-- `cabanas` — estado OPERATIVO de la unidad (puede funcionar hoy o
-- está fuera de servicio), pedido por Nacho (desarrollador del bot)
-- para separarlo de un concepto distinto que ya existe en esta misma
-- tabla desde 032_bot_scope_and_cancelacion.sql.
--
-- (a) Distinción con `habilitado_bot` — NO son lo mismo:
--     `habilitado_bot` es un permiso: "¿el bot puede ofrecer esta
--     unidad?" — hoy sólo true para las 9 de MIMMO I, por alcance de
--     producto, no por estado real de la cabaña.
--     `activa` es un hecho operativo: "¿esta unidad puede funcionar
--     en absoluto hoy?" — independiente de si el bot (o cualquier
--     canal) tiene permiso para ofrecerla. Una cabaña puede estar
--     habilitada para el bot Y fuera de servicio a la vez (ej. una
--     de MIMMO I con una cañería rota), o inhabilitada para el bot Y
--     perfectamente operativa (las otras 26, hoy). Son dos ejes
--     independientes — cualquier endpoint de disponibilidad que mire
--     sólo uno de los dos está incompleto.
--
-- (b) Simplificación conservadora, documentada como tal — NO es un
--     sistema de bloqueos por rango de fechas. Auditoría previa (esta
--     misma fase) confirmó que ESE mecanismo no existe hoy en el
--     proyecto: ninguna tabla, UI ni lógica de Edge Function permite
--     marcar una cabaña fuera de servicio por un rango de fechas
--     puntual, fuera de crear una fila de `reservas`. Un solo boolean
--     ("activa ahora, sí o no") es lo que Nacho aprobó explícitamente
--     como aceptable para el lanzamiento de sólo-lectura — no
--     resuelve mantenimiento programado ni temporal, sólo "esta
--     unidad está operativa en este momento o no".
--
-- (c) Qué pasa cuando exista un sistema real de bloqueos por fecha:
--     revisar el rol de esta columna en ese momento, no asumir que
--     sigue significando lo mismo. Dos caminos posibles, a decidir
--     cuando corresponda: (1) `activa` queda redundante y se
--     deprecia en favor del sistema de bloqueos nuevo, o (2) `activa`
--     se mantiene como un interruptor de emergencia por ENCIMA de los
--     bloqueos por fecha (ej. una unidad demolida/vendida, sin fecha
--     de reapertura) — ninguna de las dos decisiones está tomada
--     todavía, este archivo sólo deja el campo disponible para la
--     necesidad inmediata de Nacho.
--
-- Backfill a `true` para las 35 filas existentes: a diferencia de
-- `pax_min`/`pax_max` (037) y `categoria`/`planta` (038), donde se
-- evitó explícitamente inferir cualquier valor de un string de texto
-- libre, acá el valor para cada fila existente es un HECHO YA
-- CONFIRMADO por el negocio (ninguna de las 35 cabañas, en ninguno de
-- los 5 complejos, está hoy fuera de servicio) — no una suposición ni
-- una deducción. El propio DEFAULT true de la columna aplica
-- correctamente a las filas existentes sin necesidad de un UPDATE
-- aparte.
--
-- Idempotente: `add column if not exists` — correr este archivo una
-- segunda vez no rompe nada ni duplica nada.
-- ============================================================

begin;

alter table cabanas
  add column if not exists activa boolean not null default true;

-- Verificación de solo lectura (SELECT, no RAISE NOTICE, para que se
-- vea directo en el panel de resultados del SQL Editor): la columna
-- existe, y la cantidad de filas con activa = true coincide EXACTO
-- con el total de filas de `cabanas` (las 35 confirmadas por el
-- negocio, ninguna quedó afuera).
select
  exists (
    select 1 from information_schema.columns
    where table_name = 'cabanas' and column_name = 'activa'
  ) as columna_activa_existe,
  (select count(*) from cabanas) as total_cabanas,
  (select count(*) from cabanas where activa = true) as cabanas_activas,
  (select count(*) from cabanas) = (select count(*) from cabanas where activa = true)
    as todas_las_filas_quedaron_en_true;

commit;

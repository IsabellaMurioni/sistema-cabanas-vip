-- ============================================================
-- 033_reserva_cabanas_exclusion.sql
-- Fase 1 de la integración del bot de WhatsApp: garantía atómica
-- a nivel de base de datos contra el doble-booking, vía un EXCLUDE
-- constraint de Postgres (GiST) sobre cabaña + rango de fechas.
--
-- Por qué una tabla normalizada y no un EXCLUDE directo sobre
-- `reservas`: una sola fila de `reservas` puede representar VARIAS
-- cabañas a la vez (columna `cabana`, texto con nombres separados
-- por "\n" — ver ReservaForm.jsx/CabinMultiPicker). Un EXCLUDE
-- constraint compara VALORES DE COLUMNA entre filas — no puede
-- parsear múltiples nombres de un solo campo de texto para detectar
-- que dos reservas distintas comparten una cabaña. `reserva_cabanas`
-- es una fila por cada par (reserva, cabaña), con su propio rango de
-- fechas, que es donde el EXCLUDE SÍ puede aplicar.
--
-- Semántica de noches: daterange(fecha_entrada, fecha_salida, '[)')
-- — checkin inclusive, checkout exclusivo. Misma semántica que ya usa
-- getConflicto/el re-chequeo de ReservaForm.jsx (ver auditoría de
-- Fase 0): un checkout día N y un checkin día N en la misma cabaña
-- NO se marcan como overlap, se permite el recambio el mismo día.
--
-- Por qué el EXCLUDE es parcial (WHERE estado <> 'Cancelada'): una
-- reserva cancelada no debe seguir bloqueando esas fechas — mismo
-- criterio que `.neq('estado', 'Cancelada')`, usado como el filtro
-- universal de "esto ocupa fechas" en Caja/CajaTemporada/
-- Disponibilidad/Ganancias/ReservaForm.
--
-- Alcance: `reserva_cabanas` NO guarda nada de reservas Canceladas.
-- Nada lee esta tabla salvo el EXCLUDE constraint, y el constraint ya
-- ignora Cancelada por su propio WHERE — no hay ninguna razón para
-- resolver/insertar esas filas. Por eso tanto el trigger como el
-- backfill excluyen Cancelada de entrada, en vez de insertarlas y
-- confiar en que el WHERE las neutralice: así el alcance real de esta
-- migración coincide EXACTO con lo que la auditoría de Fase 0+ ya
-- confirmó limpio (cero overlaps, cero nombres sin resolver) — esa
-- auditoría se corrió sólo sobre no-Canceladas, nunca se revisaron
-- las Canceladas (suelen ser datos de prueba más viejos/sucios), así
-- que intentar resolverlas acá sería arriesgar un abort de migración
-- sobre datos que nunca se verificaron y que de todas formas no hacen
-- falta. (Si en el futuro se necesita el historial de qué cabañas
-- tocó una reserva cancelada, es una ampliación separada, no urgente
-- para el objetivo de Fase 1.)
--
-- Red de seguridad adicional: si una reserva no-Cancelada resuelve
-- CERO cabañas (p.ej. `cabana` null/vacío — no debería pasar hoy por
-- la validación del form, pero el schema no lo impide), el trigger Y
-- el backfill hacen RAISE EXCEPTION en vez de dejarla silenciosamente
-- con cero filas en reserva_cabanas — eso sería exactamente el hueco
-- de protección silencioso que Fase 1 existe para cerrar.
--
-- Idempotente: create extension/table usan IF NOT EXISTS (no tocan
-- nada si ya corrieron antes), la función usa CREATE OR REPLACE, el
-- trigger se dropea/crea de nuevo, y el backfill borra-y-reinserta
-- por reserva (no un INSERT ciego) — correr este archivo una segunda
-- vez no duplica filas ni choca contra el EXCLUDE constraint consigo
-- mismo.
--
-- Transacción única: todo el archivo corre dentro de un solo
-- BEGIN/COMMIT. Si el backfill (al final) encuentra una cabaña que
-- no resuelve, o cero cabañas resueltas, y hace RAISE EXCEPTION, se
-- deshace TODO — la extensión, la tabla, la función y el trigger
-- quedan sin crear, no a medio aplicar.
--
-- RLS + SECURITY DEFINER, las dos a la vez (una sin la otra rompe
-- algo): `reserva_cabanas` queda con `enable row level security` y
-- CERO policies — nadie, ni la app web, ni la futura API del bot, ni
-- ningún rol cliente, tiene ninguna razón para leer o escribir esta
-- tabla directa; sólo existe para que el EXCLUDE constraint tenga
-- algo contra qué chequear. Sin ninguna policy, CUALQUIER acceso
-- directo (select/insert/update/delete) queda bloqueado para
-- cualquier rol que no sea el owner de la tabla — lo cual incluye,
-- por default, al trigger: un trigger corre con los privilegios de
-- quien hizo el write original a `reservas` (típicamente `authenticated`,
-- el rol de la app), así que sin más, el INSERT del trigger a
-- reserva_cabanas también quedaría bloqueado por el RLS que acabamos
-- de prender — y CUALQUIER reserva nueva creada desde la app
-- empezaría a fallar en el paso del trigger, apenas corra esta
-- migración. Por eso `sync_reserva_cabanas()` se define `SECURITY
-- DEFINER`: así corre con los privilegios de quien DEFINIÓ la
-- función (el owner/admin que corre esta migración), no de quien
-- disparó el trigger, y puede escribir en `reserva_cabanas` sin
-- depender de ninguna policy. `SET search_path = public, pg_temp` es
-- el hardening estándar para toda función SECURITY DEFINER — fija el
-- search_path explícito para que no pueda ser secuestrado por un rol
-- malicioso con permisos para crear objetos (tablas/funciones) en un
-- schema que aparezca antes en un search_path mutable.
-- ============================================================

begin;

create extension if not exists btree_gist;

create table if not exists reserva_cabanas (
  id            uuid primary key default gen_random_uuid(),
  reserva_id    uuid not null references reservas(id) on delete cascade,
  cabana_id     uuid not null references cabanas(id),
  fecha_entrada date not null,
  fecha_salida  date not null,
  estado        text not null,
  exclude using gist (
    cabana_id with =,
    daterange(fecha_entrada, fecha_salida, '[)') with &&
  ) where (estado <> 'Cancelada')
);

alter table reserva_cabanas enable row level security;
-- A propósito, CERO policies: ningún rol cliente (app web, futura API
-- del bot) tiene ninguna razón para tocar esta tabla directo — es
-- puramente un soporte interno para el EXCLUDE constraint. Sin
-- policies, RLS bloquea todo acceso directo de cualquier rol que no
-- sea el owner; la única vía de escritura es sync_reserva_cabanas()
-- más abajo, que la sortea a propósito vía SECURITY DEFINER (ver
-- header). Si en algún momento algo necesita leer esta tabla directo,
-- eso es una decisión aparte, explícita — no agregar una policy
-- "por si acaso" acá.

-- Función de sync, usada por el trigger de abajo. No se llama nunca
-- directa fuera de un trigger (usa NEW/OLD/TG_OP), así que el
-- backfill de más abajo repite la misma lógica de resolución en un
-- bloque propio, en vez de intentar invocarla como función común.
create or replace function sync_reserva_cabanas() returns trigger as $$
declare
  nombre_cabana      text;
  cabana_id_resuelto uuid;
  cabanas_insertadas integer := 0;
begin
  if tg_op = 'DELETE' then
    -- Redundante con el `on delete cascade` del FK (ya borraría estas
    -- filas solo), pero explícito a propósito — no depende de que
    -- nadie recuerde por qué existe el cascade.
    delete from reserva_cabanas where reserva_id = old.id;
    return old;
  end if;

  if new.estado = 'Cancelada' then
    -- Fuera de alcance a propósito (ver header): nada lee esta tabla
    -- salvo el EXCLUDE constraint, que ya ignora Cancelada por su
    -- propio WHERE — no hay ninguna fila que resolver ni insertar
    -- acá, sólo limpiar lo que pudiera haber quedado de antes de
    -- cancelarse.
    delete from reserva_cabanas where reserva_id = new.id;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Sólo re-sincroniza si cambió algo que de verdad afecta a
    -- reserva_cabanas — una edición de nombre_apellido/email/montos no
    -- toca cabañas/fechas/estado, no hay nada que resincronizar.
    if new.cabana          is not distinct from old.cabana
       and new.fecha_entrada is not distinct from old.fecha_entrada
       and new.fecha_salida  is not distinct from old.fecha_salida
       and new.estado        is not distinct from old.estado then
      return new;
    end if;
  end if;

  delete from reserva_cabanas where reserva_id = new.id;

  for nombre_cabana in
    select x from unnest(string_to_array(new.cabana, chr(10))) as x where x <> ''
  loop
    select c.id into cabana_id_resuelto
    from cabanas c
    where c.complejo_id = new.complejo_id
      and (c.nombre = nombre_cabana or nombre_cabana = any(c.nombres_anteriores))
    limit 1;

    if cabana_id_resuelto is null then
      raise exception 'sync_reserva_cabanas: no se pudo resolver la cabaña "%" (reserva %, complejo %) a ninguna fila de cabanas (ni nombre actual ni nombres_anteriores) — abortando el write completo en vez de dejarla sin protección.', nombre_cabana, new.codigo, new.complejo_id;
    end if;

    insert into reserva_cabanas (reserva_id, cabana_id, fecha_entrada, fecha_salida, estado)
    values (new.id, cabana_id_resuelto, new.fecha_entrada, new.fecha_salida, new.estado);
    cabanas_insertadas := cabanas_insertadas + 1;
  end loop;

  if cabanas_insertadas = 0 then
    raise exception 'sync_reserva_cabanas: la reserva % (complejo %, estado %) no resolvió NINGUNA cabaña — cabana=''%'' — quedaría sin protección del exclusion constraint. Abortando en vez de dejarla pasar en silencio.', new.codigo, new.complejo_id, new.estado, new.cabana;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_sync_reserva_cabanas on reservas;
create trigger trg_sync_reserva_cabanas
  after insert or update or delete on reservas
  for each row execute function sync_reserva_cabanas();

-- Backfill único: misma lógica de resolución que la función de
-- arriba (duplicada acá a propósito, no reusada — la función sólo
-- tiene sentido en contexto de trigger, con NEW/OLD/TG_OP), aplicada
-- a cada fila YA existente en `reservas`. `where estado <> 'Cancelada'`
-- mantiene el alcance idéntico al de la función y al de la auditoría
-- de Fase 0+ (ver header) — las Canceladas nunca se tocan, ni para
-- borrar (no deberían tener filas previas de todas formas, al ser la
-- primera corrida). Borra-y-reinserta por reserva en vez de un INSERT
-- ciego, para que correr este archivo una segunda vez sea un no-op
-- limpio, no un choque contra el EXCLUDE constraint consigo mismo.
do $$
declare
  r                  record;
  nombre_cabana      text;
  cabana_id_resuelto uuid;
  cabanas_insertadas integer;
begin
  for r in select * from reservas where estado <> 'Cancelada' loop
    delete from reserva_cabanas where reserva_id = r.id;
    cabanas_insertadas := 0;

    for nombre_cabana in
      select x from unnest(string_to_array(r.cabana, chr(10))) as x where x <> ''
    loop
      select c.id into cabana_id_resuelto
      from cabanas c
      where c.complejo_id = r.complejo_id
        and (c.nombre = nombre_cabana or nombre_cabana = any(c.nombres_anteriores))
      limit 1;

      if cabana_id_resuelto is null then
        raise exception 'Backfill reserva_cabanas: no se pudo resolver la cabaña "%" (reserva %, complejo %) — abortando TODO el backfill (y toda la migración, va dentro del mismo BEGIN/COMMIT), no se aplica nada parcial.', nombre_cabana, r.codigo, r.complejo_id;
      end if;

      insert into reserva_cabanas (reserva_id, cabana_id, fecha_entrada, fecha_salida, estado)
      values (r.id, cabana_id_resuelto, r.fecha_entrada, r.fecha_salida, r.estado);
      cabanas_insertadas := cabanas_insertadas + 1;
    end loop;

    if cabanas_insertadas = 0 then
      raise exception 'Backfill reserva_cabanas: la reserva % (complejo %, estado %) no resolvió NINGUNA cabaña — cabana=''%'' — quedaría sin protección del exclusion constraint. Abortando TODO el backfill.', r.codigo, r.complejo_id, r.estado, r.cabana;
    end if;
  end loop;
end $$;

-- Verificación de solo lectura (SELECT, no RAISE NOTICE, para que se
-- vea directo en el panel de resultados del SQL Editor): compara el
-- total de filas activas (no-Canceladas) en reserva_cabanas contra la
-- cantidad esperada de pares reserva+cabaña activos, contando
-- directo sobre `reservas` sin pasar por la tabla nueva. `coincide`
-- tiene que dar `true`.
select
  (select count(*) from reserva_cabanas where estado <> 'Cancelada')
    as filas_reserva_cabanas_activas,
  (select count(*)
     from reservas r, unnest(string_to_array(r.cabana, chr(10))) as x
     where r.estado <> 'Cancelada' and x <> '')
    as pares_reserva_cabana_esperados,
  (select count(*) from reserva_cabanas where estado <> 'Cancelada')
  =
  (select count(*)
     from reservas r, unnest(string_to_array(r.cabana, chr(10))) as x
     where r.estado <> 'Cancelada' and x <> '')
    as coincide;

commit;

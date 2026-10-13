-- ============================================================
-- 030_mimmo_los_amigos_rename_definitivo.sql
--
-- Renombra 8 cabañas de Mimmo y 3 de Los Amigos a sus nombres
-- definitivos. A diferencia del intento anterior (ver
-- 026_mimmo_cabanas_sin_prefijo.sql — aplicado SÓLO a staging, nunca a
-- producción, con nombres de seed de prueba que no eran los reales),
-- este archivo está escrito y verificado contra los nombres REALES de
-- producción, confirmados en vivo antes de escribir este archivo:
--
--   MIMMO:       Chalet 3 Ambientes, Confort I, Confort II,
--                2 Ambientes Planta Baja I/II, 2 Ambientes Planta Alta I/II,
--                Clásica I/II, Mimmo I/II/III
--   LOS AMIGOS:  Casa, Departamento, Dúplex I, Dúplex II
--
-- Pensado para correr tal cual contra CUALQUIER entorno (staging o
-- producción) que tenga estos nombres reales — no asume ids (UUIDs
-- generados por fila, distintos en cada entorno).
--
-- ── Renombres — MIMMO ───────────────────────────────────────
--   "Confort I"                   -> "Confort 2"
--   "Confort II"                  -> "Confort 3"
--   "2 Ambientes Planta Baja I"   -> "2 Ambientes Planta Baja 4"
--   "2 Ambientes Planta Baja II"  -> "2 Ambientes Planta Baja 5"
--   "2 Ambientes Planta Alta I"   -> "2 Ambientes Planta Alta 6"
--   "2 Ambientes Planta Alta II"  -> "2 Ambientes Planta Alta 7"
--   "Clásica I"                   -> "Clásica 8"
--   "Clásica II"                  -> "Clásica 9"
--   Sin tocar: "Chalet 3 Ambientes", "Mimmo I", "Mimmo II", "Mimmo III".
--
-- ── Renombres — LOS AMIGOS ──────────────────────────────────
--   "Departamento" -> "Depto"
--   "Dúplex I"     -> "Dúplex 3"
--   "Dúplex II"    -> "Dúplex 4"
--   Sin tocar: "Casa".
--
-- ── Bloque 0 — nueva columna: cabanas.nombres_anteriores ────
-- Mismo patrón nullable/genérico que ya usa `grupo`
-- (013_cabanas_grupo.sql): una columna array, default '{}', que
-- cualquier complejo puede usar si hace falta, sin afectar a los que
-- no la usan.
--
-- `reservas.cabana` es texto libre (no FK a cabanas.id — ver
-- `cabana text not null` en 001_schema.sql): una COPIA del nombre de
-- la cabaña al momento de crear la reserva, no una referencia viva. A
-- DIFERENCIA de 026 (que además reescribía reservas.cabana al nombre
-- nuevo, Bloque 2 de ese archivo), ESTE migration tiene la restricción
-- explícita de NO TOCAR NINGUNA FILA DE RESERVAS — ni una sola reserva
-- existente se modifica acá, en ningún paso. En su lugar, cada rename
-- guarda el nombre viejo en `nombres_anteriores` (array, admite más de
-- un nombre viejo si la cabaña se vuelve a renombrar en el futuro), y
-- el código de la app (resolverColorCabana/reservaIncluyeCabana/
-- cabanaStatus/CabanaBadge/Ganancias "por cabaña" — ver
-- ComplejoContext.jsx/Disponibilidad.jsx/Reservas.jsx/Ganancias.jsx)
-- matchea una reserva contra una cabaña por su nombre ACTUAL o por
-- cualquiera de sus nombres anteriores, así que una reserva vieja
-- sigue resolviendo a la cabaña correcta sin que su fila cambie nunca.
--
-- ── Bloque 1/2 — auto-verificado por `orden`, no por `nombre` ──────
-- Cada rename hace lo siguiente, EN ORDEN, por cabaña:
--   1. Busca la fila por complejo_id + orden (posición estable, fijada
--      al crear la cabaña — ver supabase/cutover/002_seed_datos.sql —
--      y ajena a si el nombre coincide o no con lo esperado).
--   2. Si no hay ninguna fila en ese orden: la saltea y lo reporta
--      (RAISE NOTICE) — no inserta nada, no asume nada.
--   3. Si el nombre actual YA es el nuevo (migration corrida de
--      vuelta, por accidente o a propósito): lo reporta como "ya
--      aplicado" y NO vuelve a tocar la fila — evita duplicar el
--      mismo nombre viejo dos veces en nombres_anteriores si esto se
--      corre más de una vez.
--   4. Si el nombre actual NO es ni el viejo esperado ni el nuevo:
--      lo SALTEA y lo reporta con el nombre real encontrado, en vez
--      de renombrar a ciegas — así una sola fila inesperada no
--      corrompe en silencio el resto de la migración ni termina
--      "robándole" el nombre nuevo a una cabaña que no correspondía.
--   5. Sólo si el nombre actual coincide EXACTO con el esperado:
--      renombra y guarda el nombre viejo en nombres_anteriores.
-- RAISE NOTICE (no RAISE EXCEPTION) en cada rama: un salteo no aborta
-- el resto de la migración, cada cabaña se procesa independiente.
--
-- Revisar el tab de "Messages"/resultados del SQL Editor después de
-- correr esto — ahí queda el reporte completo (OK u SKIP) por cabaña.
-- La consulta final (sólo SELECT, no escribe nada) deja ver el estado
-- resultante de las 16 cabañas de los dos complejos para confirmar a
-- ojo antes de cerrar.
--
-- ── Bloque 1b — agregado tras la primera corrida en staging ────────
-- Esta migración ya se corrió una vez contra staging. Resultado real:
-- "Departamento" -> "Depto" (Los Amigos) renombró OK, y las otras 7
-- cabañas de Mimmo/Los Amigos ya estaban correctas de antes — nada que
-- tocar ahí, confirmado por el dueño del producto. Pero las 4 cabañas
-- "2 Ambientes Planta Baja/Alta" de Mimmo (orden 4-7) se SALTEARON: el
-- self-check hizo exactamente lo que tenía que hacer — ni el nombre
-- esperado ("2 Ambientes Planta Baja I", el nombre real original de
-- producción, confirmado en el audit de esta tarea) ni el nuevo
-- matcheaban el nombre real encontrado en staging ("Dos Ambientes
-- Planta Baja 4", con número arábigo YA puesto pero "Dos" en vez de
-- "2") — leftover de una edición manual informal hecha directo en
-- staging ANTES de correr esta migración, nunca registrada en ningún
-- archivo versionado. El Bloque 1 de más abajo NO se toca (sigue
-- siendo correcto para cualquier entorno — como producción — que
-- todavía tenga el nombre real original "2 Ambientes Planta Baja I").
-- Bloque 1b es un segundo intento, SÓLO para esas 4 cabañas puntuales
-- por `orden`, que además acepta la forma "Dos Ambientes..." como
-- nombre esperado alternativo. En cualquier entorno donde el Bloque 1
-- ya haya renombrado estas 4 filas (producción, o staging en una
-- corrida futura desde cero), Bloque 1b las encuentra con el nombre ya
-- correcto y no hace nada ("ya aplicado") — correr este archivo
-- completo de nuevo, en cualquier entorno, en cualquier orden de
-- corridas previas, es seguro.
-- ============================================================

-- ── Bloque 0: nueva columna ─────────────────────────────────

alter table cabanas add column if not exists nombres_anteriores text[] not null default '{}';

comment on column cabanas.nombres_anteriores is
  'Nombres anteriores de esta cabaña (si fue renombrada), más viejo primero. reservas.cabana es texto libre y nunca se reescribe en un rename — el código de la app matchea una reserva contra una cabaña por su nombre actual O cualquiera de éstos (ver cabinMatchesName en src/context/ComplejoContext.jsx).';

-- ── Bloque 1: MIMMO ─────────────────────────────────────────

do $$
declare
  v_complejo_id uuid;
  v_id          uuid;
  v_nombre_actual text;
  v_renombres jsonb := '[
    {"orden": 2, "esperado": "Confort I",                  "nuevo": "Confort 2"},
    {"orden": 3, "esperado": "Confort II",                 "nuevo": "Confort 3"},
    {"orden": 4, "esperado": "2 Ambientes Planta Baja I",  "nuevo": "2 Ambientes Planta Baja 4"},
    {"orden": 5, "esperado": "2 Ambientes Planta Baja II", "nuevo": "2 Ambientes Planta Baja 5"},
    {"orden": 6, "esperado": "2 Ambientes Planta Alta I",  "nuevo": "2 Ambientes Planta Alta 6"},
    {"orden": 7, "esperado": "2 Ambientes Planta Alta II", "nuevo": "2 Ambientes Planta Alta 7"},
    {"orden": 8, "esperado": "Clásica I",                  "nuevo": "Clásica 8"},
    {"orden": 9, "esperado": "Clásica II",                 "nuevo": "Clásica 9"}
  ]'::jsonb;
  v_item jsonb;
begin
  select id into v_complejo_id from complejos where slug = 'mimmo';

  if v_complejo_id is null then
    raise notice '[MIMMO] complejo no encontrado (slug=mimmo) — nada para hacer.';
    return;
  end if;

  for v_item in select * from jsonb_array_elements(v_renombres)
  loop
    select id, nombre into v_id, v_nombre_actual
    from cabanas
    where complejo_id = v_complejo_id
      and orden = (v_item->>'orden')::int;

    if v_id is null then
      raise notice '[MIMMO] orden=% : no se encontró ninguna cabaña en esa posición — SKIP', v_item->>'orden';
    elsif v_nombre_actual = (v_item->>'nuevo') then
      raise notice '[MIMMO] orden=% : ya tiene el nombre nuevo ("%") — nada para hacer', v_item->>'orden', v_nombre_actual;
    elsif v_nombre_actual <> (v_item->>'esperado') then
      raise notice '[MIMMO] orden=% : nombre actual ("%") NO coincide con el esperado ("%") — SKIP, no se renombra', v_item->>'orden', v_nombre_actual, v_item->>'esperado';
    else
      update cabanas
      set nombre = (v_item->>'nuevo'),
          nombres_anteriores = array_append(nombres_anteriores, v_nombre_actual)
      where id = v_id;
      raise notice '[MIMMO] orden=% : "%" -> "%"  OK', v_item->>'orden', v_nombre_actual, v_item->>'nuevo';
    end if;
  end loop;
end $$;

-- ── Bloque 1b: MIMMO — fix de las 4 "Dos Ambientes..." ──────
-- Ver nota "Bloque 1b" en el header de arriba. Mismo patrón de 4 ramas
-- que Bloque 1/2, mismas 4 posiciones (orden 4-7), pero con
-- `esperado` = la forma "Dos Ambientes..." que quedó en staging por la
-- edición manual previa a esta migración. No toca ninguna otra fila
-- (ni "Departamento"/"Depto", ni ninguna de las 7 cabañas ya
-- correctas) — alcance idéntico a lo pedido: sólo estas 4.

do $$
declare
  v_complejo_id uuid;
  v_id          uuid;
  v_nombre_actual text;
  v_renombres jsonb := '[
    {"orden": 4, "esperado": "Dos Ambientes Planta Baja 4", "nuevo": "2 Ambientes Planta Baja 4"},
    {"orden": 5, "esperado": "Dos Ambientes Planta Baja 5", "nuevo": "2 Ambientes Planta Baja 5"},
    {"orden": 6, "esperado": "Dos Ambientes Planta Alta 6", "nuevo": "2 Ambientes Planta Alta 6"},
    {"orden": 7, "esperado": "Dos Ambientes Planta Alta 7", "nuevo": "2 Ambientes Planta Alta 7"}
  ]'::jsonb;
  v_item jsonb;
begin
  select id into v_complejo_id from complejos where slug = 'mimmo';

  if v_complejo_id is null then
    raise notice '[MIMMO fix Dos Ambientes] complejo no encontrado (slug=mimmo) — nada para hacer.';
    return;
  end if;

  for v_item in select * from jsonb_array_elements(v_renombres)
  loop
    select id, nombre into v_id, v_nombre_actual
    from cabanas
    where complejo_id = v_complejo_id
      and orden = (v_item->>'orden')::int;

    if v_id is null then
      raise notice '[MIMMO fix Dos Ambientes] orden=% : no se encontró ninguna cabaña en esa posición — SKIP', v_item->>'orden';
    elsif v_nombre_actual = (v_item->>'nuevo') then
      raise notice '[MIMMO fix Dos Ambientes] orden=% : ya tiene el nombre nuevo ("%") — nada para hacer', v_item->>'orden', v_nombre_actual;
    elsif v_nombre_actual <> (v_item->>'esperado') then
      raise notice '[MIMMO fix Dos Ambientes] orden=% : nombre actual ("%") NO coincide con el esperado ("%") — SKIP, no se renombra', v_item->>'orden', v_nombre_actual, v_item->>'esperado';
    else
      update cabanas
      set nombre = (v_item->>'nuevo'),
          nombres_anteriores = array_append(nombres_anteriores, v_nombre_actual)
      where id = v_id;
      raise notice '[MIMMO fix Dos Ambientes] orden=% : "%" -> "%"  OK', v_item->>'orden', v_nombre_actual, v_item->>'nuevo';
    end if;
  end loop;
end $$;

-- ── Bloque 2: LOS AMIGOS ────────────────────────────────────

do $$
declare
  v_complejo_id uuid;
  v_id          uuid;
  v_nombre_actual text;
  v_renombres jsonb := '[
    {"orden": 2, "esperado": "Departamento", "nuevo": "Depto"},
    {"orden": 3, "esperado": "Dúplex I",     "nuevo": "Dúplex 3"},
    {"orden": 4, "esperado": "Dúplex II",    "nuevo": "Dúplex 4"}
  ]'::jsonb;
  v_item jsonb;
begin
  select id into v_complejo_id from complejos where slug = 'los-amigos';

  if v_complejo_id is null then
    raise notice '[LOS AMIGOS] complejo no encontrado (slug=los-amigos) — nada para hacer.';
    return;
  end if;

  for v_item in select * from jsonb_array_elements(v_renombres)
  loop
    select id, nombre into v_id, v_nombre_actual
    from cabanas
    where complejo_id = v_complejo_id
      and orden = (v_item->>'orden')::int;

    if v_id is null then
      raise notice '[LOS AMIGOS] orden=% : no se encontró ninguna cabaña en esa posición — SKIP', v_item->>'orden';
    elsif v_nombre_actual = (v_item->>'nuevo') then
      raise notice '[LOS AMIGOS] orden=% : ya tiene el nombre nuevo ("%") — nada para hacer', v_item->>'orden', v_nombre_actual;
    elsif v_nombre_actual <> (v_item->>'esperado') then
      raise notice '[LOS AMIGOS] orden=% : nombre actual ("%") NO coincide con el esperado ("%") — SKIP, no se renombra', v_item->>'orden', v_nombre_actual, v_item->>'esperado';
    else
      update cabanas
      set nombre = (v_item->>'nuevo'),
          nombres_anteriores = array_append(nombres_anteriores, v_nombre_actual)
      where id = v_id;
      raise notice '[LOS AMIGOS] orden=% : "%" -> "%"  OK', v_item->>'orden', v_nombre_actual, v_item->>'nuevo';
    end if;
  end loop;
end $$;

-- ── Bloque 3: verificación final (sólo lectura) ─────────────

select c.slug as complejo, cb.orden, cb.nombre, cb.grupo, cb.nombres_anteriores
from cabanas cb
join complejos c on c.id = cb.complejo_id
where c.slug in ('mimmo', 'los-amigos')
order by c.slug, cb.orden;

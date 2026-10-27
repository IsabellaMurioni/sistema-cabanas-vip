-- ============================================================
-- 040_mimmo_i_categoria_planta_backfill.sql
-- Fase 3 de la integración del bot de WhatsApp: backfill de datos (no
-- schema) — completa `cabanas.categoria` y `cabanas.planta` para las
-- 9 unidades del grupo "MIMMO I" (complejo_id resuelto por
-- slug='mimmo'). Las columnas las agregó 038_cabanas_categoria_planta.sql
-- sin backfill a propósito — este archivo es esa carga real, sólo
-- para estas 9 filas puntuales.
--
-- Fuente del dato: confirmado por el negocio contra el documento
-- original de catálogo de cabañas usado desde el inicio de este
-- proyecto — NO deducido del nombre de display actual de cada
-- cabaña. "2 Ambientes Planta Baja 4" → categoria "2 Ambientes" sale
-- parecido al nombre a simple vista, pero el valor real viene del
-- catálogo confirmado, no de parsear ese string (mismo criterio que
-- 037/038: nunca inferir de texto libre pensado para humanos).
--
-- Alcance: SÓLO las 9 unidades de MIMMO I. Las otras 26 unidades (el
-- resto de Mimmo + los 4 complejos restantes) quedan en NULL/NULL
-- hasta que su categoria/planta real también se confirme con el
-- negocio — esto no es un "default" ni una suposición extendida al
-- resto, es exclusivamente la carga de estas 9 filas.
--
-- Cada UPDATE matchea por `complejo_id = (slug='mimmo')` Y `nombre`
-- exacto A LA VEZ — nunca por nombre solo, mismo motivo que 037: el
-- nombre de una cabaña sólo es único DENTRO de su complejo, así que
-- matchear sólo por nombre arriesgaría pisar una cabaña de OTRO
-- complejo si alguna vez coincidiera el nombre.
--
-- Idempotente en la práctica: son UPDATEs por criterio de matching
-- (complejo_id + nombre), no INSERTs — correr este archivo una
-- segunda vez no duplica ninguna fila, sólo reescribe las mismas 9
-- con los mismos valores (no-op real). La única forma de que un
-- segundo run cambie algo es que alguien haya editado categoria/
-- planta a mano entre medio — en ese caso este archivo los pisaría de
-- vuelta a los valores de la tabla de abajo, así que no conviene
-- re-correrlo "por las dudas" sin revisar antes.
--
-- Estructura del archivo, en este orden (pensado para poder correr y
-- LEER el paso 1 antes de decidir si seguir con el paso 2), mismo
-- patrón que 037_cabanas_vip_pax_backfill.sql:
--   1. Verificación de solo lectura ANTES de tocar nada — confirma
--      que existen exactamente las 9 filas esperadas y que las 9
--      están hoy en NULL/NULL (categoria y planta).
--   2. Los 9 UPDATE, envueltos en begin;/commit; (mismo patrón
--      transaccional que 038/039) — se aplican las 9 juntas o
--      ninguna. Las dos verificaciones (1 y 3) quedan FUERA de la
--      transacción a propósito, para poder correrlas sueltas en
--      cualquier momento.
--   3. Verificación de solo lectura DESPUÉS — confirma que las 9
--      quedaron con los valores exactos de la tabla de abajo.
-- ============================================================

-- ── 1. Verificación ANTES (solo lectura) ──────────────────────

-- 1a) Resumen: cantidad de filas esperadas y cuántas están en
-- NULL/NULL hoy en categoria/planta. Si "ok_para_proceder" no da
-- true, PARAR y revisar antes de seguir al paso 2.
select
  (select count(*) from cabanas c
     where c.complejo_id = (select id from complejos where slug = 'mimmo')
       and c.nombre in (
         'Chalet 3 Ambientes', 'Confort 2', 'Confort 3',
         '2 Ambientes Planta Baja 4', '2 Ambientes Planta Baja 5',
         '2 Ambientes Planta Alta 6', '2 Ambientes Planta Alta 7',
         'Clásica 8', 'Clásica 9'
       )
  ) as total_filas_mimmo_i,
  (select count(*) from cabanas c
     where c.complejo_id = (select id from complejos where slug = 'mimmo')
       and c.nombre in (
         'Chalet 3 Ambientes', 'Confort 2', 'Confort 3',
         '2 Ambientes Planta Baja 4', '2 Ambientes Planta Baja 5',
         '2 Ambientes Planta Alta 6', '2 Ambientes Planta Alta 7',
         'Clásica 8', 'Clásica 9'
       )
       and c.categoria is null and c.planta is null
  ) as filas_con_categoria_planta_null,
  (
    (select count(*) from cabanas c
       where c.complejo_id = (select id from complejos where slug = 'mimmo')
         and c.nombre in (
           'Chalet 3 Ambientes', 'Confort 2', 'Confort 3',
           '2 Ambientes Planta Baja 4', '2 Ambientes Planta Baja 5',
           '2 Ambientes Planta Alta 6', '2 Ambientes Planta Alta 7',
           'Clásica 8', 'Clásica 9'
         )
    ) = 9
    and
    (select count(*) from cabanas c
       where c.complejo_id = (select id from complejos where slug = 'mimmo')
         and c.nombre in (
           'Chalet 3 Ambientes', 'Confort 2', 'Confort 3',
           '2 Ambientes Planta Baja 4', '2 Ambientes Planta Baja 5',
           '2 Ambientes Planta Alta 6', '2 Ambientes Planta Alta 7',
           'Clásica 8', 'Clásica 9'
         )
         and c.categoria is null and c.planta is null
    ) = 9
  ) as ok_para_proceder;

-- 1b) Detalle por cabaña esperada: ¿existe la fila?, y su categoria/
-- planta actual (tienen que salir NULL las 9). Si falta alguna de las
-- 9 (p.ej. "existe" = false), o si alguna YA tiene un valor no nulo,
-- hay que PARAR y revisar antes de seguir al paso 2 — no correr los
-- UPDATE a ciegas sobre esta lista.
with esperados (nombre) as (
  values
    ('Chalet 3 Ambientes'), ('Confort 2'), ('Confort 3'),
    ('2 Ambientes Planta Baja 4'), ('2 Ambientes Planta Baja 5'),
    ('2 Ambientes Planta Alta 6'), ('2 Ambientes Planta Alta 7'),
    ('Clásica 8'), ('Clásica 9')
)
select
  e.nombre as nombre_esperado,
  (c.id is not null) as existe,
  c.categoria,
  c.planta
from esperados e
left join cabanas c
  on c.nombre = e.nombre
 and c.complejo_id = (select id from complejos where slug = 'mimmo')
order by e.nombre;

-- ── 2. UPDATEs ─────────────────────────────────────────────────
-- Envueltos en begin;/commit; (mismo patrón transaccional que
-- 038/039) — las 9 UPDATE se aplican todas juntas o ninguna. Las
-- verificaciones de solo lectura (secciones 1 y 3) quedan AFUERA de
-- la transacción a propósito, para poder correrlas sueltas en
-- cualquier momento (antes de decidir si seguir al paso 2, o después,
-- sin que ninguna de las dos dependa de que una transacción esté
-- abierta).

begin;

update cabanas set categoria = 'Chalet 3 Ambientes', planta = 'planta_baja'
where complejo_id = (select id from complejos where slug = 'mimmo')
  and nombre = 'Chalet 3 Ambientes';

update cabanas set categoria = 'Confort', planta = 'planta_baja'
where complejo_id = (select id from complejos where slug = 'mimmo')
  and nombre = 'Confort 2';

update cabanas set categoria = 'Confort', planta = 'planta_baja'
where complejo_id = (select id from complejos where slug = 'mimmo')
  and nombre = 'Confort 3';

update cabanas set categoria = '2 Ambientes', planta = 'planta_baja'
where complejo_id = (select id from complejos where slug = 'mimmo')
  and nombre = '2 Ambientes Planta Baja 4';

update cabanas set categoria = '2 Ambientes', planta = 'planta_baja'
where complejo_id = (select id from complejos where slug = 'mimmo')
  and nombre = '2 Ambientes Planta Baja 5';

update cabanas set categoria = '2 Ambientes', planta = 'planta_alta'
where complejo_id = (select id from complejos where slug = 'mimmo')
  and nombre = '2 Ambientes Planta Alta 6';

update cabanas set categoria = '2 Ambientes', planta = 'planta_alta'
where complejo_id = (select id from complejos where slug = 'mimmo')
  and nombre = '2 Ambientes Planta Alta 7';

update cabanas set categoria = 'Clásica', planta = 'planta_baja'
where complejo_id = (select id from complejos where slug = 'mimmo')
  and nombre = 'Clásica 8';

update cabanas set categoria = 'Clásica', planta = 'planta_baja'
where complejo_id = (select id from complejos where slug = 'mimmo')
  and nombre = 'Clásica 9';

commit;

-- ── 3. Verificación DESPUÉS (solo lectura) ────────────────────

-- Compara cada fila contra el valor esperado — `coincide` tiene que
-- dar `true` en las 9 filas.
with esperados (nombre, categoria_esperada, planta_esperada) as (
  values
    ('Chalet 3 Ambientes', 'Chalet 3 Ambientes', 'planta_baja'),
    ('Confort 2', 'Confort', 'planta_baja'),
    ('Confort 3', 'Confort', 'planta_baja'),
    ('2 Ambientes Planta Baja 4', '2 Ambientes', 'planta_baja'),
    ('2 Ambientes Planta Baja 5', '2 Ambientes', 'planta_baja'),
    ('2 Ambientes Planta Alta 6', '2 Ambientes', 'planta_alta'),
    ('2 Ambientes Planta Alta 7', '2 Ambientes', 'planta_alta'),
    ('Clásica 8', 'Clásica', 'planta_baja'),
    ('Clásica 9', 'Clásica', 'planta_baja')
)
select
  c.nombre,
  c.categoria,
  c.planta,
  (c.categoria = e.categoria_esperada and c.planta = e.planta_esperada) as coincide
from cabanas c
join esperados e on e.nombre = c.nombre
where c.complejo_id = (select id from complejos where slug = 'mimmo')
order by c.nombre;

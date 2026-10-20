-- ============================================================
-- 037_cabanas_vip_pax_backfill.sql
-- Fecha: 2026-10-20
--
-- Backfill de datos (no schema) — completa `cabanas.pax_min` y
-- `cabanas.pax_max` para las 15 cabañas de "Cabañas VIP"
-- (complejo_id resuelto por slug='cabanas-vip'). A diferencia de los
-- otros 4 complejos, estas dos columnas nunca se cargaron para
-- Cabañas VIP en producción — hoy están en NULL en las 15 filas.
--
-- Los valores de pax_min/pax_max de abajo NO son una suposición ni se
-- derivaron de ningún criterio automático — fueron verificados a mano
-- contra el historial real de reservas y confirmados directamente por
-- la dueña del negocio, cabaña por cabaña.
--
-- Puramente aditivo sobre datos: sólo toca `cabanas.pax_min`/
-- `pax_max` de estas 15 filas puntuales. No toca `reservas` ni
-- ninguna otra tabla, no agrega ni borra columnas, no toca ningún
-- otro complejo.
--
-- Cada UPDATE matchea por `complejo_id = (slug='cabanas-vip')` Y
-- `nombre` exacto A LA VEZ — nunca por nombre solo. Esto es a
-- propósito: el nombre de una cabaña sólo es único DENTRO de su
-- complejo (confirmado en el resto del repo — `codigo` de reservas es
-- unique(complejo_id, codigo), no global), así que matchear sólo por
-- nombre arriesgaría pisar una cabaña de OTRO complejo si alguna vez
-- coincidiera el nombre. Con las dos condiciones juntas, eso es
-- imposible.
--
-- Estructura del archivo, en este orden (pensado para poder correr y
-- LEER el paso 1 antes de decidir si seguir con el paso 2):
--   1. Verificación de solo lectura ANTES de tocar nada — confirma
--      que existen exactamente las 15 filas esperadas y que las 15
--      están hoy en NULL/NULL.
--   2. Los 15 UPDATE.
--   3. Verificación de solo lectura DESPUÉS — confirma que las 15
--      quedaron con los valores exactos de la tabla de abajo.
-- ============================================================

-- ── 1. Verificación ANTES (solo lectura) ──────────────────────

-- 1a) Resumen: cantidad de filas y cuántas están en NULL/NULL.
select
  (select count(*) from cabanas c
     where c.complejo_id = (select id from complejos where slug = 'cabanas-vip')
  ) as total_filas_cabanas_vip,
  (select count(*) from cabanas c
     where c.complejo_id = (select id from complejos where slug = 'cabanas-vip')
       and c.pax_min is null and c.pax_max is null
  ) as filas_con_pax_null,
  (
    (select count(*) from cabanas c
       where c.complejo_id = (select id from complejos where slug = 'cabanas-vip')
    ) = 15
    and
    (select count(*) from cabanas c
       where c.complejo_id = (select id from complejos where slug = 'cabanas-vip')
         and c.pax_min is null and c.pax_max is null
    ) = 15
  ) as ok_para_proceder;

-- 1b) Detalle por cabaña esperada: ¿existe la fila?, y su pax_min/
-- pax_max actual (tienen que salir NULL las 15). Si falta alguna de
-- las 15 (p.ej. "existe" = false), o si alguna YA tiene un valor no
-- nulo, hay que PARAR y revisar antes de seguir al paso 2 — no correr
-- los UPDATE a ciegas sobre esta lista.
with esperados (nombre) as (
  values
    ('Acapulco'), ('Aruba'), ('Bahama'), ('Bahia'), ('Buzios'),
    ('Cancún'), ('Cozumel'), ('Hawai'), ('Ibiza'), ('Ipanema'),
    ('Itaparica'), ('Jamaica'), ('Maceio'), ('Maui'), ('Vallarta')
)
select
  e.nombre as nombre_esperado,
  (c.id is not null) as existe,
  c.pax_min,
  c.pax_max
from esperados e
left join cabanas c
  on c.nombre = e.nombre
 and c.complejo_id = (select id from complejos where slug = 'cabanas-vip')
order by e.nombre;

-- ── 2. UPDATEs ─────────────────────────────────────────────────

update cabanas set pax_min = 4, pax_max = 4
where complejo_id = (select id from complejos where slug = 'cabanas-vip')
  and nombre = 'Acapulco';

update cabanas set pax_min = 7, pax_max = 7
where complejo_id = (select id from complejos where slug = 'cabanas-vip')
  and nombre = 'Aruba';

update cabanas set pax_min = 2, pax_max = 2
where complejo_id = (select id from complejos where slug = 'cabanas-vip')
  and nombre = 'Bahama';

update cabanas set pax_min = 2, pax_max = 2
where complejo_id = (select id from complejos where slug = 'cabanas-vip')
  and nombre = 'Bahia';

update cabanas set pax_min = 7, pax_max = 7
where complejo_id = (select id from complejos where slug = 'cabanas-vip')
  and nombre = 'Buzios';

update cabanas set pax_min = 7, pax_max = 7
where complejo_id = (select id from complejos where slug = 'cabanas-vip')
  and nombre = 'Cancún';

update cabanas set pax_min = 4, pax_max = 4
where complejo_id = (select id from complejos where slug = 'cabanas-vip')
  and nombre = 'Cozumel';

update cabanas set pax_min = 4, pax_max = 4
where complejo_id = (select id from complejos where slug = 'cabanas-vip')
  and nombre = 'Hawai';

update cabanas set pax_min = 5, pax_max = 5
where complejo_id = (select id from complejos where slug = 'cabanas-vip')
  and nombre = 'Ibiza';

update cabanas set pax_min = 4, pax_max = 4
where complejo_id = (select id from complejos where slug = 'cabanas-vip')
  and nombre = 'Ipanema';

update cabanas set pax_min = 4, pax_max = 4
where complejo_id = (select id from complejos where slug = 'cabanas-vip')
  and nombre = 'Itaparica';

update cabanas set pax_min = 6, pax_max = 6
where complejo_id = (select id from complejos where slug = 'cabanas-vip')
  and nombre = 'Jamaica';

update cabanas set pax_min = 4, pax_max = 4
where complejo_id = (select id from complejos where slug = 'cabanas-vip')
  and nombre = 'Maceio';

update cabanas set pax_min = 3, pax_max = 3
where complejo_id = (select id from complejos where slug = 'cabanas-vip')
  and nombre = 'Maui';

update cabanas set pax_min = 7, pax_max = 7
where complejo_id = (select id from complejos where slug = 'cabanas-vip')
  and nombre = 'Vallarta';

-- ── 3. Verificación DESPUÉS (solo lectura) ────────────────────

-- Compara cada fila contra el valor esperado — `coincide` tiene que
-- dar `true` en las 15 filas.
with esperados (nombre, pax_min_esperado, pax_max_esperado) as (
  values
    ('Acapulco', 4, 4), ('Aruba', 7, 7), ('Bahama', 2, 2), ('Bahia', 2, 2),
    ('Buzios', 7, 7), ('Cancún', 7, 7), ('Cozumel', 4, 4), ('Hawai', 4, 4),
    ('Ibiza', 5, 5), ('Ipanema', 4, 4), ('Itaparica', 4, 4), ('Jamaica', 6, 6),
    ('Maceio', 4, 4), ('Maui', 3, 3), ('Vallarta', 7, 7)
)
select
  c.nombre,
  c.pax_min,
  c.pax_max,
  (c.pax_min = e.pax_min_esperado and c.pax_max = e.pax_max_esperado) as coincide
from cabanas c
join esperados e on e.nombre = c.nombre
where c.complejo_id = (select id from complejos where slug = 'cabanas-vip')
order by c.nombre;

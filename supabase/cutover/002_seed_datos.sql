-- ============================================================
-- FASE 6 — CONSOLIDATED PRODUCTION SEED
-- Correr DESPUÉS de 001_migrations_010_a_024.sql.
--
-- Incluye, en este orden:
--   0. MIMMO (complejo + 12 cabañas) — ver advertencia debajo.
--   1. seed/001_complejos_nuevos.sql   (Casas Azahar/Los Amigos/Chacras del Mar + cabañas)
--   2. seed/002_complejos_ubicacion.sql (ubicación de los 4 complejos NO-VIP + nombre "Mimmo")
--   4. Accesos de usuarios reales (membresías) — lista FINAL, ver nota debajo.
--
-- seed/003_precios_test_fase5.sql queda EXCLUIDO A PROPÓSITO — son
-- precios de prueba descartables (Casas Azahar/Los Amigos/Chacras del
-- Mar), nunca pensados para producción.
--
-- ⚠️⚠️⚠️ ADVERTENCIA — BLOQUE "0. MIMMO" ⚠️⚠️⚠️
-- Este bloque NO viene de ningún archivo existente del repo. Investigué
-- a fondo (grep de "mimmo" en todo supabase/migrations + supabase/seed)
-- y confirmé que NINGÚN migration ni seed de este repo crea la fila de
-- `complejos` ni las 12 de `cabanas` para Mimmo — sólo existen
-- UPDATEs que ASUMEN que ya existen (seed/002, migración 013). Mimmo
-- se debe haber cargado a mano, directo en el SQL Editor de staging,
-- en algún momento anterior a que existiera la convención de archivos
-- de seed — nunca quedó guardado en ningún archivo versionado.
--
-- Lo que sigue es una RECONSTRUCCIÓN fiel, armada consultando
-- directamente los valores REALES y actuales de staging (nombre, slug,
-- colores, ubicación, y las 12 cabañas con sus pax/orden/color/grupo
-- exactos). No es un archivo histórico — es nuevo, escrito para esta
-- tarea. Confirmá que estos son los valores correctos antes de correr
-- esto contra producción.
--
-- ── BLOQUE "4. ACCESOS DE USUARIOS" — lista FINAL ──────────────────────
-- A diferencia de la versión anterior de este archivo (que usaba UUIDs
-- capturados de staging, con una advertencia de "verificar antes de
-- correr"), esta lista fue provista directamente para producción real:
-- 6 usuarios, 3 roles. `complejosmarazul@gmail.com` (versión anterior)
-- queda afuera a propósito — esa cuenta se borró y la reemplazó
-- lorenaruocco75@gmail.com. No verifiqué estos UUIDs yo mismo (no tengo
-- acceso a producción) — son los que me pasaron como valores reales.
-- ============================================================


-- ── 0. MIMMO — reconstrucción, ver ADVERTENCIA #1 arriba ──────────────

insert into complejos (nombre, slug, ubicacion, color_primario, color_secundario)
values ('Mimmo', 'mimmo', 'Mar Azul', '#04214A', '#E3EDF7');

insert into cabanas (complejo_id, nombre, color, pax_min, pax_max, orden, grupo)
select (select id from complejos where slug = 'mimmo'), nombre, color, pax_min, pax_max, orden, grupo
from (values
  ('Chalet 3 Ambientes',               '#962C2C', 6, 6, 1,  'MIMMO I'),
  ('Cabaña Confort I',                 '#B16B25', 4, 5, 2,  'MIMMO I'),
  ('Cabaña Confort II',                '#96962C', 4, 5, 3,  'MIMMO I'),
  ('Cabaña 2 Ambientes Planta Baja I', '#6BB125', 3, 3, 4,  'MIMMO I'),
  ('Cabaña 2 Ambientes Planta Baja II','#2C962C', 3, 3, 5,  'MIMMO I'),
  ('Cabaña 2 Ambientes Planta Alta I', '#25B16B', 3, 3, 6,  'MIMMO I'),
  ('Cabaña 2 Ambientes Planta Alta II','#2C9696', 3, 3, 7,  'MIMMO I'),
  ('Cabaña Clásica I',                 '#256BB1', 3, 4, 8,  'MIMMO I'),
  ('Cabaña Clásica II',                '#2C2C96', 3, 4, 9,  'MIMMO I'),
  ('Cabaña Mimmo I',                   '#6B25B1', 6, 6, 10, 'MIMMO II'),
  ('Cabaña Mimmo II',                  '#962C96', 6, 6, 11, 'MIMMO II'),
  ('Cabaña Mimmo III',                 '#B1256B', 6, 6, 12, 'MIMMO II')
) as t(nombre, color, pax_min, pax_max, orden, grupo);


-- ── 1. seed/001_complejos_nuevos.sql (verbatim) ────────────────────────

insert into complejos (nombre, slug, color_primario, color_secundario)
values
  ('Casas Azahar',    'casas-azahar',    '#FE824C', '#FEE59A'),
  ('Los Amigos',      'los-amigos',      '#8A6852', '#E2CFA8'),
  ('Chacras del Mar', 'chacras-del-mar', '#68B999', '#D4EAFE');

insert into cabanas (complejo_id, nombre, pax_min, pax_max, orden)
select (select id from complejos where slug = 'casas-azahar'), nombre, pax_min, pax_max, orden
from (values
  ('Casa Azahar I',  10, 10, 1),
  ('Casa Azahar II',  4,  4, 2)
) as t(nombre, pax_min, pax_max, orden);

insert into cabanas (complejo_id, nombre, pax_min, pax_max, orden)
select (select id from complejos where slug = 'los-amigos'), nombre, pax_min, pax_max, orden
from (values
  ('Casa',         6, 6, 1),
  ('Departamento', 4, 4, 2),
  ('Dúplex I',     5, 5, 3),
  ('Dúplex II',    5, 5, 4)
) as t(nombre, pax_min, pax_max, orden);

insert into cabanas (complejo_id, nombre, pax_min, pax_max, orden)
select (select id from complejos where slug = 'chacras-del-mar'), nombre, pax_min, pax_max, orden
from (values
  ('Chacras 23', 6, 6, 1),
  ('Chacras 24', 6, 6, 2)
) as t(nombre, pax_min, pax_max, orden);


-- ── 2. seed/002_complejos_ubicacion.sql (verbatim) ─────────────────────
-- (El UPDATE de Mimmo acá es redundante con el INSERT del bloque 0 de
-- arriba, que ya inserta nombre='Mimmo'/ubicacion='Mar Azul' — se deja
-- igual para no desviarse del archivo real; no tiene ningún efecto
-- extra, simplemente reafirma el mismo valor.)

update complejos set nombre = 'Mimmo', ubicacion = 'Mar Azul' where slug = 'mimmo';
update complejos set ubicacion = 'Mar de las Pampas' where slug = 'casas-azahar';
update complejos set ubicacion = 'Mar Azul' where slug = 'los-amigos';
update complejos set ubicacion = 'Mar Azul' where slug = 'chacras-del-mar';


-- ── 4. Accesos de usuarios reales (membresías) — lista FINAL ───────────
-- seed/003_precios_test_fase5.sql EXCLUIDO A PROPÓSITO (precios de prueba descartables).

-- Acceso completo (rol='completo') a los 5 complejos.
insert into membresias (user_id, complejo_id, rol)
select u.user_id, c.id, 'completo'
from (values
  ('db9ae635-9864-44ab-bf62-b82052288f4e'::uuid), -- isamurioni07@gmail.com
  ('cae8f24a-a529-458d-b8be-7c426f386182'::uuid), -- carolina.derosa@hotmail.com
  ('cb6879f4-7f34-49e3-a57e-2e931fff5ddd'::uuid), -- julieta.derosa@hotmail.com
  ('a111a86c-b522-4973-b8f9-95a6cc672125'::uuid)  -- lorenaruocco75@gmail.com
) as u(user_id)
cross join complejos c
on conflict do nothing;

-- Restringido: únicamente Cabañas VIP, rol='limitado_caja_silvia'.
insert into membresias (user_id, complejo_id, rol)
select 'e1ba86e1-2b8f-438a-8f91-86009ad13394'::uuid, id, 'limitado_caja_silvia' -- frettisilvia6@gmail.com
from complejos where slug = 'cabanas-vip'
on conflict do nothing;

-- Restringido: Reservas + Disponibilidad únicamente, en los 5 complejos, rol='limitado_reservas'.
insert into membresias (user_id, complejo_id, rol)
select 'f959bdb2-2fd1-4404-b676-e31df2914895'::uuid, id, 'limitado_reservas' -- pamvass28@gmail.com
from complejos
on conflict do nothing;

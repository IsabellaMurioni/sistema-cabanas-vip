-- ============================================================
-- 001_complejos_nuevos.sql
-- Datos (no esquema): carga de los 3 complejos nuevos — Casas
-- Azahar, Los Amigos, Chacras del Mar — + sus cabañas, mismo
-- patrón ya usado para MIMMO (fila en complejos + filas en
-- cabanas vía complejo_id resuelto por slug). 100% aditivo — no
-- toca Cabañas VIP ni MIMMO. Ubicación y contacto quedan en null
-- acá (ver 002_complejos_ubicacion.sql para ubicación).
--
-- STAGING ONLY por ahora. Producción recibe esta carga recién en
-- el corte de Fase 6, junto con el resto del proyecto multi-
-- complejo — no correr contra producción todavía.
-- ============================================================

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

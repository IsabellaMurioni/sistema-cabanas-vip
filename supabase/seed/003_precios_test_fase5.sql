-- ============================================================
-- 003_precios_test_fase5.sql
-- Datos de prueba TIRABLES para Fase 5: un período de precios
-- "comodín" por cada uno de los 3 complejos nuevos (Casas Azahar,
-- Los Amigos, Chacras del Mar), con precios planos y redondos,
-- sólo para poder crear reservas de punta a punta durante testing.
-- NO son precios reales — el encargado de cada complejo va a
-- cargar los precios reales a mano antes de salir a producción.
-- No toca Cabañas VIP ni MIMMO.
--
-- ⚠️  NO LLEVAR A PRODUCCIÓN EN EL CORTE DE FASE 6. Este seed es
-- exclusivo de staging/testing — hay que excluirlo explícitamente
-- de la lista de qué migrar al pasar a producción (junto con
-- cualquier reserva de prueba creada usando estos precios).
-- ============================================================

insert into periodos_precios (complejo_id, nombre, fecha_inicio, fecha_fin, minimo_noches, orden)
select id, 'Precio de prueba — reemplazar antes de producción', '2025-01-01', null, 1, 1
from complejos
where slug in ('casas-azahar', 'los-amigos', 'chacras-del-mar');

insert into precios_pax (periodo_id, pax, precio_noche, precio_semana)
select p.id, x.pax, 10000, 70000
from periodos_precios p
join complejos c on c.id = p.complejo_id
cross join (values (2),(3),(4),(5),(6),(7)) as x(pax)
where c.slug in ('casas-azahar', 'los-amigos', 'chacras-del-mar')
  and p.nombre = 'Precio de prueba — reemplazar antes de producción';

-- ============================================================
-- 013_cabanas_grupo.sql
-- Agrupamiento visual opcional dentro de un complejo.
-- Caso de uso: MIMMO son 12 cabañas que deben mostrarse divididas
-- en "MIMMO I" y "MIMMO II" en Disponibilidad, aunque sean el
-- mismo complejo/base de datos/caja. Columna nullable y genérica
-- (no específica de MIMMO): cualquier complejo puede usarla si
-- hace falta agrupar sus cabañas; si queda en NULL, se sigue
-- mostrando como lista plana (comportamiento actual, sin cambios
-- para Cabañas VIP ni el resto).
-- ============================================================

alter table cabanas add column if not exists grupo text;

update cabanas set grupo = 'MIMMO I'
where complejo_id = (select id from complejos where slug = 'mimmo')
  and nombre in (
    'Chalet 3 Ambientes',
    'Cabaña Confort I',
    'Cabaña Confort II',
    'Cabaña 2 Ambientes Planta Baja I',
    'Cabaña 2 Ambientes Planta Baja II',
    'Cabaña 2 Ambientes Planta Alta I',
    'Cabaña 2 Ambientes Planta Alta II',
    'Cabaña Clásica I',
    'Cabaña Clásica II'
  );

update cabanas set grupo = 'MIMMO II'
where complejo_id = (select id from complejos where slug = 'mimmo')
  and nombre in ('Cabaña Mimmo I', 'Cabaña Mimmo II', 'Cabaña Mimmo III');

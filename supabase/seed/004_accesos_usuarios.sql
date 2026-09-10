-- ============================================================
-- 004_accesos_usuarios.sql
-- Datos (no esquema): altas reales de membresías para 4 usuarios de
-- Supabase Auth que ya existen en staging (creados a mano, no acá).
-- Requiere 021_membresias_rol.sql corrido antes (columna `rol`).
--
-- 3 usuarios con acceso completo a los 5 complejos; 1 usuario
-- restringido a Cabañas VIP con rol='limitado_caja_silvia' (Reservas
-- + Disponibilidad + sólo la vista Caja Silvia, nada de
-- Ganancias/Precios/Caja Juli/Banco/Mercado Pago — bloqueado también
-- a nivel de RLS, no sólo en la UI).
--
-- STAGING ONLY por ahora, mismo criterio que el resto de los seeds de
-- esta carpeta.
-- ============================================================

-- Acceso completo (rol='completo') a los 5 complejos.
insert into membresias (user_id, complejo_id, rol)
select u.user_id, c.id, 'completo'
from (values
  ('6b532a5e-8786-490a-9741-d99b279c7f78'::uuid), -- carolina.derosa@hotmail.com
  ('904c2ba3-857f-49c9-99cf-ca9b5680a45b'::uuid), -- julieta.derosa@hotmail.com
  ('10570563-d986-4a73-90e3-414c2b8aff16'::uuid)  -- complejosmarazul@gmail.com
) as u(user_id)
cross join complejos c
on conflict do nothing;

-- Restringido: únicamente Cabañas VIP, rol='limitado_caja_silvia'.
insert into membresias (user_id, complejo_id, rol)
select '1640114e-7b4f-4db3-8296-21c50452156d'::uuid, id, 'limitado_caja_silvia'
from complejos where slug = 'cabanas-vip'
on conflict do nothing;

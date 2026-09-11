-- ============================================================
-- 025_precios_acceso_roles_limitados.sql
-- Acceso completo (ver + crear + editar + borrar) a Precios para los
-- dos roles restringidos existentes ('limitado_caja_silvia' y
-- 'limitado_reservas') — a diferencia de Ganancias (y, para
-- 'limitado_reservas', Caja), que siguen bloqueadas para ambos. Sin
-- cambios acá a Auth, contraseñas, ni a ninguna otra sección
-- (Caja/Ganancias/Reservas/Disponibilidad) ni a ninguna otra tabla.
--
-- El único cambio es la condición de rol: de `rol = 'completo'`
-- (021_membresias_rol.sql) a `rol in ('completo', 'limitado_caja_silvia',
-- 'limitado_reservas')` — el scoping por complejo_id vía membresias
-- queda exactamente igual (cada usuario sigue viendo/editando sólo los
-- complejos donde tiene membresía real: Silvia sólo cabanas-vip, Pam
-- los 5).
-- ============================================================

drop policy if exists "periodos_select" on periodos_precios;
drop policy if exists "periodos_all" on periodos_precios;

create policy "periodos_select" on periodos_precios for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol in ('completo', 'limitado_caja_silvia', 'limitado_reservas')));
create policy "periodos_all" on periodos_precios for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol in ('completo', 'limitado_caja_silvia', 'limitado_reservas')))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol in ('completo', 'limitado_caja_silvia', 'limitado_reservas')));

drop policy if exists "precios_pax_select" on precios_pax;
drop policy if exists "precios_pax_all" on precios_pax;

create policy "precios_pax_select" on precios_pax for select
  using (periodo_id in (
    select id from periodos_precios
    where complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol in ('completo', 'limitado_caja_silvia', 'limitado_reservas'))
  ));
create policy "precios_pax_all" on precios_pax for all
  using (periodo_id in (
    select id from periodos_precios
    where complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol in ('completo', 'limitado_caja_silvia', 'limitado_reservas'))
  ))
  with check (periodo_id in (
    select id from periodos_precios
    where complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol in ('completo', 'limitado_caja_silvia', 'limitado_reservas'))
  ));

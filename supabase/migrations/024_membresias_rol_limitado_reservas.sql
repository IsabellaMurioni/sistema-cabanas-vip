-- ============================================================
-- 024_membresias_rol_limitado_reservas.sql
-- Nuevo rol 'limitado_reservas' — cross-complejo (no atado a un
-- complejo puntual como 'limitado_caja_silvia'): Reservas +
-- Disponibilidad únicamente, en TODOS los complejos donde el usuario
-- tenga membresía. Nada de Caja (ni siquiera la vista Silvia — a
-- diferencia de 'limitado_caja_silvia'), nada de Ganancias, nada de
-- Precios.
--
-- Aditivo en el sentido de "no rompe nada existente": todo usuario
-- 'completo' sigue exactamente igual (sus políticas ya filtraban por
-- rol='completo' o no filtraban por rol y ahora empiezan a exigirlo,
-- pero 'completo' sigue cumpliendo esa condición); 'limitado_caja_silvia'
-- sigue viendo Caja Silvia igual que antes (ver el fix de caja_silvia
-- más abajo). El único comportamiento nuevo es el bloqueo para
-- 'limitado_reservas', un rol que hoy no tiene ninguna fila real en
-- `membresias` — cero usuarios afectados hasta que se le dé de alta a
-- alguien con este rol.
-- ============================================================

alter table membresias drop constraint if exists membresias_rol_check;
alter table membresias add constraint membresias_rol_check
  check (rol in ('completo', 'limitado_caja_silvia', 'limitado_reservas'));

-- ── caja_silvia — CORRECCIÓN: a diferencia de caja_juli/caja_banco/
--    caja_mercado_pago (que 021_membresias_rol.sql ya dejó exigiendo
--    rol='completo'), caja_silvia NUNCA tuvo condición de rol — quedó
--    afuera a propósito en esa migración porque 'limitado_caja_silvia'
--    necesita verla. Con el rol nuevo hace falta distinguir: sigue
--    accesible para 'completo' Y 'limitado_caja_silvia' (los dos roles
--    que hoy la ven), pero 'limitado_reservas' queda afuera — por eso
--    acá es `rol in (...)`, no `rol = 'completo'` como el resto.

drop policy if exists "silvia_sel" on caja_silvia;
drop policy if exists "silvia_ins" on caja_silvia;
drop policy if exists "silvia_upd" on caja_silvia;
drop policy if exists "silvia_del" on caja_silvia;

create policy "silvia_sel" on caja_silvia for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol in ('completo', 'limitado_caja_silvia')));
create policy "silvia_ins" on caja_silvia for insert
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol in ('completo', 'limitado_caja_silvia')));
create policy "silvia_upd" on caja_silvia for update
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol in ('completo', 'limitado_caja_silvia')));
create policy "silvia_del" on caja_silvia for delete
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol in ('completo', 'limitado_caja_silvia')));

-- ── movimientos_caja / cierres_caja / cierre_reconciliacion /
--    cierre_reparto_ganancia (NO-VIP) — hasta ahora sin ninguna
--    condición de rol, sólo complejo_id. 'limitado_caja_silvia' no
--    tiene membresías fuera de Cabañas VIP hoy, así que no se ve
--    afectado por este cambio; si alguna vez se le diera membresía en
--    un complejo NO-VIP, quedaría (correctamente, por diseño) sin
--    acceso a Caja ahí tampoco — es exactamente el mismo criterio que
--    ya se le aplica en Cabañas VIP.

drop policy if exists "movimientos_caja_select" on movimientos_caja;
drop policy if exists "movimientos_caja_all" on movimientos_caja;

create policy "movimientos_caja_select" on movimientos_caja for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));
create policy "movimientos_caja_all" on movimientos_caja for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));

drop policy if exists "cierres_caja_select" on cierres_caja;
drop policy if exists "cierres_caja_all" on cierres_caja;

create policy "cierres_caja_select" on cierres_caja for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));
create policy "cierres_caja_all" on cierres_caja for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));

drop policy if exists "cierre_reconciliacion_select" on cierre_reconciliacion;
drop policy if exists "cierre_reconciliacion_all" on cierre_reconciliacion;

create policy "cierre_reconciliacion_select" on cierre_reconciliacion for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));
create policy "cierre_reconciliacion_all" on cierre_reconciliacion for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));

drop policy if exists "cierre_reparto_ganancia_select" on cierre_reparto_ganancia;
drop policy if exists "cierre_reparto_ganancia_all" on cierre_reparto_ganancia;

create policy "cierre_reparto_ganancia_select" on cierre_reparto_ganancia for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));
create policy "cierre_reparto_ganancia_all" on cierre_reparto_ganancia for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));

-- ── periodos_precios / precios_pax — ya exigían rol='completo' desde
--    021_membresias_rol.sql (verificado, no una suposición): 'limitado_
--    reservas' queda excluido automáticamente, sin ningún cambio acá.

-- ── reservas — sin cambios: cualquier rol con membresía en el
--    complejo mantiene acceso, tal como pide la consigna.

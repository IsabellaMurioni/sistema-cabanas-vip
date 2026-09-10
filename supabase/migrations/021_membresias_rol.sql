-- ============================================================
-- 021_membresias_rol.sql
-- Fase 6 — roles restringidos dentro de un complejo. Hoy sólo existe
-- 'limitado_caja_silvia' (pensado para Cabañas VIP): Reservas y
-- Disponibilidad sin cambios, sólo la vista "Caja Silvia" dentro de
-- Caja (nada de Juli/Banco/Mercado Pago), y nada de Ganancias ni
-- Precios — bloqueado a nivel de RLS, no sólo escondido en la UI
-- (mismo criterio de defensa en profundidad que ya usa el resto del
-- proyecto: RLS + filtrado explícito por complejo_id en todos lados).
--
-- 100% aditivo: la columna nueva default a 'completo' para TODA
-- membresía existente, así que ningún usuario actual cambia de
-- comportamiento con sólo correr esto — recién cambia algo cuando
-- una fila puntual de `membresias` se actualice a mano a
-- 'limitado_caja_silvia' (ver seed 004 para las altas reales, y el
-- reporte de esta tarea para el UPDATE puntual sobre el usuario de
-- test).
-- ============================================================

alter table membresias add column if not exists rol text not null default 'completo'
  check (rol in ('completo', 'limitado_caja_silvia'));

-- ── caja_juli / caja_banco / caja_mercado_pago / periodos_precios /
--    precios_pax: a partir de acá, sólo rol='completo' tiene acceso.
--    Mismo patrón que cada tabla ya usaba (012_rls_membresias.sql) —
--    la única diferencia es agregar "and rol = 'completo'" a la
--    subquery de membresias. reservas, caja_silvia, complejos,
--    cabanas, storage.objects, movimientos_caja, cierres_caja,
--    cierre_reconciliacion y cierre_reparto_ganancia quedan
--    intactas — ninguna de sus políticas hace referencia a `rol`.

drop policy if exists "juli_sel" on caja_juli;
drop policy if exists "juli_ins" on caja_juli;
drop policy if exists "juli_upd" on caja_juli;
drop policy if exists "juli_del" on caja_juli;

create policy "juli_sel" on caja_juli for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));
create policy "juli_ins" on caja_juli for insert
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));
create policy "juli_upd" on caja_juli for update
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));
create policy "juli_del" on caja_juli for delete
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));

drop policy if exists "banco_sel" on caja_banco;
drop policy if exists "banco_ins" on caja_banco;
drop policy if exists "banco_upd" on caja_banco;
drop policy if exists "banco_del" on caja_banco;

create policy "banco_sel" on caja_banco for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));
create policy "banco_ins" on caja_banco for insert
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));
create policy "banco_upd" on caja_banco for update
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));
create policy "banco_del" on caja_banco for delete
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));

drop policy if exists "mp_sel" on caja_mercado_pago;
drop policy if exists "mp_ins" on caja_mercado_pago;
drop policy if exists "mp_upd" on caja_mercado_pago;
drop policy if exists "mp_del" on caja_mercado_pago;

create policy "mp_sel" on caja_mercado_pago for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));
create policy "mp_ins" on caja_mercado_pago for insert
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));
create policy "mp_upd" on caja_mercado_pago for update
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));
create policy "mp_del" on caja_mercado_pago for delete
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));

drop policy if exists "periodos_select" on periodos_precios;
drop policy if exists "periodos_all" on periodos_precios;

create policy "periodos_select" on periodos_precios for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));
create policy "periodos_all" on periodos_precios for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo'));

drop policy if exists "precios_pax_select" on precios_pax;
drop policy if exists "precios_pax_all" on precios_pax;

create policy "precios_pax_select" on precios_pax for select
  using (periodo_id in (
    select id from periodos_precios
    where complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo')
  ));
create policy "precios_pax_all" on precios_pax for all
  using (periodo_id in (
    select id from periodos_precios
    where complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo')
  ))
  with check (periodo_id in (
    select id from periodos_precios
    where complejo_id in (select complejo_id from membresias where user_id = auth.uid() and rol = 'completo')
  ));

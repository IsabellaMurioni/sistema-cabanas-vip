-- ============================================================
-- 012_rls_membresias.sql
-- Fase 1.3 — políticas de seguridad reales, basadas en membresias.
-- ============================================================

drop policy if exists "res_select" on reservas;
drop policy if exists "res_insert" on reservas;
drop policy if exists "res_update" on reservas;
drop policy if exists "res_delete" on reservas;

create policy "res_select" on reservas for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "res_insert" on reservas for insert
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "res_update" on reservas for update
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "res_delete" on reservas for delete
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));

drop policy if exists "silvia_sel" on caja_silvia;
drop policy if exists "silvia_ins" on caja_silvia;
drop policy if exists "silvia_upd" on caja_silvia;
drop policy if exists "silvia_del" on caja_silvia;

create policy "silvia_sel" on caja_silvia for select using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "silvia_ins" on caja_silvia for insert with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "silvia_upd" on caja_silvia for update using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "silvia_del" on caja_silvia for delete using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));

drop policy if exists "juli_sel" on caja_juli;
drop policy if exists "juli_ins" on caja_juli;
drop policy if exists "juli_upd" on caja_juli;
drop policy if exists "juli_del" on caja_juli;

create policy "juli_sel" on caja_juli for select using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "juli_ins" on caja_juli for insert with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "juli_upd" on caja_juli for update using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "juli_del" on caja_juli for delete using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));

drop policy if exists "banco_sel" on caja_banco;
drop policy if exists "banco_ins" on caja_banco;
drop policy if exists "banco_upd" on caja_banco;
drop policy if exists "banco_del" on caja_banco;

create policy "banco_sel" on caja_banco for select using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "banco_ins" on caja_banco for insert with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "banco_upd" on caja_banco for update using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "banco_del" on caja_banco for delete using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));

drop policy if exists "mp_sel" on caja_mercado_pago;
drop policy if exists "mp_ins" on caja_mercado_pago;
drop policy if exists "mp_upd" on caja_mercado_pago;
drop policy if exists "mp_del" on caja_mercado_pago;

create policy "mp_sel" on caja_mercado_pago for select using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "mp_ins" on caja_mercado_pago for insert with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "mp_upd" on caja_mercado_pago for update using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "mp_del" on caja_mercado_pago for delete using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));

drop policy if exists "periodos_select" on periodos_precios;
drop policy if exists "periodos_all" on periodos_precios;

create policy "periodos_select" on periodos_precios for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "periodos_all" on periodos_precios for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));

drop policy if exists "precios_pax_select" on precios_pax;
drop policy if exists "precios_pax_all" on precios_pax;

create policy "precios_pax_select" on precios_pax for select
  using (periodo_id in (
    select id from periodos_precios
    where complejo_id in (select complejo_id from membresias where user_id = auth.uid())
  ));
create policy "precios_pax_all" on precios_pax for all
  using (periodo_id in (
    select id from periodos_precios
    where complejo_id in (select complejo_id from membresias where user_id = auth.uid())
  ))
  with check (periodo_id in (
    select id from periodos_precios
    where complejo_id in (select complejo_id from membresias where user_id = auth.uid())
  ));

drop policy if exists "email_logs_select" on email_logs;

create policy "email_logs_select" on email_logs for select
  using (reserva_id in (
    select id from reservas
    where complejo_id in (select complejo_id from membresias where user_id = auth.uid())
  ));

create policy "cabanas_select" on cabanas for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));

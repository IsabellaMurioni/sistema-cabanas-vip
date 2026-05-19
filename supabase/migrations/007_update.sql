-- ============================================================
-- ACTUALIZACIÓN: Caja Banco + Caja Mercado Pago
-- Ejecutar en Supabase SQL Editor (no borra datos existentes)
-- ============================================================

-- Caja Banco
drop table if exists caja_banco cascade;

create table caja_banco (
  id             uuid default gen_random_uuid() primary key,
  fecha          date not null,
  detalle        text,
  reserva_codigo text,
  reserva_nombre text,
  ingreso        numeric not null default 0,
  egreso         numeric not null default 0,
  comprobante    text,
  created_at     timestamptz default now()
);

alter table caja_banco enable row level security;
create policy "banco_sel" on caja_banco for select using (auth.role() = 'authenticated');
create policy "banco_ins" on caja_banco for insert with check (auth.role() = 'authenticated');
create policy "banco_upd" on caja_banco for update using (auth.role() = 'authenticated');
create policy "banco_del" on caja_banco for delete using (auth.role() = 'authenticated');

-- Caja Mercado Pago
drop table if exists caja_mercado_pago cascade;

create table caja_mercado_pago (
  id             uuid default gen_random_uuid() primary key,
  fecha          date not null,
  detalle        text,
  reserva_codigo text,
  reserva_nombre text,
  ingreso        numeric not null default 0,
  egreso         numeric not null default 0,
  comprobante    text,
  created_at     timestamptz default now()
);

alter table caja_mercado_pago enable row level security;
create policy "mp_sel" on caja_mercado_pago for select using (auth.role() = 'authenticated');
create policy "mp_ins" on caja_mercado_pago for insert with check (auth.role() = 'authenticated');
create policy "mp_upd" on caja_mercado_pago for update using (auth.role() = 'authenticated');
create policy "mp_del" on caja_mercado_pago for delete using (auth.role() = 'authenticated');

-- Email del cliente en reservas
alter table reservas add column if not exists email text;

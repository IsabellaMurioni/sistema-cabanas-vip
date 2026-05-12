-- ============================================================
-- SCHEMA COMPLETO - Cabañas VIP
-- Ejecutar completo en Supabase SQL Editor
-- ============================================================

-- 1. Tabla reservas (drop y recrear con schema completo)
drop table if exists reservas cascade;

create table reservas (
  id               uuid default gen_random_uuid() primary key,
  codigo           text unique not null,
  nombre_apellido  text not null,
  cuit_dni         text,
  direccion        text,
  celular          text,
  cabana           text not null,
  pax              integer default 1,
  fecha_entrada    date not null,
  fecha_salida     date not null,
  noches           integer,
  mes              text,
  monto_total      numeric default 0,
  -- 1ª seña
  sena1_monto      numeric,
  sena1_tipo       text,
  sena1_fecha      date,
  sena1_recibo     text,
  sena1_comprobante text,
  -- 2ª seña
  sena2_monto      numeric,
  sena2_tipo       text,
  sena2_fecha      date,
  sena2_recibo     text,
  sena2_comprobante text,
  -- Pago en cabaña
  pago_cabana_monto  numeric,
  pago_cabana_fecha  date,
  pago_cabana_recibo text,
  pago_cabana_comprobante text,
  -- Estado y notas
  estado           text default 'Pendiente',
  observaciones    text,
  created_at       timestamptz default now()
);

-- 2a. Tabla Caja Silvia
drop table if exists caja cascade;
drop table if exists caja_silvia cascade;

create table caja_silvia (
  id               uuid default gen_random_uuid() primary key,
  fecha            date not null,
  cuenta           text,
  detalle          text,
  recibo           text,
  ingreso_pesos    numeric not null default 0,
  ingreso_dolares  numeric not null default 0,
  ingreso_juli     numeric not null default 0,
  gasto            numeric not null default 0,
  retiro_pesos     numeric not null default 0,
  retiro_dolares   numeric not null default 0,
  comprobante      text,
  created_at       timestamptz default now()
);

alter table caja_silvia enable row level security;
create policy "silvia_sel" on caja_silvia for select using (auth.role() = 'authenticated');
create policy "silvia_ins" on caja_silvia for insert with check (auth.role() = 'authenticated');
create policy "silvia_upd" on caja_silvia for update using (auth.role() = 'authenticated');
create policy "silvia_del" on caja_silvia for delete using (auth.role() = 'authenticated');

-- 2b. Tabla Caja Juli
drop table if exists caja_juli cascade;

create table caja_juli (
  id                   uuid default gen_random_uuid() primary key,
  seccion              text not null default 'main',   -- 'main' | 'gastos'
  tipo_main            text,                            -- 'ingreso' | 'egreso' (solo seccion=main)
  fecha                date not null,
  detalle              text,
  recibo               text,
  importe              numeric not null default 0,
  transferencia_silvia numeric not null default 0,
  devolucion           numeric not null default 0,
  modalidad_pago       text,                            -- 'Efectivo' | 'Mercado Pago'
  devuelto             boolean not null default false,
  comprobante          text,
  created_at           timestamptz default now()
);

alter table caja_juli enable row level security;
create policy "juli_sel" on caja_juli for select using (auth.role() = 'authenticated');
create policy "juli_ins" on caja_juli for insert with check (auth.role() = 'authenticated');
create policy "juli_upd" on caja_juli for update using (auth.role() = 'authenticated');
create policy "juli_del" on caja_juli for delete using (auth.role() = 'authenticated');

-- 3. RLS reservas
alter table reservas enable row level security;

create policy "res_select" on reservas for select using (auth.role() = 'authenticated');
create policy "res_insert" on reservas for insert with check (auth.role() = 'authenticated');
create policy "res_update" on reservas for update using (auth.role() = 'authenticated');
create policy "res_delete" on reservas for delete using (auth.role() = 'authenticated');

-- 4. (tabla caja eliminada, reemplazada por caja_silvia y caja_juli)

-- 5. Storage bucket para comprobantes
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', true)
on conflict (id) do nothing;

-- 6. Políticas de storage
drop policy if exists "comprobantes_upload" on storage.objects;
drop policy if exists "comprobantes_read"   on storage.objects;
drop policy if exists "comprobantes_update" on storage.objects;

create policy "comprobantes_read" on storage.objects
  for select using (bucket_id = 'comprobantes');

create policy "comprobantes_upload" on storage.objects
  for insert with check (bucket_id = 'comprobantes' and auth.role() = 'authenticated');

create policy "comprobantes_update" on storage.objects
  for update using (bucket_id = 'comprobantes' and auth.role() = 'authenticated');

-- 7. Caja Banco
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

-- 8. Caja Mercado Pago
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

-- ============================================================
-- 017_caja_sin_temporada.sql
-- Simplifica la Caja de los complejos NO-VIP: reemplaza el modelo
-- de "temporada" (objeto ancla con fecha_inicio/fecha_fin, que
-- había que auto-crear/editar) por un libro contable continuo,
-- igual de forma que la Caja de Cabañas VIP. Un cierre ahora es
-- un rango de fechas libre (fecha_desde/fecha_hasta) en vez de
-- algo atado a una temporada activa. 100% ajeno a Cabañas VIP —
-- caja_silvia/caja_juli/caja_banco/caja_mercado_pago no se tocan.
-- ============================================================

-- 1. Tablas de cierre viejas, ancladas a temporada — se recrean
--    más abajo ancladas a un rango de fechas en su lugar. Se
--    borran en orden de dependencia (hijas primero), con cascade
--    como red de seguridad adicional.
drop table if exists cierre_reconciliacion cascade;
drop table if exists cierre_reparto_ganancia cascade;
drop table if exists cierres_temporada cascade;

-- 2. movimientos_caja deja de depender de una temporada. Postgres
--    borra automáticamente la FK asociada a la columna al hacer
--    drop column, no hace falta un "drop constraint" aparte.
alter table movimientos_caja drop column if exists temporada_id;

-- 3. La tabla temporadas ya no se usa (recién ahora se puede
--    borrar sin problemas de dependencia, tras el paso 2).
drop table if exists temporadas cascade;

-- 4. Nuevas tablas de cierre, ancladas a un rango de fechas libre
--    en vez de a una temporada.
create table cierres_caja (
  id                 uuid default gen_random_uuid() primary key,
  complejo_id        uuid not null references complejos(id) on delete cascade,
  fecha_desde        date not null,
  fecha_hasta        date not null,
  fecha_cierre       date not null default current_date,
  inicio_manual      numeric not null default 0,
  ganancia_total     numeric,
  tipo_cambio_dolar  numeric,
  monto_final        numeric,
  observaciones      text,
  created_at         timestamptz default now()
);

alter table cierres_caja enable row level security;
create policy "cierres_caja_select" on cierres_caja for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "cierres_caja_all" on cierres_caja for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));

create table cierre_reconciliacion (
  id            uuid default gen_random_uuid() primary key,
  complejo_id   uuid not null references complejos(id) on delete cascade,
  cierre_id     uuid not null references cierres_caja(id) on delete cascade,
  concepto      text not null,
  monto         numeric not null default 0,
  created_at    timestamptz default now()
);

alter table cierre_reconciliacion enable row level security;
create policy "cierre_reconciliacion_select" on cierre_reconciliacion for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "cierre_reconciliacion_all" on cierre_reconciliacion for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));

create table cierre_reparto_ganancia (
  id              uuid default gen_random_uuid() primary key,
  complejo_id     uuid not null references complejos(id) on delete cascade,
  cierre_id       uuid not null references cierres_caja(id) on delete cascade,
  persona         text not null,
  monto           numeric not null default 0,
  monto_dolares   numeric,
  created_at      timestamptz default now()
);

alter table cierre_reparto_ganancia enable row level security;
create policy "cierre_reparto_ganancia_select" on cierre_reparto_ganancia for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "cierre_reparto_ganancia_all" on cierre_reparto_ganancia for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));

create index idx_cierres_caja_complejo        on cierres_caja(complejo_id);
create index idx_cierre_reconciliacion_cierre on cierre_reconciliacion(cierre_id);
create index idx_cierre_reparto_cierre        on cierre_reparto_ganancia(cierre_id);

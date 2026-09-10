-- ============================================================
-- 015_caja_temporada.sql
-- Fase 3 — nuevas tablas para la Caja "temporada" de los complejos
-- distintos de Cabañas VIP (basado en el análisis del Excel de
-- temporada). 100% aditivo: no modifica ninguna tabla existente,
-- y la Caja de Cabañas VIP (caja_silvia/caja_juli/caja_banco/
-- caja_mercado_pago) sigue exactamente igual, sin tocarse.
-- ============================================================

create table temporadas (
  id            uuid default gen_random_uuid() primary key,
  complejo_id   uuid not null references complejos(id) on delete cascade,
  nombre        text not null,
  fecha_inicio  date not null,
  fecha_fin     date,
  caja_inicial  numeric not null default 0,
  created_at    timestamptz default now()
);

alter table temporadas enable row level security;
create policy "temporadas_select" on temporadas for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "temporadas_all" on temporadas for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));

create table movimientos_caja (
  id                uuid default gen_random_uuid() primary key,
  complejo_id       uuid not null references complejos(id) on delete cascade,
  temporada_id      uuid not null references temporadas(id) on delete cascade,
  fecha             date not null,
  tipo              text not null check (tipo in ('ingreso','egreso','prestamo','devolucion')),
  categoria         text check (
                      categoria is null or categoria in (
                        'alquiler',
                        'arreglos_ferreteria','impuestos_servicios','empleados','limpieza_perfumeria',
                        'lavadero','publicidad','desayunos','blanco','bazar','variables','libreria'
                      )
                    ),
  detalle           text,
  monto_depositos   numeric not null default 0,
  monto_efectivo    numeric not null default 0,
  created_at        timestamptz default now()
);

alter table movimientos_caja enable row level security;
create policy "movimientos_caja_select" on movimientos_caja for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "movimientos_caja_all" on movimientos_caja for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));

create index idx_movimientos_caja_temporada on movimientos_caja(temporada_id);
create index idx_movimientos_caja_complejo  on movimientos_caja(complejo_id);

-- ===== Cierre de temporada =====
-- Cada una de estas 3 tablas lleva complejo_id directo (además de
-- colgar de cierre_id/temporada_id) para que el filtro de RLS y de
-- la app sean directos, en vez de depender de un JOIN — el mismo
-- tipo de bug de "filtro indirecto" que apareció en la Fase 2 con
-- otras tablas, evitado acá desde el diseño.

create table cierres_temporada (
  id                       uuid default gen_random_uuid() primary key,
  complejo_id              uuid not null references complejos(id) on delete cascade,
  temporada_id             uuid not null references temporadas(id) on delete cascade,
  fecha_cierre             date not null default current_date,
  ganancia_total           numeric not null default 0,
  tipo_cambio_dolar        numeric,
  caja_proxima_temporada   numeric not null default 0,
  observaciones            text,
  created_at               timestamptz default now()
);

alter table cierres_temporada enable row level security;
create policy "cierres_temporada_select" on cierres_temporada for select
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));
create policy "cierres_temporada_all" on cierres_temporada for all
  using (complejo_id in (select complejo_id from membresias where user_id = auth.uid()))
  with check (complejo_id in (select complejo_id from membresias where user_id = auth.uid()));

create table cierre_reconciliacion (
  id            uuid default gen_random_uuid() primary key,
  complejo_id   uuid not null references complejos(id) on delete cascade,
  cierre_id     uuid not null references cierres_temporada(id) on delete cascade,
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
  cierre_id       uuid not null references cierres_temporada(id) on delete cascade,
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

create index idx_cierre_reconciliacion_cierre on cierre_reconciliacion(cierre_id);
create index idx_cierre_reparto_cierre on cierre_reparto_ganancia(cierre_id);

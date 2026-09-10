-- ============================================================
-- FASE 6 — CONSOLIDATED PRODUCTION MIGRATION (010 -> 024)
-- Generado concatenando, en orden exacto, los archivos reales
-- de supabase/migrations/ 010 a 024 tal como se aplicaron a
-- staging (024 verificado ahí mismo: rol='limitado_reservas'
-- bloqueado en las 5 tablas de Caja, caja_silvia incluida — ver
-- tests/integration/rol-limitado.test.js, 21/21 en verde).
-- NINGUNO de estos DROPea/TRUNCATEa ni una sola fila real de
-- reservas/caja_silvia/caja_juli/caja_banco/caja_mercado_pago de
-- Cabañas VIP en producción — el wipe de esos datos es un paso
-- aparte y explícito (003_wipe_vip.sql), nunca implícito acá.
-- Lo que SÍ hacen 021 y 024 es reescribir las políticas RLS de
-- esas mismas tablas (agregar el filtro por `rol`) — intencional,
-- parte de la feature, no un efecto secundario no buscado.
-- ============================================================


-- ============================================================
-- 010_multi_complejo_base.sql
-- ============================================================
-- ============================================================
-- 010_multi_complejo_base.sql
-- Fase 1.1 — Tablas nuevas para soportar múltiples complejos.
-- 100% aditivo: no modifica ninguna tabla existente.
-- ============================================================

create table complejos (
  id               uuid default gen_random_uuid() primary key,
  nombre           text not null,
  slug             text not null unique,
  ubicacion        text,
  color_primario   text,
  color_secundario text,
  whatsapp         text,
  email_contacto   text,
  web              text,
  created_at       timestamptz default now()
);

alter table complejos enable row level security;

create policy "complejos_select" on complejos
  for select to authenticated using (true);

create table cabanas (
  id          uuid default gen_random_uuid() primary key,
  complejo_id uuid not null references complejos(id) on delete cascade,
  nombre      text not null,
  color       text,
  pax_min     integer,
  pax_max     integer,
  orden       integer not null default 0,
  created_at  timestamptz default now()
);

alter table cabanas enable row level security;

create table membresias (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  complejo_id uuid not null references complejos(id) on delete cascade,
  created_at  timestamptz default now(),
  unique (user_id, complejo_id)
);

alter table membresias enable row level security;

create policy "membresias_select_propia" on membresias
  for select to authenticated using (user_id = auth.uid());

insert into complejos (nombre, slug, ubicacion, color_primario, whatsapp, email_contacto, web)
values (
  'Cabañas VIP',
  'cabanas-vip',
  'Santa Clara del Mar',
  '#d2ab84',
  '011-5099-5700',
  'ventashotelesdelacosta@hotmail.com',
  'www.complejocabanasvip.com'
);

insert into cabanas (complejo_id, nombre, color, orden)
select (select id from complejos where slug = 'cabanas-vip'), nombre, color, orden
from (values
  ('Bahama',    '#1e3a5f', 1),
  ('Bahia',     '#065f46', 2),
  ('Maui',      '#0ea5e9', 3),
  ('Itaparica', '#4d7c0f', 4),
  ('Acapulco',  '#ea580c', 5),
  ('Cozumel',   '#db2777', 6),
  ('Ibiza',     '#7c3aed', 7),
  ('Ipanema',   '#d97706', 8),
  ('Maceio',    '#dc2626', 9),
  ('Hawai',     '#0d9488', 10),
  ('Vallarta',  '#9333ea', 11),
  ('Aruba',     '#16a34a', 12),
  ('Cancún',    '#2563eb', 13),
  ('Buzios',    '#e11d48', 14),
  ('Jamaica',   '#92400e', 15)
) as t(nombre, color, orden);

insert into membresias (user_id, complejo_id)
select u.id, (select id from complejos where slug = 'cabanas-vip')
from auth.users u
where u.email = 'isamurioni07@gmail.com'
on conflict do nothing;

-- ============================================================
-- 011_complejo_id_columnas.sql
-- ============================================================
-- ============================================================
-- 011_complejo_id_columnas.sql
-- Fase 1.2 — agrega complejo_id a las tablas existentes.
-- Patrón seguro: agregar columna (nullable) -> completar datos
-- existentes -> recién ahí volverla obligatoria (not null).
-- ============================================================

alter table reservas           add column if not exists complejo_id uuid references complejos(id);
alter table caja_silvia        add column if not exists complejo_id uuid references complejos(id);
alter table caja_juli          add column if not exists complejo_id uuid references complejos(id);
alter table caja_banco         add column if not exists complejo_id uuid references complejos(id);
alter table caja_mercado_pago  add column if not exists complejo_id uuid references complejos(id);
alter table periodos_precios   add column if not exists complejo_id uuid references complejos(id);

update reservas          set complejo_id = (select id from complejos where slug = 'cabanas-vip') where complejo_id is null;
update caja_silvia       set complejo_id = (select id from complejos where slug = 'cabanas-vip') where complejo_id is null;
update caja_juli         set complejo_id = (select id from complejos where slug = 'cabanas-vip') where complejo_id is null;
update caja_banco        set complejo_id = (select id from complejos where slug = 'cabanas-vip') where complejo_id is null;
update caja_mercado_pago set complejo_id = (select id from complejos where slug = 'cabanas-vip') where complejo_id is null;
update periodos_precios  set complejo_id = (select id from complejos where slug = 'cabanas-vip') where complejo_id is null;

alter table reservas           alter column complejo_id set not null;
alter table caja_silvia        alter column complejo_id set not null;
alter table caja_juli          alter column complejo_id set not null;
alter table caja_banco         alter column complejo_id set not null;
alter table caja_mercado_pago  alter column complejo_id set not null;
alter table periodos_precios   alter column complejo_id set not null;

create index if not exists idx_reservas_complejo           on reservas(complejo_id);
create index if not exists idx_caja_silvia_complejo        on caja_silvia(complejo_id);
create index if not exists idx_caja_juli_complejo          on caja_juli(complejo_id);
create index if not exists idx_caja_banco_complejo         on caja_banco(complejo_id);
create index if not exists idx_caja_mercado_pago_complejo  on caja_mercado_pago(complejo_id);
create index if not exists idx_periodos_precios_complejo   on periodos_precios(complejo_id);

-- ============================================================
-- 012_rls_membresias.sql
-- ============================================================
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

-- ============================================================
-- 013_cabanas_grupo.sql
-- ============================================================
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

-- ============================================================
-- 014_codigo_unico_por_complejo.sql
-- ============================================================
-- ============================================================
-- 014_codigo_unico_por_complejo.sql
-- El código de reserva (A0001, A0002...) pasa de ser único en TODA
-- la tabla a ser único DENTRO de cada complejo, ya que cada complejo
-- ahora tiene su propia numeración independiente (decisión confirmada
-- por el usuario). Sin esto, dos complejos no pueden tener ambos una
-- reserva "A0001" al mismo tiempo, aunque sean totalmente distintas.
-- ============================================================

alter table reservas drop constraint if exists reservas_codigo_key;
alter table reservas add constraint reservas_codigo_complejo_key unique (complejo_id, codigo);

-- ============================================================
-- 015_caja_temporada.sql
-- ============================================================
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

-- ============================================================
-- 016_movimientos_caja_reserva.sql
-- ============================================================
-- ============================================================
-- 016_movimientos_caja_reserva.sql
-- Vincula (opcionalmente) un movimiento de caja "temporada" con una
-- reserva, y distingue su origen: cargado a mano ('manual') vs.
-- generado automáticamente por la sincronización seña/pago que se
-- construye en un paso posterior ('sena' / 'pago'). 100% aditivo.
-- ============================================================

alter table movimientos_caja
  add column if not exists reserva_id uuid references reservas(id) on delete cascade,
  add column if not exists origen text not null default 'manual' check (origen in ('sena','pago','manual'));

create index if not exists idx_movimientos_caja_reserva_id on movimientos_caja(reserva_id);

-- ============================================================
-- 017_caja_sin_temporada.sql
-- ============================================================
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

-- ============================================================
-- 018_cierres_caja_nombre.sql
-- ============================================================
-- ============================================================
-- 018_cierres_caja_nombre.sql
-- Etiqueta opcional y puramente descriptiva para un cierre de caja
-- (ej. "Temporada 2026-27"), para que "Cierres recientes" y los
-- mensajes de bloqueo de período cerrado puedan mostrar un nombre
-- legible en vez de sólo el rango de fechas. 100% ajeno a Cabañas
-- VIP. Sin restricciones ni relaciones — texto libre, nullable.
-- ============================================================

alter table cierres_caja add column if not exists nombre text;

-- ============================================================
-- 019_movimientos_caja_monto_otros.sql
-- ============================================================
-- ============================================================
-- 019_movimientos_caja_monto_otros.sql
-- Migración correctiva: `movimientos_caja.monto_otros` ya existe en
-- staging (se usa en el código desde hace varias fases — ReservaForm,
-- ReservaPago, CajaTemporada — junto a monto_depositos/monto_efectivo)
-- pero ninguna migración de este repo la creaba, así que el historial
-- de migraciones no reflejaba el esquema real. Esta migración es
-- puramente correctiva/idempotente para que el historial coincida con
-- la realidad — no toca ninguna otra columna ni tabla.
--
-- Forma verificada contra staging (no asumida): insertar
-- monto_otros: null viola una constraint not-null (código 23502);
-- omitir la columna la deja en 0 por default — mismo tipo/forma que
-- monto_depositos/monto_efectivo (numeric not null default 0).
-- ============================================================

alter table movimientos_caja
  add column if not exists monto_otros numeric not null default 0;

-- ============================================================
-- 020_movimientos_caja_check_montos.sql
-- ============================================================
-- ============================================================
-- 020_movimientos_caja_check_montos.sql
-- Hardening: hasta ahora, "monto no negativo" era 100% responsabilidad
-- de validarMontoMovimiento en el cliente — no había ningún backstop a
-- nivel de base (confirmado en Fase 5.3, tests/integration/
-- validations.test.js). Este migration agrega esa protección mínima
-- directamente en movimientos_caja: monto_depositos/monto_efectivo/
-- monto_otros nunca pueden ser negativos, sin importar qué código
-- intente escribir la fila.
--
-- Verificado contra staging ANTES de escribir esto (no asumido): 0
-- filas existentes con monto_depositos < 0, monto_efectivo < 0 o
-- monto_otros < 0 — así que agregar el CHECK no debería fallar por
-- datos preexistentes.
--
-- Nota: esto NO reemplaza validarMontoMovimiento (que exige que la
-- SUMA de los 3 campos sea > $0, una regla de negocio que un CHECK de
-- columna no puede expresar por sí solo) — es un backstop
-- complementario contra valores negativos puntuales, no contra el
-- caso "los 3 en $0".
-- ============================================================

alter table movimientos_caja
  add constraint chk_movimientos_caja_monto_depositos_nonneg check (monto_depositos >= 0);

alter table movimientos_caja
  add constraint chk_movimientos_caja_monto_efectivo_nonneg check (monto_efectivo >= 0);

alter table movimientos_caja
  add constraint chk_movimientos_caja_monto_otros_nonneg check (monto_otros >= 0);

-- ============================================================
-- 021_membresias_rol.sql
-- ============================================================
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

-- ============================================================
-- 022_movimientos_caja_tipo_retiro.sql
-- ============================================================
-- ============================================================
-- 022_movimientos_caja_tipo_retiro.sql
-- Prioridad 1+2 — agrega 'retiro' a los tipos válidos de
-- movimientos_caja (hasta ahora: 'ingreso','egreso','prestamo',
-- 'devolucion'). Un retiro es plata YA ganada que se saca de la caja
-- (para complejos NO-VIP; el equivalente de Cabañas VIP es
-- caja_silvia.retiro_pesos/retiro_dolares, sin cambios) — no es un
-- gasto real ni afecta Ganancia Neta (ver Ganancias.jsx/
-- CajaTemporada.jsx, resumenMovimientos).
--
-- Additive y seguro: sólo AMPLÍA el conjunto de valores permitidos —
-- ninguna fila existente deja de cumplir el check (todas sus filas ya
-- tienen tipo en el conjunto viejo, que sigue incluido en el nuevo).
--
-- El nombre `movimientos_caja_tipo_check` es el que Postgres genera
-- automáticamente para un CHECK de columna inline sin nombre explícito
-- (`tipo text not null check (...)`, ver 015_caja_temporada.sql) — si
-- al correr esto Postgres devuelve "constraint ... does not exist" en
-- el DROP, correr primero
--   select conname from pg_constraint where conrelid = 'movimientos_caja'::regclass and contype = 'c';
-- para confirmar el nombre real y ajustarlo acá.
-- ============================================================

alter table movimientos_caja drop constraint if exists movimientos_caja_tipo_check;

alter table movimientos_caja add constraint movimientos_caja_tipo_check
  check (tipo in ('ingreso', 'egreso', 'prestamo', 'devolucion', 'retiro'));

-- ============================================================
-- 023_precios_pax_noche_adicional.sql
-- ============================================================
-- ============================================================
-- 023_precios_pax_noche_adicional.sql
-- Prioridad 3 — tarifa por tramos (3 columnas) para los 5 complejos,
-- Cabañas VIP incluida, sin ningún caso especial por complejo.
--
-- Columna nueva, nullable, sin default explícito (nullable ya default
-- a null) — 100% aditivo. Ninguna fila existente de precios_pax, en
-- ningún complejo (Cabañas VIP incluida), cambia de valor: todas
-- quedan con precio_noche_adicional = null hasta que alguien la cargue
-- a mano desde la pantalla de Precios. resolverPrecioReserva.jsx trata
-- null/ausente como "no configurado todavía" y cae a la fórmula
-- vieja tal cual estaba — ver el reporte de esta tarea para el detalle
-- — así que ningún precio calculado de ninguna reserva NUEVA cambia
-- tampoco, hasta que un período puntual se configure explícitamente.
-- ============================================================

alter table precios_pax add column if not exists precio_noche_adicional numeric;


-- ============================================================
-- 024_membresias_rol_limitado_reservas.sql
-- ============================================================
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

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

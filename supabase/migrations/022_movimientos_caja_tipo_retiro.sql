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

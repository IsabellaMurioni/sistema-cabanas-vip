-- ============================================================
-- 027_descuento_monto_fijo.sql
-- El descuento de una reserva pasa de ser un PORCENTAJE a un MONTO FIJO
-- en pesos, elegido por quien carga la reserva (requerimiento real del
-- negocio, confirmado 2026-09-28 — no un capricho de implementación).
--
-- Aditivo únicamente: agrega la columna nueva `descuento_monto` y su
-- CHECK, sin tocar ni borrar `descuento_porcentaje` / `descuento_motivo`
-- (006_descuento.sql). Esas dos columnas quedan como código muerto a
-- propósito — confirmado en vivo contra staging antes de escribir esto:
-- CERO reservas tienen `descuento_porcentaje` no nulo (la app nunca
-- llegó a escribirlas), así que no hay ningún dato histórico que
-- preservar ni migrar. Borrarlas sería un cambio de schema con su
-- propio riesgo, innecesario para lo que pide esta tarea — queda fuera
-- de alcance a propósito.
--
-- `descuento_monto` no tiene DEFAULT distinto de null ni es NOT NULL:
-- la mayoría de las reservas no llevan descuento, así que null sigue
-- significando "sin descuento aplicado" (mismo criterio que ya usaba
-- `descuento_porcentaje`).
--
-- El CHECK sólo exige que no sea negativo — "el descuento no puede
-- superar el precio base" es una regla de negocio que ReservaForm.jsx
-- ya aplica del lado del cliente (clamp a $0, nunca manda un
-- monto_total negativo); un CHECK de columna no puede validar eso acá
-- porque no tiene forma de comparar contra el precio de la reserva en
-- el mismo constraint sin duplicar esa regla a nivel de fila — mismo
-- criterio de "backstop simple, no reimplementar la regla de negocio
-- completa a nivel de base" que ya usó 020_movimientos_caja_check_montos.sql
-- para montos de caja.
--
-- La sintaxis `alter table ... add constraint IF NOT EXISTS` no existe
-- en PostgreSQL (a diferencia de `add column if not exists`, que sí
-- existe y se usa abajo) — envuelto en un bloque DO + chequeo contra
-- pg_constraint para que este archivo sea seguro de correr más de una
-- vez sin fallar por "la constraint ya existe", ya que se pidió
-- explícitamente que fuera idempotente.
-- ============================================================

alter table reservas
  add column if not exists descuento_monto numeric default null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where c.conname = 'descuento_monto_no_negativo'
      and t.relname = 'reservas'
  ) then
    alter table reservas
      add constraint descuento_monto_no_negativo
      check (descuento_monto is null or descuento_monto >= 0);
  end if;
end $$;

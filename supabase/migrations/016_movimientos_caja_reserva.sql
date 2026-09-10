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

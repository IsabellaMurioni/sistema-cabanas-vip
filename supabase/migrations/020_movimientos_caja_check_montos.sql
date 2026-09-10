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

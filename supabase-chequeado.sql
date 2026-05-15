-- Agregar columna chequeado a caja_banco y caja_mercado_pago
ALTER TABLE caja_banco
  ADD COLUMN IF NOT EXISTS chequeado boolean DEFAULT false;

ALTER TABLE caja_mercado_pago
  ADD COLUMN IF NOT EXISTS chequeado boolean DEFAULT false;

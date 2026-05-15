-- Agregar columnas de descuento a la tabla reservas
ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS descuento_porcentaje numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS descuento_motivo     text    DEFAULT NULL;

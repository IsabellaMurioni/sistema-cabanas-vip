-- Verificar valores actuales de estado en la tabla reservas
SELECT DISTINCT estado, COUNT(*) AS cantidad
FROM reservas
GROUP BY estado
ORDER BY estado;

-- Agregar restricción CHECK en el campo estado (solo si todos los valores son válidos)
-- Primero verificar que no haya valores fuera del rango con el SELECT de arriba.
-- Luego ejecutar:
ALTER TABLE reservas
  DROP CONSTRAINT IF EXISTS reservas_estado_check;

ALTER TABLE reservas
  ADD CONSTRAINT reservas_estado_check
  CHECK (estado IN ('Pendiente', 'Confirmada', 'Finalizada', 'Cancelada'));

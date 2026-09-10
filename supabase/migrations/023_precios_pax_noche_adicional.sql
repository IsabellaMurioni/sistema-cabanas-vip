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

-- ============================================================
-- 018_cierres_caja_nombre.sql
-- Etiqueta opcional y puramente descriptiva para un cierre de caja
-- (ej. "Temporada 2026-27"), para que "Cierres recientes" y los
-- mensajes de bloqueo de período cerrado puedan mostrar un nombre
-- legible en vez de sólo el rango de fechas. 100% ajeno a Cabañas
-- VIP. Sin restricciones ni relaciones — texto libre, nullable.
-- ============================================================

alter table cierres_caja add column if not exists nombre text;

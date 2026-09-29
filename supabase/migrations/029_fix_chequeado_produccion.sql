-- ============================================================
-- 029_fix_chequeado_produccion.sql
-- Corrige otra divergencia real descubierta en la auditoría de hoy:
-- 008_chequeado.sql (agrega `chequeado` a caja_banco y
-- caja_mercado_pago) nunca se había aplicado en PRODUCCIÓN, aunque sí
-- estaba aplicada en staging.
--
-- Impacto real confirmado: el checkbox "Chequeado" en Caja > Banco y
-- Caja > Mercado Pago se tildaba visualmente pero nunca se guardaba de
-- verdad (la escritura fallaba en silencio, sin avisar al usuario, y
-- al refrescar la página el tilde desaparecía). Confirmado en vivo por
-- el usuario. Esto venía pasando desde que la función existe en
-- producción, no es algo nuevo de esta tarea.
--
-- Contenido idéntico al original 008_chequeado.sql (misma definición
-- de columna, boolean DEFAULT false, nullable) — solo se corrió tarde,
-- directamente en producción. Ya aplicada y verificada en producción
-- (2026-09-29) antes de crear este archivo — commit retroactivo, para
-- que el historial de migrations del repo finalmente refleje la
-- realidad.
-- ============================================================

alter table caja_banco
  add column if not exists chequeado boolean default false;

alter table caja_mercado_pago
  add column if not exists chequeado boolean default false;

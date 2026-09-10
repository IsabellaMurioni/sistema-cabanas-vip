-- ============================================================
-- FASE 6 — VIP DATA WIPE
-- ⚠️  ESTO BORRA DATOS REALES DE PRODUCCIÓN. NO SE PUEDE DESHACER.
-- ⚠️  VERIFICAR QUE EL BACKUP DE PRODUCCIÓN ESTÁ TOMADO Y ES
--     RESTAURABLE *ANTES* DE CORRER ESTO — ver ROLLBACK.md, sección (c).
--
-- Correr DESPUÉS de 001_migrations_010_a_024.sql y
-- 002_seed_datos.sql (para que los 5 complejos/cabañas/membresías ya
-- existan cuando el sistema vuelva a usarse) — el orden entre "seed" y
-- "wipe" no es estrictamente obligatorio (son tablas distintas, sin
-- overlap), pero correr el wipe último dexa la base en el estado final
-- limpio sin un paso más después.
--
-- Mismo patrón que 009_clean.sql (TRUNCATE), que ya hizo exactamente
-- esto una vez, antes del primer lanzamiento a producción.
-- ============================================================

-- ── Verificación hecha antes de escribir este statement (no asumida) ──
--
-- Recorrí las 23 migraciones del repo buscando toda FK que apunte a
-- cualquiera de las 8 tablas pedidas (reservas, caja_silvia, caja_juli,
-- caja_banco, caja_mercado_pago, email_logs, periodos_precios,
-- precios_pax). Encontré 2:
--
--   1. movimientos_caja.reserva_id → reservas(id) ON DELETE CASCADE
--      (016_movimientos_caja_reserva.sql). movimientos_caja NO estaba
--      en la lista original — sin CASCADE, `TRUNCATE reservas` fallaría
--      directamente con "cannot truncate a table referenced in a
--      foreign key constraint". CASCADE lo resuelve, pero como efecto
--      secundario TRUNCATEa movimientos_caja TAMBIÉN — tabla que no
--      puede tener ninguna fila real en producción todavía (no existió
--      hasta la migración 015 de ESTE MISMO corte de Fase 6, recién
--      aplicada arriba), así que es inofensivo, pero lo agrego
--      EXPLÍCITO a la lista de abajo en vez de dejarlo como un efecto
--      secundario implícito de CASCADE — más claro para quien lea esto
--      después.
--
--   2. precios_pax.periodo_id → periodos_precios(id) ON DELETE CASCADE
--      (003_precios_v2.sql). precios_pax YA estaba en la lista pedida
--      — sin cambios necesarios acá.
--
-- Ninguna otra tabla del schema (cabanas, complejos, membresias,
-- cierres_caja, cierre_reconciliacion, cierre_reparto_ganancia)
-- referencia ninguna de estas 8 tablas — nada más se ve afectado.
--
-- storage.objects (bucket "comprobantes") NO tiene ninguna FK real
-- hacia reservas/caja_* — los campos "comprobante"/"*_comprobante" son
-- texto libre (nombre de archivo), sin constraint — por eso este
-- TRUNCATE no toca Storage para nada; ver 004_wipe_storage.mjs aparte.

truncate table
  reservas,
  caja_silvia,
  caja_juli,
  caja_banco,
  caja_mercado_pago,
  movimientos_caja,
  email_logs,
  periodos_precios,
  precios_pax
restart identity cascade;

-- Verificación post-wipe — las 9 deben devolver 0:
-- select count(*) from reservas;
-- select count(*) from caja_silvia;
-- select count(*) from caja_juli;
-- select count(*) from caja_banco;
-- select count(*) from caja_mercado_pago;
-- select count(*) from movimientos_caja;
-- select count(*) from email_logs;
-- select count(*) from periodos_precios;
-- select count(*) from precios_pax;

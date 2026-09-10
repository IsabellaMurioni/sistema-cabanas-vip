-- ============================================================
-- 014_codigo_unico_por_complejo.sql
-- El código de reserva (A0001, A0002...) pasa de ser único en TODA
-- la tabla a ser único DENTRO de cada complejo, ya que cada complejo
-- ahora tiene su propia numeración independiente (decisión confirmada
-- por el usuario). Sin esto, dos complejos no pueden tener ambos una
-- reserva "A0001" al mismo tiempo, aunque sean totalmente distintas.
-- ============================================================

alter table reservas drop constraint if exists reservas_codigo_key;
alter table reservas add constraint reservas_codigo_complejo_key unique (complejo_id, codigo);

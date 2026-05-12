-- ============================================================
-- PARTE 1 — Schema (ejecutar ahora, sin prerrequisitos)
-- ============================================================

-- Agrega campo de vencimiento a reservas
ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS fecha_vencimiento timestamptz;

-- Tabla de logs de email
CREATE TABLE IF NOT EXISTS email_logs (
  id          uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  reserva_id  uuid         REFERENCES reservas(id) ON DELETE SET NULL,
  tipo_email  text         NOT NULL,  -- 'confirmacion' | 'recibo' | 'vencimiento'
  estado      text         NOT NULL,  -- 'enviado' | 'error'
  error       text,
  created_at  timestamptz  DEFAULT now()
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_logs_select" ON email_logs;
CREATE POLICY "email_logs_select" ON email_logs
  FOR SELECT TO authenticated USING (true);


-- ============================================================
-- PARTE 2 — pg_cron job (ejecutar DESPUÉS de estos pasos):
--
--   1. Dashboard → Database → Extensions → habilitar "pg_cron"
--   2. Dashboard → Database → Extensions → habilitar "pg_net"
--   3. Reemplazar <SERVICE_ROLE_KEY> con tu clave
--      (Settings → API → service_role secret)
--   4. Ejecutar solo este bloque en el SQL Editor
-- ============================================================

SELECT cron.schedule(
  'check-reservas-vencidas',     -- nombre único del job (no cambiar)
  '0 * * * *',                   -- cada hora en punto
  $$
  SELECT net.http_post(
    url     => 'https://dtmgaovsxxowbjtqpbbk.supabase.co/functions/v1/check-reservas-vencidas',
    headers => jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    => '{}'::jsonb
  )
  $$
);

-- Para verificar que el job quedó registrado:
-- SELECT jobid, jobname, schedule, command FROM cron.job;

-- Para eliminar y recrear el job (si necesitás cambiar algo):
-- SELECT cron.unschedule('check-reservas-vencidas');


-- ============================================================
-- PARTE 3 — Secretos de la Edge Function check-reservas-vencidas
-- Ejecutar en terminal con Supabase CLI:
--
--   supabase secrets set EMAILJS_SERVICE_ID=service_xxxxxxx
--   supabase secrets set EMAILJS_TEMPLATE_CANCELLED_ID=template_xxxxxxx
--   supabase secrets set EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxxxxxxxxx
--
-- Son los mismos valores que pusiste en el .env (sin el prefijo VITE_).
-- El EMAILJS_PUBLIC_KEY es tu Public Key de EmailJS (Settings → General).
--
-- Deploy de la Edge Function:
--   supabase functions deploy check-reservas-vencidas
-- ============================================================

// @ts-nocheck — Deno runtime; los tipos de Node/TS no aplican aquí
// Supabase Edge Function — check-reservas-vencidas
// Cancels expired Pendiente reservations and sends Email 3 (cancelacion) via EmailJS REST API.
// Called hourly by pg_cron (see supabase-emails.sql).
// Deploy: supabase functions deploy check-reservas-vencidas
//
// Required secrets (supabase secrets set):
//   EMAILJS_SERVICE_ID=service_xxxxxxx
//   EMAILJS_TEMPLATE_ID=template_xxxxxxx
//   EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxxxxxxxxx

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendVencimientoEmail(email: string, nombre: string, codigo: string) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id:      Deno.env.get('EMAILJS_SERVICE_ID'),
      template_id:     Deno.env.get('EMAILJS_TEMPLATE_ID'),
      user_id:         Deno.env.get('EMAILJS_PUBLIC_KEY'),
      template_params: {
        asunto:              `Reserva N° ${codigo} dada de baja — Cabañas VIP`,
        to_email:            email,
        to_name:             nombre,
        mensaje_intro:       'Le informamos que habiendo transcurrido el plazo de pago de la seña, su reserva ha sido dada de baja.',
        bloque_confirmacion: false,
        bloque_recibo:       false,
        bloque_cancelacion:  true,
        codigo,
      },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`EmailJS ${res.status}: ${body}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const now = new Date().toISOString()

  const { data: vencidas, error: fetchErr } = await supabase
    .from('reservas')
    .select('id, codigo, nombre_apellido, email')
    .eq('estado', 'Pendiente')
    .lt('fecha_vencimiento', now)

  if (fetchErr) {
    console.error('fetch error:', fetchErr.message)
    return new Response(JSON.stringify({ ok: false, error: fetchErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  let processed = 0

  for (const r of vencidas ?? []) {
    let emailError: string | null = null

    if (r.email) {
      try {
        await sendVencimientoEmail(r.email, r.nombre_apellido, r.codigo)
      } catch (err) {
        emailError = err instanceof Error ? err.message : String(err)
        console.error(`Email error for ${r.codigo}:`, emailError)
      }
    }

    // Always cancel regardless of email outcome
    await supabase
      .from('reservas')
      .update({ estado: 'Cancelada' })
      .eq('id', r.id)

    // Log result
    await supabase.from('email_logs').insert({
      reserva_id: r.id,
      tipo_email: 'vencimiento',
      estado:     emailError ? 'error' : 'enviado',
      error:      emailError,
    })

    processed++
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
})

// @ts-nocheck — Deno runtime; los tipos de Node/TS no aplican aquí
// Supabase Edge Function — check-reservas-vencidas
// Cancels expired Pendiente reservations and sends cancellation email via EmailJS REST API.
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

function generarHtmlCancelacion(nombre: string, codigo: string): string {
  const fila = (label: string, value: string) =>
    `<tr>
      <td style="color:#9c7c5c;font-size:14px;padding:7px 0;border-bottom:1px solid #f0e4d0;width:55%;">${label}</td>
      <td style="color:#3d3129;font-size:14px;text-align:right;padding:7px 0;border-bottom:1px solid #f0e4d0;">${value}</td>
    </tr>`

  const card = (titulo: string, cuerpo: string) =>
    `<div style="background:#fdf3e3;border:1px solid #e8d9c5;border-radius:10px;padding:20px 22px;margin-bottom:16px;">
      <div style="color:#a0713a;font-size:12px;letter-spacing:1.5px;margin-bottom:14px;font-family:Georgia,serif;text-transform:uppercase;">${titulo}</div>
      ${cuerpo}
    </div>`

  const contenido = `
    <h2 style="margin:0 0 6px;font-size:22px;font-weight:400;color:#a0713a;font-family:Georgia,serif;">Reserva Cancelada</h2>
    <p style="margin:0 0 22px;color:#6b5744;font-size:15px;">
      Estimado/a <strong style="color:#3d3129;">${nombre}</strong>,
    </p>
    ${card('Aviso', `<p style="margin:0 0 12px;color:#3d3129;font-size:15px;line-height:1.7;">
      Le informamos que habiendo transcurrido el plazo de pago de la seña,
      su reserva <strong>N° ${codigo}</strong> ha sido dada de baja.
    </p>
    <p style="margin:0;color:#6b5744;font-size:14px;line-height:1.7;">
      Si desea realizar una nueva reserva o tiene alguna consulta, no dude en contactarnos.
    </p>`)}
    ${card('Contacto', `<table width="100%" cellpadding="0" cellspacing="0">
      ${fila('WhatsApp', '011-5099-5700')}
      ${fila('Email', 'ventashotelesdelacosta@hotmail.com')}
      ${fila('Web', 'www.complejocabanasvip.com')}
    </table>`)}`

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5ede0;font-family:Georgia,serif;color:#3d3129;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5ede0;min-height:100vh;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:580px;border:1px solid #e8d9c5;border-radius:12px;overflow:hidden;background:#fffaf5;">
          <tr>
            <td style="background:#c8a96e;padding:28px 40px;text-align:center;">
              <div style="font-size:28px;font-weight:400;color:#ffffff;letter-spacing:1px;font-family:Georgia,serif;">Cabañas VIP</div>
              <div style="font-size:12px;color:#fff5e8;letter-spacing:3px;margin-top:5px;">SANTA CLARA DEL MAR</div>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 36px;background:#fffaf5;">
              ${contenido}
            </td>
          </tr>
          <tr>
            <td style="background:#fdf3e3;border-top:1px solid #e8d9c5;padding:18px 36px;text-align:center;">
              <div style="color:#c8a96e;font-size:14px;font-family:Georgia,serif;">Cabañas VIP — Santa Clara del Mar</div>
              <div style="color:#9c7c5c;font-size:12px;margin-top:6px;">WhatsApp: 011-5099-5700 &nbsp;·&nbsp; ventashotelesdelacosta@hotmail.com</div>
              <div style="color:#9c7c5c;font-size:12px;margin-top:3px;">www.complejocabanasvip.com</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

async function sendVencimientoEmail(email: string, nombre: string, codigo: string) {
  const asunto   = `Reserva N° ${codigo} dada de baja — Cabañas VIP`
  const contenido = generarHtmlCancelacion(nombre, codigo)

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id:      Deno.env.get('EMAILJS_SERVICE_ID'),
      template_id:     Deno.env.get('EMAILJS_TEMPLATE_ID'),
      user_id:         Deno.env.get('EMAILJS_PUBLIC_KEY'),
      template_params: { email_destino: email, asunto, contenido },
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

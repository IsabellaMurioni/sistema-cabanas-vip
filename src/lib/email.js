import emailjs from '@emailjs/browser'

const SVC      = import.meta.env.VITE_EMAILJS_SERVICE_ID
const PUB      = import.meta.env.VITE_EMAILJS_PUBLIC_KEY
const TEMPLATE = import.meta.env.VITE_EMAILJS_TEMPLATE_ID

console.log('[EmailJS] Cargando módulo...')
console.log('[EmailJS] SERVICE_ID:', SVC  || '✗ UNDEFINED')
console.log('[EmailJS] TEMPLATE_ID:', TEMPLATE || '✗ UNDEFINED')
console.log('[EmailJS] PUBLIC_KEY:', PUB  ? '✓ presente' : '✗ UNDEFINED')

emailjs.init({ publicKey: PUB })

function fmtFecha(d) {
  if (!d) return '-'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function money(v) {
  if (v === null || v === undefined || v === '') return '-'
  return `$${Number(v).toLocaleString('es-AR')}`
}

async function enviarEmail(templateParams) {
  console.log('[EmailJS] Llamando emailjs.send...')
  console.log('[EmailJS] SVC:', SVC, '| TEMPLATE:', TEMPLATE, '| PUB:', PUB ? '✓' : '✗')
  console.log('[EmailJS] Params:', templateParams)
  try {
    const result = await emailjs.send(
      SVC,
      TEMPLATE,
      templateParams,
      PUB,
    )
    console.log('[EmailJS] ✓ Enviado correctamente:', result.status, result.text)
    return result
  } catch (error) {
    console.error('[EmailJS] ✗ Error al enviar:', error)
    throw error
  }
}

// Retorna la fecha/hora del envío (string ISO) para guardar en DB,
// o null si no había email.
export async function sendEmailConfirmacion(reserva) {
  if (!reserva.email) {
    console.warn('[EmailJS] Confirmación omitida: sin email en reserva', reserva.codigo)
    return null
  }
  const sena = Math.ceil(Number(reserva.monto_total) * 0.3)
  console.log('[EmailJS] Enviando confirmación → to:', reserva.email, '| reserva:', reserva.codigo)
  await enviarEmail({
    asunto:              `Confirmación de Reserva N° ${reserva.codigo} — Cabañas VIP`,
    email_destino:       reserva.email,
    nombre_cliente:      reserva.nombre_apellido,
    mensaje_intro:       `Confirmamos tu reserva para ${reserva.pax} personas, del ${fmtFecha(reserva.fecha_entrada)} al ${fmtFecha(reserva.fecha_salida)} (${reserva.noches} noches).`,
    bloque_confirmacion: true,
    bloque_recibo:       false,
    bloque_cancelacion:  false,
    codigo:              reserva.codigo,
    cabana:              reserva.cabana,
    pax:                 String(reserva.pax),
    fecha_in:            fmtFecha(reserva.fecha_entrada),
    fecha_out:           fmtFecha(reserva.fecha_salida),
    noches:              String(reserva.noches),
    monto_total:         money(reserva.monto_total),
    monto_sena:          money(sena),
  })
  return new Date().toISOString()
}

// pago: { titulo, monto, fecha, tipo, total_pagado, saldo }
export async function sendEmailRecibo(reserva, pago) {
  if (!reserva.email) throw new Error('El cliente no tiene email registrado')
  console.log('[EmailJS] Enviando recibo → to:', reserva.email, '| reserva:', reserva.codigo)
  await enviarEmail({
    asunto:              `Recibo de Pago — Reserva N° ${reserva.codigo} — Cabañas VIP`,
    email_destino:       reserva.email,
    nombre_cliente:      reserva.nombre_apellido,
    mensaje_intro:       'Confirmamos la recepción de tu pago.',
    bloque_confirmacion: false,
    bloque_recibo:       true,
    bloque_cancelacion:  false,
    codigo:              reserva.codigo,
    cabana:              reserva.cabana,
    fecha_in:            fmtFecha(reserva.fecha_entrada),
    fecha_out:           fmtFecha(reserva.fecha_salida),
    monto_pago:          money(pago.monto),
    fecha_pago:          fmtFecha(pago.fecha),
    medio_pago:          pago.tipo || 'Efectivo',
    monto_total:         money(reserva.monto_total),
    total_pagado:        money(pago.total_pagado),
    saldo_restante:      money(pago.saldo),
  })
}

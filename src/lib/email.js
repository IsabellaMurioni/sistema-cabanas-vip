// EmailJS — template única "cabanas_vip_emails"
// Los bloques se activan con booleanos; el asunto llega como variable {{asunto}}.
//
// Variables comunes a todas las llamadas:
//   {{asunto}}, {{to_email}}, {{to_name}}, {{mensaje_intro}},
//   {{bloque_confirmacion}}, {{bloque_recibo}}, {{bloque_cancelacion}}
//
// Bloque confirmación: {{codigo}}, {{cabana}}, {{pax}},
//   {{fecha_in}}, {{fecha_out}}, {{monto_total}}, {{monto_sena}}
//
// Bloque recibo: {{codigo}}, {{cabana}}, {{fecha_in}}, {{fecha_out}},
//   {{monto_pago}}, {{fecha_pago}}, {{medio_pago}},
//   {{monto_total}}, {{total_pagado}}, {{saldo_restante}}
//
// Bloque cancelación: {{codigo}}

import emailjs from '@emailjs/browser'

const SVC      = import.meta.env.VITE_EMAILJS_SERVICE_ID
const PUB      = import.meta.env.VITE_EMAILJS_PUBLIC_KEY
const TEMPLATE = import.meta.env.VITE_EMAILJS_TEMPLATE_ID

function fmtFecha(d) {
  if (!d) return '-'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function money(v) {
  if (v === null || v === undefined || v === '') return '-'
  return `$${Number(v).toLocaleString('es-AR')}`
}

// Email 1 — Confirmación de reserva (se envía al crear con estado Pendiente)
export async function sendEmailConfirmacion(reserva) {
  if (!reserva.email) return
  const sena = Math.ceil(Number(reserva.monto_total) * 0.3)
  await emailjs.send(SVC, TEMPLATE, {
    asunto:              `Confirmación de Reserva N° ${reserva.codigo} — Cabañas VIP`,
    to_email:            reserva.email,
    to_name:             reserva.nombre_apellido,
    mensaje_intro:       `Confirmamos tu reserva para ${reserva.pax} personas, ingresando el ${fmtFecha(reserva.fecha_entrada)} hasta el ${fmtFecha(reserva.fecha_salida)}.`,
    bloque_confirmacion: true,
    bloque_recibo:       false,
    bloque_cancelacion:  false,
    codigo:              reserva.codigo,
    cabana:              reserva.cabana,
    pax:                 String(reserva.pax),
    fecha_in:            fmtFecha(reserva.fecha_entrada),
    fecha_out:           fmtFecha(reserva.fecha_salida),
    monto_total:         money(reserva.monto_total),
    monto_sena:          money(sena),
  }, { publicKey: PUB })
}

// Email 2 — Recibo de pago (botón en historial de pagos)
// pago: { titulo, monto, fecha, tipo, total_pagado, saldo }
export async function sendEmailRecibo(reserva, pago) {
  if (!reserva.email) throw new Error('El cliente no tiene email registrado')
  await emailjs.send(SVC, TEMPLATE, {
    asunto:              `Recibo de Pago — Reserva N° ${reserva.codigo} — Cabañas VIP`,
    to_email:            reserva.email,
    to_name:             reserva.nombre_apellido,
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
  }, { publicKey: PUB })
}

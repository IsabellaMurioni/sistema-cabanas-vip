// EmailJS — envío de emails transaccionales desde el frontend
// Documentación de variables de template esperadas en cada plantilla de EmailJS:
//
// TEMPLATE_CONFIRMATION_ID variables:
//   {{to_email}}, {{to_name}}, {{codigo}}, {{cabana}}, {{pax}},
//   {{fecha_entrada}}, {{fecha_salida}}, {{noches}},
//   {{monto_total}}, {{sena_requerida}}
//
// TEMPLATE_RECEIPT_ID variables:
//   {{to_email}}, {{to_name}}, {{codigo}}, {{cabana}},
//   {{fecha_entrada}}, {{fecha_salida}}, {{titulo}},
//   {{monto_pago}}, {{fecha_pago}}, {{tipo_pago}},
//   {{monto_total}}, {{total_pagado}}, {{saldo}}
//
// TEMPLATE_CANCELLED_ID variables (usada desde Edge Function vía REST):
//   {{to_email}}, {{to_name}}, {{codigo}}

import emailjs from '@emailjs/browser'

const SVC       = import.meta.env.VITE_EMAILJS_SERVICE_ID
const PUB       = import.meta.env.VITE_EMAILJS_PUBLIC_KEY
const T_CONFIRM = import.meta.env.VITE_EMAILJS_TEMPLATE_CONFIRMATION_ID
const T_RECEIPT = import.meta.env.VITE_EMAILJS_TEMPLATE_RECEIPT_ID

function fmtFecha(d) {
  if (!d) return '-'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function money(v) {
  if (v === null || v === undefined || v === '') return '-'
  return `$${Number(v).toLocaleString('es-AR')}`
}

// Email 1 — Confirmación de reserva (se llama al crear reserva con estado Pendiente)
export async function sendEmailConfirmacion(reserva) {
  if (!reserva.email) return
  const sena = Math.ceil(Number(reserva.monto_total) * 0.3)
  await emailjs.send(SVC, T_CONFIRM, {
    to_email:       reserva.email,
    to_name:        reserva.nombre_apellido,
    codigo:         reserva.codigo,
    cabana:         reserva.cabana,
    pax:            String(reserva.pax),
    fecha_entrada:  fmtFecha(reserva.fecha_entrada),
    fecha_salida:   fmtFecha(reserva.fecha_salida),
    noches:         String(reserva.noches),
    monto_total:    money(reserva.monto_total),
    sena_requerida: money(sena),
  }, { publicKey: PUB })
}

// Email 2 — Recibo de pago (botón en historial de pagos)
// pago: { titulo, monto, fecha, tipo, total_pagado, saldo }
export async function sendEmailRecibo(reserva, pago) {
  if (!reserva.email) throw new Error('El cliente no tiene email registrado')
  await emailjs.send(SVC, T_RECEIPT, {
    to_email:     reserva.email,
    to_name:      reserva.nombre_apellido,
    codigo:       reserva.codigo,
    cabana:       reserva.cabana,
    fecha_entrada: fmtFecha(reserva.fecha_entrada),
    fecha_salida:  fmtFecha(reserva.fecha_salida),
    titulo:       pago.titulo,
    monto_pago:   money(pago.monto),
    fecha_pago:   fmtFecha(pago.fecha),
    tipo_pago:    pago.tipo || 'Efectivo',
    monto_total:  money(reserva.monto_total),
    total_pagado: money(pago.total_pagado),
    saldo:        money(pago.saldo),
  }, { publicKey: PUB })
}

import emailjs from '@emailjs/browser'
import {
  generarEmailConfirmacion,
  generarEmailRecibo,
} from '../utils/emailTemplates.js'

const SVC      = import.meta.env.VITE_EMAILJS_SERVICE_ID
const PUB      = import.meta.env.VITE_EMAILJS_PUBLIC_KEY
const PRIV     = import.meta.env.VITE_EMAILJS_PRIVATE_KEY
const TEMPLATE = import.meta.env.VITE_EMAILJS_TEMPLATE_ID

if (!SVC || !PUB || !PRIV || !TEMPLATE) {
  console.error(
    '[EmailJS] ⚠️ Variables de entorno faltantes. Los emails NO se enviarán.\n' +
    '  VITE_EMAILJS_SERVICE_ID:', !!SVC, '\n' +
    '  VITE_EMAILJS_PUBLIC_KEY:', !!PUB, '\n' +
    '  VITE_EMAILJS_PRIVATE_KEY:', !!PRIV, '\n' +
    '  VITE_EMAILJS_TEMPLATE_ID:', !!TEMPLATE
  )
}

emailjs.init({ publicKey: PUB, privateKey: PRIV })

function str(v, fallback = '') {
  if (v === null || v === undefined) return fallback
  return String(v)
}

async function enviarEmail(to, asunto, contenido) {
  if (!SVC || !PUB || !PRIV || !TEMPLATE) {
    throw new Error('EmailJS no está configurado. Verificá las variables de entorno en Vercel.')
  }
  console.log('[EmailJS] Enviando a:', to, '| asunto:', asunto)
  try {
    const result = await emailjs.send(SVC, TEMPLATE, { email_destino: to, asunto, contenido }, PUB)
    console.log('[EmailJS] ✓ Enviado:', result.status, result.text)
    return result
  } catch (error) {
    console.error('[EmailJS] ✗ Error status:', error?.status, '| text:', error?.text, '| raw:', error)
    throw error
  }
}

export async function sendEmailConfirmacion(reserva) {
  if (!reserva.email) {
    console.warn('[EmailJS] Confirmación omitida: sin email', reserva.codigo)
    return null
  }
  const asunto = `Confirmación de Reserva N° ${str(reserva.codigo)} — Cabañas VIP`
  await enviarEmail(reserva.email, asunto, generarEmailConfirmacion(reserva))
  return new Date().toISOString()
}

// pago: { titulo, monto, fecha, tipo, total_pagado, saldo }
export async function sendEmailRecibo(reserva, pago) {
  if (!reserva.email) throw new Error('El cliente no tiene email registrado')
  const asunto = `Recibo de Pago — Reserva N° ${str(reserva.codigo)} — Cabañas VIP`
  await enviarEmail(reserva.email, asunto, generarEmailRecibo(reserva, pago))
}

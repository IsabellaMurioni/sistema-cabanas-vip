// @ts-nocheck — Deno runtime; los tipos de Node/TS no aplican aquí
// Supabase Edge Function — bot-disponibilidad
// Fase 3 de la integración del bot de WhatsApp: endpoint de SOLO
// LECTURA que devuelve qué cabañas (de las habilitadas para el bot)
// están libres para un rango de fechas dado. No crea ni modifica
// ninguna reserva.
//
// Requisitos de corrección — EXPLÍCITOS del desarrollador del bot
// (Nacho), no una suposición nuestra:
//
//  - Fechas: ambas deben ser "YYYY-MM-DD" ISO 8601 válidas (fecha de
//    calendario real, "2026-02-30" se rechaza), fecha_entrada tiene
//    que ser estrictamente anterior a fecha_salida, y el rango
//    (fecha_salida - fecha_entrada) no puede superar 90 días. Las
//    tres cosas fallan como VALIDATION_ERROR, con el límite de 90
//    días explícito en el mensaje cuando corresponde.
//
//  - Alcance de complejo: en esta fase, el ÚNICO `complejo_slug`
//    válido para este endpoint es 'mimmo' — ver más abajo para el
//    por qué.
//
//  - Semántica de superposición contra `reserva_cabanas`: el mismo
//    medio-abierto que ya enforcea el EXCLUDE constraint de Fase 1
//    (033_reserva_cabanas_exclusion.sql) — `fecha_entrada < [fecha_
//    salida pedida] AND fecha_salida > [fecha_entrada pedida]`,
//    checkin incluido/checkout excluido, SIN ninguna conversión de
//    timezone (las fechas se tratan como fechas de calendario
//    planas, nunca como Date con hora). Tiene que coincidir exacto
//    con esa semántica — no es una reimplementación libre.
//
//  - Unidad física, no categoría: una cabaña cuenta como disponible
//    SÓLO si tiene CERO filas superpuestas en reserva_cabanas en TODO
//    el rango pedido — no se agrega por noche ni por categoría. Esto
//    chequea que la MISMA unidad física esté libre la estadía
//    completa, no que "algo del mismo tipo" esté libre cada noche
//    por separado.
//
// Alcance de complejo, deliberado y temporal: sólo 'mimmo' está
// habilitado para este endpoint en esta fase — la credencial del bot
// está scoped a Mimmo únicamente (ver cabanas.habilitado_bot,
// 032_bot_scope_and_cancelacion.sql, que ya marca las 9 cabañas reales
// de MIMMO I). Cualquier otro complejo_slug se rechaza explícito
// (OUT_OF_SCOPE) en vez de consultarlo en silencio — esto hay que
// revisarlo el día que otros complejos reciban acceso al bot, no es
// un olvido ni un hardcode permanente.
//
// Cliente de servicio: TODAS las queries de este archivo (incluida
// `cabanas`/`complejos`, no sólo `reserva_cabanas`) usan el
// SupabaseClient creado con SUPABASE_SERVICE_ROLE_KEY — mismo
// requisito que ya documenta _shared/idempotency.ts: `reserva_cabanas`
// tiene RLS habilitado con CERO policies, así que con la anon key
// cualquier lectura ahí falla silenciosamente contra RLS, no por un
// bug de este archivo. Un solo cliente para todo el handler evita
// tener que acordarse de usar uno distinto sólo para esa tabla.
//
// Sin BOT_API_KEY real configurado todavía (ver _shared/auth.ts) —
// hasta que se setee el secret, checkBotAuth rechaza TODAS las
// requests, sin excepción. No se setea ese secret acá.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBotAuth, authFailureMessage } from '../_shared/auth.ts'
import { botErrorResponse } from '../_shared/errors.ts'

const MAX_RANGO_DIAS = 90
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

// Valida que el string sea "YYYY-MM-DD" Y una fecha de calendario
// real — Date.UTC normaliza un día inválido (p.ej. 30 de febrero)
// rodando al mes siguiente, así que si los componentes no coinciden
// después de ida y vuelta, la fecha de entrada era inválida.
function esFechaIsoValida(value: unknown): value is string {
  if (typeof value !== 'string' || !FECHA_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const fecha = new Date(Date.UTC(y, m - 1, d))
  return fecha.getUTCFullYear() === y && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d
}

// Diferencia en días de calendario entre dos "YYYY-MM-DD", sin pasar
// por zona horaria local — Date.UTC con los mismos componentes para
// ambas puntas, UTC no tiene DST, así que la resta siempre da un
// número entero exacto de días.
function diffDiasCalendario(desde: string, hasta: string): number {
  const [ay, am, ad] = desde.split('-').map(Number)
  const [by, bm, bd] = hasta.split('-').map(Number)
  const utcDesde = Date.UTC(ay, am - 1, ad)
  const utcHasta = Date.UTC(by, bm - 1, bd)
  return Math.round((utcHasta - utcDesde) / 86400000)
}

Deno.serve(async (req) => {
  const auth = checkBotAuth(req)
  if (!auth.ok) {
    const { code, message } = authFailureMessage(auth)
    return botErrorResponse(code, message)
  }

  if (req.method !== 'POST') {
    return botErrorResponse('VALIDATION_ERROR', 'Este endpoint sólo acepta POST.')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return botErrorResponse('VALIDATION_ERROR', 'Body inválido — se esperaba JSON.')
  }

  const { complejo_slug, fecha_entrada, fecha_salida } = (body ?? {}) as Record<string, unknown>

  if (typeof complejo_slug !== 'string' || complejo_slug.length === 0) {
    return botErrorResponse('VALIDATION_ERROR', 'Falta complejo_slug.')
  }

  if (!esFechaIsoValida(fecha_entrada)) {
    return botErrorResponse('VALIDATION_ERROR', 'fecha_entrada debe ser una fecha válida en formato YYYY-MM-DD.')
  }
  if (!esFechaIsoValida(fecha_salida)) {
    return botErrorResponse('VALIDATION_ERROR', 'fecha_salida debe ser una fecha válida en formato YYYY-MM-DD.')
  }

  // Comparación por string ISO, no por Date — mismo criterio que
  // getConflicto/inRange en el resto del repo (ver ReservaForm.jsx/
  // Ganancias.jsx), evita cualquier ambigüedad de timezone.
  if (!(fecha_entrada < fecha_salida)) {
    return botErrorResponse('VALIDATION_ERROR', 'fecha_entrada debe ser anterior a fecha_salida.')
  }

  const rangoDias = diffDiasCalendario(fecha_entrada, fecha_salida)
  if (rangoDias > MAX_RANGO_DIAS) {
    return botErrorResponse(
      'VALIDATION_ERROR',
      `El rango entre fecha_entrada y fecha_salida no puede superar ${MAX_RANGO_DIAS} días (pedido: ${rangoDias} días).`,
    )
  }

  // Restricción deliberada y temporal — ver header.
  if (complejo_slug !== 'mimmo') {
    return botErrorResponse(
      'OUT_OF_SCOPE',
      `complejo_slug "${complejo_slug}" está fuera de alcance — por ahora este endpoint sólo opera sobre 'mimmo'.`,
    )
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data: complejo, error: complejoError } = await supabase
    .from('complejos')
    .select('id')
    .eq('slug', complejo_slug)
    .maybeSingle()

  if (complejoError) {
    console.error('complejo fetch error:', complejoError.message)
    return botErrorResponse('INTERNAL_ERROR', 'Error buscando el complejo.')
  }
  if (!complejo) {
    return botErrorResponse('NOT_FOUND', `No existe el complejo "${complejo_slug}".`)
  }

  const { data: cabanasBot, error: cabanasError } = await supabase
    .from('cabanas')
    .select('id, nombre, pax_min, pax_max')
    .eq('complejo_id', complejo.id)
    .eq('habilitado_bot', true)

  if (cabanasError) {
    console.error('cabanas fetch error:', cabanasError.message)
    return botErrorResponse('INTERNAL_ERROR', 'Error buscando las cabañas habilitadas.')
  }

  if (!cabanasBot || cabanasBot.length === 0) {
    return new Response(JSON.stringify({ available: [] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const cabanaIds = cabanasBot.map((c) => c.id)

  // Mismo medio-abierto que el EXCLUDE constraint de Fase 1 — ver
  // header. `reserva_cabanas` nunca guarda filas de reservas
  // Canceladas (el trigger de 033 las borra/nunca las inserta), así
  // que no hace falta filtrar por estado acá: todo lo que esta query
  // devuelve ya es ocupación real y activa.
  const { data: ocupadas, error: ocupadasError } = await supabase
    .from('reserva_cabanas')
    .select('cabana_id')
    .in('cabana_id', cabanaIds)
    .lt('fecha_entrada', fecha_salida)
    .gt('fecha_salida', fecha_entrada)

  if (ocupadasError) {
    console.error('reserva_cabanas fetch error:', ocupadasError.message)
    return botErrorResponse('INTERNAL_ERROR', 'Error chequeando ocupación.')
  }

  const idsOcupados = new Set((ocupadas ?? []).map((r) => r.cabana_id))

  const available = cabanasBot
    .filter((c) => !idsOcupados.has(c.id))
    .map((c) => ({ unit_id: c.id, nombre: c.nombre, pax_min: c.pax_min, pax_max: c.pax_max }))

  return new Response(JSON.stringify({ available }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

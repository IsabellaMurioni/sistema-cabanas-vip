// @ts-nocheck — Deno runtime; los tipos de Node/TS no aplican aquí
// Supabase Edge Function — bot-catalogo
// Fase 3 de la integración del bot de WhatsApp: endpoint de SOLO
// LECTURA que devuelve qué TIPOS de unidad existen en un complejo —
// catálogo, no disponibilidad. No recibe rango de fechas, no chequea
// ocupación contra `reserva_cabanas` — eso es trabajo de
// bot-disponibilidad (endpoint separado). Este sólo describe qué
// unidades existen y sus atributos estructurados (categoria/planta/
// pax), estén o no reservables hoy mismo.
//
// Alcance de complejo: igual que bot-disponibilidad después de la
// última actualización — NO hay ningún hardcode de slug acá tampoco.
// El scope real lo da `cabanas.habilitado_bot`, dato, no código.
//
// `activa` SÍ se expone en la respuesta de este endpoint — a
// propósito distinto de bot-disponibilidad, donde `activa` sólo se
// usa como filtro y nunca llega al JSON de salida. Acá el catálogo
// incluye unidades activas E inactivas (sin filtrar por `activa` en
// la query): el objetivo es describir qué tipos de unidad existen en
// el complejo, no qué está reservable ahora — una unidad fuera de
// servicio sigue siendo un tipo de unidad real que el bot puede
// necesitar nombrar/explicar, así que el catálogo la incluye y deja
// que quien lo use decida qué hacer con `activa: false`.
//
// Cliente de servicio: mismo motivo que bot-disponibilidad — todas
// las queries de este archivo usan el SupabaseClient creado con
// SUPABASE_SERVICE_ROLE_KEY.
//
// Sin BOT_API_KEY real configurado todavía (ver _shared/auth.ts) —
// hasta que se setee el secret, checkBotAuth rechaza TODAS las
// requests, sin excepción. No se setea ese secret acá.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBotAuth, authFailureMessage } from '../_shared/auth.ts'
import { botErrorResponse } from '../_shared/errors.ts'

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

  const { complejo_slug } = (body ?? {}) as Record<string, unknown>

  if (typeof complejo_slug !== 'string' || complejo_slug.length === 0) {
    return botErrorResponse('VALIDATION_ERROR', 'Falta complejo_slug.')
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

  // Sin filtro por `activa` acá — ver header: el catálogo lista TODOS
  // los tipos de unidad habilitados para el bot, activos e inactivos,
  // y expone `activa` tal cual para que quien use la respuesta decida.
  // Sin rango de fechas, sin query a `reserva_cabanas` — esto no mide
  // disponibilidad.
  const { data: cabanasBot, error: cabanasError } = await supabase
    .from('cabanas')
    .select('id, nombre, pax_min, pax_max, categoria, planta, activa')
    .eq('complejo_id', complejo.id)
    .eq('habilitado_bot', true)

  if (cabanasError) {
    console.error('cabanas fetch error:', cabanasError.message)
    return botErrorResponse('INTERNAL_ERROR', 'Error buscando las cabañas habilitadas.')
  }

  // `pax` — mismo cálculo JS-side (GREATEST de pax_min/pax_max) que ya
  // usa bot-disponibilidad, mismo motivo: PostgREST `.select()` no
  // admite expresiones SQL arbitrarias sin una vista/función nueva en
  // la base, fuera de alcance acá. `categoria`/`planta` pasan tal
  // cual, null incluido, para las filas que todavía no los tengan
  // cargados (038_cabanas_categoria_planta.sql).
  const catalogo = (cabanasBot ?? []).map((c) => ({
    unit_id: c.id,
    nombre: c.nombre,
    categoria: c.categoria,
    planta: c.planta,
    pax: Math.max(c.pax_min, c.pax_max),
    activa: c.activa,
  }))

  return new Response(JSON.stringify({ catalogo }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// @ts-nocheck — Deno runtime; los tipos de Node/TS no aplican aquí
// Soporte para el header `Idempotency-Key` sobre `bot_idempotency_keys`
// (034_bot_idempotencia_version.sql + 035_bot_idempotency_keys_nullable.sql
// — ver esas migraciones para el esquema). Fase 2 — infraestructura
// común, ningún endpoint real usa esto todavía.
//
// Patrón "claim-first" — por qué, y por qué el diseño anterior (dos
// funciones separadas, `checkIdempotency` ANTES de procesar y
// `storeIdempotencyResult` DESPUÉS) estaba mal: entre esas dos
// llamadas no había NADA atómico. Dos reintentos casi simultáneos de
// la MISMA Idempotency-Key nueva podían los dos ver "no existe
// todavía" (`checkIdempotency` → 'new'), los dos ejecutar la
// operación real, y recién chocar al guardar — para entonces el
// efecto real (p.ej. crear la reserva) ya pasó dos veces. Exactamente
// lo que la idempotencia existe para evitar.
//
// La solución es reclamar la key ANTES de ejecutar nada:
// `claimIdempotencyKey` hace un INSERT de una fila placeholder
// (`response_status`/`response_body` en NULL — ver 035, que afloja el
// NOT NULL de esas dos columnas para habilitar justo este estado
// "reclamada, todavía procesándose") como PRIMER paso. El `primary
// key` de `idempotency_key` hace que ese INSERT sea atómico a nivel
// de Postgres: si dos requests concurrentes intentan reclamar la
// misma key nueva, el motor garantiza que sólo UNO de los dos INSERTs
// gana — el otro recibe un unique_violation (23505) y puede
// averiguar qué pasó en vez de correr la operación real una segunda
// vez. El caller:
//
//   1. Llama `claimIdempotencyKey`.
//   2. Si devuelve 'claimed' → ejecuta la operación real, y LUEGO
//      llama `completeIdempotencyClaim` con el resultado (UPDATE
//      sobre la misma fila, nunca un segundo INSERT).
//   3. Si devuelve 'in_progress' → NO ejecuta nada — otra request
//      (posiblemente la misma, en otro intento de red) está
//      procesando ESTA MISMA request ahora mismo. Hay que decirle al
//      bot que reintente en un rato (REQUEST_IN_PROGRESS, ver
//      errors.ts), nunca re-ejecutar la operación.
//   4. Si devuelve 'conflict' → misma key, body DISTINTO
//      (IDEMPOTENCY_KEY_CONFLICT).
//   5. Si devuelve 'replay' → la operación ya se completó antes con
//      este mismo body — devolver responseStatus/responseBody tal
//      cual, sin reprocesar.
//
// Requisito duro (sin cambios desde el diseño anterior):
// `bot_idempotency_keys` tiene RLS habilitado con CERO policies (ver
// 034) — el `SupabaseClient` que se le pase a estas dos funciones
// tiene que estar creado con la SERVICE ROLE key (como ya hace
// check-reservas-vencidas/index.ts con SUPABASE_SERVICE_ROLE_KEY),
// nunca con la anon key. Con la anon key, cualquier insert/select/
// update acá va a fallar silenciosamente contra RLS (0 filas / error
// de permiso), no por un bug de este módulo.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 23505 = unique_violation en Postgres — el código que tira el
// INSERT de claimIdempotencyKey cuando otra fila ya ocupa ese
// idempotency_key (perdimos la carrera, o la key ya existía de
// antes). Cualquier OTRO código de error en ese INSERT se repropaga
// tal cual (throw), nunca se interpreta como "perdimos la carrera".
const POSTGRES_UNIQUE_VIOLATION_CODE = '23505'

export type IdempotencyClaimResult =
  | { status: 'claimed' } // el caller reclamó la key — debe ejecutar la operación real y después llamar completeIdempotencyClaim
  | { status: 'conflict' } // la key existe con un hash DISTINTO
  | { status: 'in_progress' } // la key existe, mismo hash, pero todavía no se completó (otra request la está procesando AHORA)
  | { status: 'replay'; responseStatus: number; responseBody: unknown } // la key existe, mismo hash, ya completada — devolver esto tal cual

// JSON.stringify con las keys de nivel superior ordenadas, para que
// el mismo body lógico con distinto orden de keys (algo que puede
// pasar según cómo el cliente HTTP del bot serialice) hashee IGUAL,
// en vez de generar un conflicto falso contra sí mismo. No es una
// normalización JSON canónica completa (no baja a objetos anidados)
// — alcanza para el caso real: bodies chatos de requests del bot. Si
// algún endpoint futuro necesita bodies anidados, esto hay que
// revisarlo entonces, no de antemano.
function normalizedStringify(body: unknown): string {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return JSON.stringify(body)
  }
  const sorted: Record<string, unknown> = {}
  for (const k of Object.keys(body as Record<string, unknown>).sort()) {
    sorted[k] = (body as Record<string, unknown>)[k]
  }
  return JSON.stringify(sorted)
}

export async function hashRequestBody(body: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(normalizedStringify(body))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Paso 1, SIEMPRE antes de ejecutar la operación real. Intenta
// reclamar la key con un INSERT placeholder (response_status/
// response_body en NULL). Si el INSERT gana, el caller tiene luz
// verde para proceder. Si pierde la carrera (23505), lee la fila que
// efectivamente quedó y decide entre 'conflict'/'in_progress'/'replay'.
export async function claimIdempotencyKey(
  supabase: SupabaseClient,
  idempotencyKey: string,
  requestBody: unknown,
): Promise<IdempotencyClaimResult> {
  const hash = await hashRequestBody(requestBody)

  const { error: insertError } = await supabase.from('bot_idempotency_keys').insert({
    idempotency_key: idempotencyKey,
    request_hash: hash,
    response_status: null,
    response_body: null,
  })

  if (!insertError) return { status: 'claimed' }

  if (insertError.code !== POSTGRES_UNIQUE_VIOLATION_CODE) throw insertError

  const { data, error: selectError } = await supabase
    .from('bot_idempotency_keys')
    .select('request_hash, response_status, response_body')
    .eq('idempotency_key', idempotencyKey)
    .single()

  if (selectError) throw selectError

  if (data.request_hash !== hash) return { status: 'conflict' }

  if (data.response_status === null) return { status: 'in_progress' }

  return { status: 'replay', responseStatus: data.response_status, responseBody: data.response_body }
}

// Paso 2, sólo después de 'claimed' y de ejecutar la operación real.
// UPDATE (nunca un segundo INSERT) sobre la fila placeholder que
// claimIdempotencyKey ya creó, completando el resultado para que el
// próximo reintento con la misma key lo encuentre vía 'replay'.
export async function completeIdempotencyClaim(
  supabase: SupabaseClient,
  idempotencyKey: string,
  responseStatus: number,
  responseBody: unknown,
): Promise<void> {
  const { error } = await supabase
    .from('bot_idempotency_keys')
    .update({ response_status: responseStatus, response_body: responseBody })
    .eq('idempotency_key', idempotencyKey)
  if (error) throw error
}

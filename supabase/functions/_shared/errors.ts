// @ts-nocheck — Deno runtime; los tipos de Node/TS no aplican aquí
// Taxonomía de error ÚNICA para todos los futuros endpoints del bot
// de WhatsApp (Fase 2 — infraestructura común, ningún endpoint real
// usa esto todavía). Un solo shape de respuesta siempre:
// {"error": {"code": "...", "message": "..."}}. Ningún endpoint debe
// filtrar un error crudo (de Postgres, de Deno, de Supabase) directo
// al bot — cada código mapea a un status HTTP fijo y a un mensaje
// propio, legible y estable, que no depende de la redacción interna
// de ningún error de infraestructura.

export type BotErrorCode =
  | 'UNAUTHORIZED' // 401 — falta o es inválido el bot key
  | 'VALIDATION_ERROR' // 400 — request malformada
  | 'NOT_FOUND' // 404 — la reserva/cabaña no existe, o está fuera del scope de esta conversación
  | 'OUT_OF_SCOPE' // 403 — la cabaña existe pero habilitado_bot = false
  | 'DOUBLE_BOOKING' // 409 — viola el EXCLUDE constraint de Fase 1 (Postgres 23P01)
  | 'STALE_VERSION' // 409 — el version/If-Match enviado no coincide con el actual (concurrencia optimista, Fase 2/034)
  | 'IDEMPOTENCY_KEY_CONFLICT' // 409 — misma Idempotency-Key, body distinto (hash no coincide)
  | 'REQUEST_IN_PROGRESS' // 409 — misma Idempotency-Key, mismo body, pero otra request YA la está procesando ahora mismo — pedirle al bot que reintente en un rato, nunca re-ejecutar la operación
  | 'FORBIDDEN_ACTION' // 403 — acción que la spec de Nacho marca como NO permitida para el perfil autónomo del bot
  | 'INTERNAL_ERROR' // 500 — catch-all

const STATUS_BY_CODE: Record<BotErrorCode, number> = {
  UNAUTHORIZED: 401,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  OUT_OF_SCOPE: 403,
  DOUBLE_BOOKING: 409,
  STALE_VERSION: 409,
  IDEMPOTENCY_KEY_CONFLICT: 409,
  REQUEST_IN_PROGRESS: 409,
  FORBIDDEN_ACTION: 403,
  INTERNAL_ERROR: 500,
}

export interface BotErrorBody {
  error: { code: BotErrorCode; message: string }
}

// Arma el par {status, body} sin construir un Response — útil cuando
// el caller necesita el status/body por separado (p.ej. para
// guardarlo en bot_idempotency_keys vía completeIdempotencyClaim, ver
// idempotency.ts) en vez de devolverlo directo.
export function botError(code: BotErrorCode, message: string): { status: number; body: BotErrorBody } {
  return {
    status: STATUS_BY_CODE[code],
    body: { error: { code, message } },
  }
}

// `extraHeaders` queda a cargo del caller (p.ej. los headers CORS que
// ya usa check-reservas-vencidas/index.ts) — este módulo no asume
// ningún header fijo más allá de Content-Type.
export function botErrorResponse(code: BotErrorCode, message: string, extraHeaders: HeadersInit = {}): Response {
  const { status, body } = botError(code, message)
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

// 23P01 = exclusion_violation en Postgres — el código que tira el
// EXCLUDE constraint de reserva_cabanas (Fase 1,
// 033_reserva_cabanas_exclusion.sql) cuando dos reservas chocan en la
// misma cabaña/fechas. Nunca se debe dejar pasar ese código/mensaje
// crudo de Postgres al bot — siempre traducido a DOUBLE_BOOKING acá.
export const POSTGRES_EXCLUSION_VIOLATION_CODE = '23P01'

export function isExclusionViolation(pgError: { code?: string } | null | undefined): boolean {
  return pgError?.code === POSTGRES_EXCLUSION_VIOLATION_CODE
}

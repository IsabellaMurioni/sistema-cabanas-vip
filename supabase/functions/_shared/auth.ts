// @ts-nocheck — Deno runtime; los tipos de Node/TS no aplican aquí
// Chequeo de auth para los futuros endpoints del bot de WhatsApp
// (Fase 2 — infraestructura común, ningún endpoint real usa esto
// todavía). Valida el header `Authorization: Bearer <token>` contra
// el secret `BOT_API_KEY`, seteado como Edge Function Secret — mismo
// patrón que `EMAILJS_SERVICE_ID`/etc. en
// check-reservas-vencidas/index.ts (`supabase secrets set`). Sin
// valor real todavía: esto es sólo la lógica de chequeo, nada la
// llama aún — setear el secret de verdad es una decisión aparte, para
// cuando se esté listo para dar acceso de producción.

export type AuthResult =
  | { ok: true }
  | {
      ok: false
      reason: 'missing_header' | 'malformed_header' | 'invalid_key' | 'server_misconfigured'
    }

// Compara dos strings sin cortar la iteración apenas difiere el
// primer char — evita que el tiempo de respuesta filtre cuánto del
// token entrante coincide con el real. El chequeo de longitud previo
// es en sí mismo un timing side-channel menor (longitud distinta ≠
// mismo tiempo que longitud igual), pero es el trade-off estándar:
// comparar tokens de longitud arbitraria a tiempo verdaderamente
// constante requeriría hashear ambos primero a un largo fijo, que es
// más de lo que este caso necesita.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export function checkBotAuth(req: Request): AuthResult {
  const header = req.headers.get('Authorization')
  if (!header) return { ok: false, reason: 'missing_header' }

  const match = header.match(/^Bearer\s+(.+)$/)
  if (!match) return { ok: false, reason: 'malformed_header' }

  const token = match[1]
  const expected = Deno.env.get('BOT_API_KEY')
  // Si el secret no está seteado, NUNCA se trata como "cualquier
  // token vale" — se trata como error de configuración del servidor,
  // no como autorización exitosa.
  if (!expected) return { ok: false, reason: 'server_misconfigured' }

  if (!timingSafeEqual(token, expected)) return { ok: false, reason: 'invalid_key' }

  return { ok: true }
}

// Mapea cada `reason` de un AuthResult fallido al código/mensaje de
// la taxonomía de errores compartida — así cada endpoint no tiene que
// reimplementar esta traducción. `server_misconfigured` es el único
// caso que no es realmente culpa del caller (el bot mandó todo bien,
// el problema es que no hay BOT_API_KEY seteado del lado del
// servidor) — se devuelve como INTERNAL_ERROR, no UNAUTHORIZED, para
// no confundir "tu key está mal" con "nosotros rompimos algo".
export function authFailureMessage(result: Extract<AuthResult, { ok: false }>): {
  code: 'UNAUTHORIZED' | 'INTERNAL_ERROR'
  message: string
} {
  switch (result.reason) {
    case 'missing_header':
      return { code: 'UNAUTHORIZED', message: 'Falta el header Authorization.' }
    case 'malformed_header':
      return { code: 'UNAUTHORIZED', message: 'El header Authorization debe tener el formato "Bearer <token>".' }
    case 'invalid_key':
      return { code: 'UNAUTHORIZED', message: 'Token inválido.' }
    case 'server_misconfigured':
      return { code: 'INTERNAL_ERROR', message: 'BOT_API_KEY no está configurado del lado del servidor.' }
  }
}

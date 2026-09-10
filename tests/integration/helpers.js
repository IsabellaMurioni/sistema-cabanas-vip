// Helpers compartidos por los tests de integración (tests/integration/)
// — NO matchea el glob de test files (vitest.integration.config.js
// sólo incluye *.test.js), así que esto es un módulo normal, importable
// desde cualquier *.test.js de esta carpeta.

export const AUTOTEST = 'AUTOTEST_'

// Sufijo corto, único por invocación — evita colisiones de `codigo`
// (unique por complejo) entre corridas sucesivas, incluso si una
// corrida anterior falló antes de limpiar sus propias filas.
export function uniqueSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function autotestNombre(etiqueta) {
  return `${AUTOTEST}${etiqueta} ${uniqueSuffix()}`
}

export function autotestDetalle(etiqueta) {
  return `${AUTOTEST}${etiqueta} ${uniqueSuffix()}`
}

export function autotestCierreNombre(etiqueta) {
  return `${AUTOTEST}${etiqueta} ${uniqueSuffix()}`
}

// Código de reserva de prueba — el formato real de la app es "A2524"
// etc. (ver fetchNextCode en ReservaForm.jsx), pero un prefijo Z + un
// sufijo único alcanza para no colisionar con códigos reales ni con
// otra corrida de tests, sin tener que imitar la secuencia real.
export function autotestCodigo() {
  return `Z${uniqueSuffix()}`.toUpperCase().slice(0, 16)
}

export async function getComplejoIdBySlug(client, slug) {
  const { data, error } = await client.from('complejos').select('id').eq('slug', slug).single()
  if (error || !data) {
    throw new Error(
      `[tests/integration/helpers] No se encontró el complejo con slug "${slug}" en staging` +
      (error ? `: ${error.message}` : ' (0 filas).')
    )
  }
  return data.id
}

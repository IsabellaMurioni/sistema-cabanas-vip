// @ts-nocheck — Deno runtime; los tipos de Node/TS no aplican aquí
// Normalización de teléfono para matchear el número que manda
// WhatsApp contra `reservas.celular` — Fase 3 de la integración del
// bot (este módulo es standalone, ningún endpoint lo usa todavía).
//
// `celular` es texto libre sin ninguna validación de formato (ver
// 001_schema.sql — `celular text`, sin constraint ni índice). Los
// datos reales de producción muestran una mezcla de:
//   - números locales de 10 dígitos tal cual ("1157199735")
//   - números internacionales completos con el marcador de celular
//     argentino ("5492323319887" = 54 + 9 + 2323319887)
//   - un par de entradas mal formadas donde alguien le agregó el
//     código de país a un número que TODAVÍA tenía el 0 de discado
//     local sin sacar ("5403462671091" = 54 + 0346... — el 0 nunca
//     se sacó antes de prepender el 54)
// Esta normalización converge todo eso a la MISMA forma canónica
// (10 dígitos, sin código de país, sin marcador de celular, sin 0 de
// discado) para que el mismo teléfono físico compare igual sin
// importar en qué formato se haya tipeado.
//
// Los 3 strips (54 / 9 / 0) son deliberadamente NO un loop — cada uno
// se aplica A LO SUMO UNA VEZ, en este orden exacto, y sólo si el
// prefijo todavía está presente después del paso anterior. Repetir
// en loop sería incorrecto: un número local real puede empezar con
// '0' (de por sí, antes de cualquier strip) y NO hay que comérselo
// dos veces, ni confundir un '9' que sea parte real del número local
// con el marcador de celular si ya se sacó el 54 de un número que en
// realidad no lo tenía.
//
// Chequeo defensivo final: si después de los 3 strips el resultado
// NO tiene exactamente 10 dígitos, se devuelve '' en vez del
// resultado parcial/mal formado. Esto lo pidió explícitamente Nacho
// (el desarrollador del bot), que advirtió contra sacar/agregar '9'
// o '15' a ciegas sin una validación real detrás — hay formatos que
// esta normalización basada en strips no anticipa (p.ej. un '15' de
// código de área metido en el medio del número, no al principio), y
// ante un formato que no reconocemos preferimos tratarlo como "no
// matchea nada" (string vacío, que nunca va a coincidir con ningún
// celular real de 10 dígitos) antes que arriesgar un falso positivo
// — devolver un número que PARECE válido pero en realidad es la
// normalización incorrecta de un formato distinto al que asumimos.
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return ''

  let digits = raw.replace(/\D/g, '')

  if (digits.startsWith('54')) digits = digits.slice(2)
  if (digits.startsWith('9')) digits = digits.slice(1)
  if (digits.startsWith('0')) digits = digits.slice(1)

  if (digits.length !== 10) return ''

  return digits
}

// Casos de verificación manual (no hay harness de test Deno en este
// proyecto — mismo criterio que check-reservas-vencidas y el resto de
// _shared/*.ts, ningún Edge Function tiene tests hoy):
//
//   normalizePhone("1157199735")          → "1157199735"
//   normalizePhone("5492323319887")       → "2323319887"
//   normalizePhone("5403462671091")       → "3462671091"
//   normalizePhone("")                    → ""
//   normalizePhone(null)                  → ""
//   normalizePhone("549 11 5719-9735")    → "1157199735"
//   normalizePhone("123")                 → "" (no da 10 dígitos tras los strips — formato no reconocido, nunca un falso positivo)

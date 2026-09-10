// ============================================================
// Clientes de Supabase para tests de integración (tests/integration/)
// y, más adelante, E2E. Los tests unitarios (tests/unit/) NO usan este
// archivo — son lógica pura, sin red ni DB.
//
// ⚠️  SIEMPRE STAGING. Este archivo NUNCA define una URL/key propia —
// lee exactamente las mismas variables que ya usa la app
// (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, cargadas desde
// .env.local, que en este repo apuntan al proyecto de staging). No
// hay ningún .env.production ni credencial de producción en este
// repo — si alguna vez aparece uno, este archivo NO debe leerlo.
//
// Las políticas RLS de este proyecto siempre exigen una sesión
// autenticada (auth.uid()) — la anon key sola no alcanza para leer ni
// escribir nada real. Por eso los tests de integración necesitan uno
// de dos usuarios de prueba de staging, cuyas credenciales se leen de
// variables de entorno locales — NUNCA hardcodeadas ni committeadas:
//
//   - TEST_USER_EMAIL / TEST_USER_PASSWORD
//     Membresía en LOS 5 COMPLEJOS. Usado para todo lo que necesita
//     escribir/leer en varios complejos a la vez (filtrado por
//     complejo_id, validaciones DB-dependientes) y para limpiar lo que
//     crean otros tests (incluidos los del usuario limitado).
//
//   - TEST_USER_LIMITED_EMAIL / TEST_USER_LIMITED_PASSWORD
//     Membresía ÚNICAMENTE en cabanas-vip (fila de membresias ya
//     insertada de antemano — este archivo no la crea ni la asume,
//     sólo autentica). Usado exclusivamente por
//     tests/integration/rls-enforcement.test.js para probar que RLS
//     bloquea a nivel de base, no sólo el filtrado de la app.
// ============================================================
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function assertEnv() {
  if (!url || !anonKey) {
    throw new Error(
      '[tests/setup/supabaseTestClient] Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Copiá .env.example a .env.local con las credenciales de STAGING antes de correr tests de integración.'
    )
  }
}

// Cliente anon, sin autenticar — RLS le va a esconder prácticamente
// todo. Sirve como línea de base para confirmar que "sin sesión, cero
// filas", si algún test lo necesita explícitamente.
export function createAnonClient() {
  assertEnv()
  return createClient(url, anonKey)
}

// Instancia SIEMPRE un cliente nuevo por sesión — nunca se reutiliza
// un cliente ya autenticado como otro usuario. Si se compartiera una
// sola instancia entre getFullAccessClient()/getLimitedAccessClient(),
// la segunda sesión pisaría la primera, y como Vitest puede correr
// archivos de test en paralelo, eso produciría contaminación cruzada
// silenciosa entre suites.
async function signIn(email, password, etiqueta) {
  assertEnv()
  if (!email || !password) {
    throw new Error(
      `[tests/setup/supabaseTestClient] Faltan las credenciales del usuario de test "${etiqueta}". ` +
      'Definilas en .env.local (nunca en un archivo committeado) y volvé a correr. ' +
      'Ver TESTING.md para la lista completa de variables necesarias.'
    )
  }
  const client = createClient(url, anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(`[tests/setup/supabaseTestClient] No se pudo autenticar como "${etiqueta}": ${error.message}`)
  }
  return client
}

// Usuario de test con membresía en los 5 complejos.
export function getFullAccessClient() {
  return signIn(process.env.TEST_USER_EMAIL, process.env.TEST_USER_PASSWORD, 'TEST_USER (acceso completo)')
}

// Usuario de test con membresía únicamente en cabanas-vip.
export function getLimitedAccessClient() {
  return signIn(
    process.env.TEST_USER_LIMITED_EMAIL,
    process.env.TEST_USER_LIMITED_PASSWORD,
    'TEST_USER_LIMITED (sólo cabanas-vip)'
  )
}

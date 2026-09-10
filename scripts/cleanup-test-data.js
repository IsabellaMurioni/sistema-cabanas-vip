// ============================================================
// scripts/cleanup-test-data.js
//
// Red de seguridad: barre TODA la data de prueba (de TODOS los
// complejos) identificable por la convención AUTOTEST_ (ver
// TESTING.md), para lo que haya quedado de una corrida fallida — cada
// test de integración ya se borra a sí mismo en su propio afterEach,
// esto es sólo el backstop.
//
// 1. Reservas (nombre_apellido empieza con "AUTOTEST_"). Replica
//    exactamente la misma secuencia que ya usa la UI al eliminar una
//    reserva a mano (src/pages/Reservas.jsx, handleEliminar):
//      a. Borra los comprobantes subidos a Storage (sena1/sena2/pago
//         en cabaña), si los hay.
//      b. Borra las filas de caja_banco/caja_mercado_pago ligadas por
//         reserva_codigo (Cabañas VIP).
//      c. Borra las filas de caja_silvia cuyo detalle menciona el
//         código (Cabañas VIP).
//      d. Borra la reserva. movimientos_caja (complejos NO-VIP) se
//         borra solo por el ON DELETE CASCADE de reserva_id — no hace
//         falta tocarlo a mano acá.
// 2. movimientos_caja creados DIRECTAMENTE (no vía una reserva, ya
//    cubiertos por el cascade del paso 1) — identificados por
//    `detalle` empezando con "AUTOTEST_".
// 3. cierres_caja (nombre empieza con "AUTOTEST_") — se borran
//    DESPUÉS de los movimientos_caja, aunque no dependen de ellos, para
//    mantener un único orden predecible; cierre_reconciliacion/
//    cierre_reparto_ganancia cascadean solos (ON DELETE CASCADE de
//    cierre_id, migración 015/018).
//
// ⚠️  STAGING ONLY. Corre contra lo que sea que apunten
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env.local — las
// mismas variables que ya usa la app, nunca credenciales nuevas. Este
// repo no tiene ningún .env.production ni service-role key.
//
// ⚠️  RLS: la anon key sola no alcanza para leer/borrar nada — cada
// política de este proyecto exige una sesión autenticada con
// membresía en el complejo de la fila. Este script necesita
// TEST_USER_EMAIL / TEST_USER_PASSWORD (variables de entorno locales,
// nunca committeadas) de un usuario de staging con membresía en LOS 5
// COMPLEJOS — si le falta membresía en alguno, las reservas de prueba
// de ESE complejo quedan invisibles para el script y no se borran.
//
// Uso:
//   TEST_USER_EMAIL=... TEST_USER_PASSWORD=... npm run cleanup:test-data
//
// (El script "cleanup:test-data" de package.json ya carga .env.local
// con `node --env-file=.env.local`; las credenciales del usuario de
// test se pasan aparte, nunca se guardan en un archivo del repo.)
// ============================================================
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const testEmail = process.env.TEST_USER_EMAIL
const testPassword = process.env.TEST_USER_PASSWORD

if (!url || !anonKey) {
  console.error(
    '[cleanup-test-data] Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.\n' +
    'Corré este script con: node --env-file=.env.local scripts/cleanup-test-data.js\n' +
    '(o simplemente: npm run cleanup:test-data)'
  )
  process.exit(1)
}
if (!testEmail || !testPassword) {
  console.error(
    '[cleanup-test-data] Faltan TEST_USER_EMAIL / TEST_USER_PASSWORD.\n' +
    'RLS exige una sesión autenticada — no alcanza con la anon key sola.\n' +
    'Definí un usuario de staging con membresía en los 5 complejos y pasá\n' +
    'sus credenciales como variables de entorno (nunca las guardes en un\n' +
    'archivo del repo). Ejemplo:\n' +
    '  TEST_USER_EMAIL=test@ejemplo.com TEST_USER_PASSWORD=... npm run cleanup:test-data'
  )
  process.exit(1)
}

const supabase = createClient(url, anonKey)

async function main() {
  const { error: authError } = await supabase.auth.signInWithPassword({ email: testEmail, password: testPassword })
  if (authError) {
    console.error('[cleanup-test-data] No se pudo autenticar:', authError.message)
    process.exit(1)
  }

  // --- 1. Reservas -------------------------------------------------
  const { data: reservas, error: fetchError } = await supabase
    .from('reservas')
    .select('id, codigo, complejo_id, nombre_apellido, sena1_comprobante, sena2_comprobante, pago_cabana_comprobante')
    .ilike('nombre_apellido', 'AUTOTEST_%')

  if (fetchError) {
    console.error('[cleanup-test-data] Error buscando reservas de prueba:', fetchError.message)
    process.exit(1)
  }

  if (!reservas || reservas.length === 0) {
    console.log('[cleanup-test-data] No hay reservas AUTOTEST_ para borrar.')
  } else {
    console.log(`[cleanup-test-data] Encontradas ${reservas.length} reservas de prueba. Borrando...`)

    for (const r of reservas) {
      const paths = [r.sena1_comprobante, r.sena2_comprobante, r.pago_cabana_comprobante].filter(Boolean)
      if (paths.length > 0) {
        await supabase.storage.from('comprobantes').remove(paths)
      }

      await Promise.all([
        supabase.from('caja_banco').delete().eq('reserva_codigo', r.codigo).eq('complejo_id', r.complejo_id),
        supabase.from('caja_mercado_pago').delete().eq('reserva_codigo', r.codigo).eq('complejo_id', r.complejo_id),
        supabase.from('caja_silvia').delete().ilike('detalle', `%${r.codigo}%`).eq('complejo_id', r.complejo_id),
      ])

      // movimientos_caja (complejos NO-VIP) se borra solo, vía
      // ON DELETE CASCADE de reserva_id (migración 016).
      const { error: delError } = await supabase.from('reservas').delete().eq('id', r.id)
      if (delError) {
        console.error(`[cleanup-test-data]   ✕ ${r.codigo} (${r.nombre_apellido}): ${delError.message}`)
      } else {
        console.log(`[cleanup-test-data]   ✓ reserva ${r.codigo} (${r.nombre_apellido}) borrada`)
      }
    }
  }

  // --- 2. movimientos_caja creados directamente (no vía una reserva) --
  const { data: movimientos, error: errMovFetch } = await supabase
    .from('movimientos_caja')
    .select('id, detalle')
    .ilike('detalle', 'AUTOTEST_%')

  if (errMovFetch) {
    console.error('[cleanup-test-data] Error buscando movimientos_caja de prueba:', errMovFetch.message)
  } else if (!movimientos || movimientos.length === 0) {
    console.log('[cleanup-test-data] No hay movimientos_caja AUTOTEST_ para borrar.')
  } else {
    const { error: delMovError } = await supabase.from('movimientos_caja').delete().in('id', movimientos.map((m) => m.id))
    if (delMovError) {
      console.error('[cleanup-test-data]   ✕ Error borrando movimientos_caja de prueba:', delMovError.message)
    } else {
      console.log(`[cleanup-test-data]   ✓ ${movimientos.length} movimientos_caja de prueba borrados`)
    }
  }

  // --- 3. cierres_caja (cascadea a cierre_reconciliacion/reparto) ----
  const { data: cierres, error: errCierresFetch } = await supabase
    .from('cierres_caja')
    .select('id, nombre')
    .ilike('nombre', 'AUTOTEST_%')

  if (errCierresFetch) {
    console.error('[cleanup-test-data] Error buscando cierres_caja de prueba:', errCierresFetch.message)
  } else if (!cierres || cierres.length === 0) {
    console.log('[cleanup-test-data] No hay cierres_caja AUTOTEST_ para borrar.')
  } else {
    const { error: delCierresError } = await supabase.from('cierres_caja').delete().in('id', cierres.map((c) => c.id))
    if (delCierresError) {
      console.error('[cleanup-test-data]   ✕ Error borrando cierres_caja de prueba:', delCierresError.message)
    } else {
      console.log(`[cleanup-test-data]   ✓ ${cierres.length} cierres_caja de prueba borrados (reconciliación/reparto cascadearon solos)`)
    }
  }

  console.log('[cleanup-test-data] Listo.')
}

main()

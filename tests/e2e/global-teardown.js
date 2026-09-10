// Global teardown (Fase 5.4): corre scripts/cleanup-test-data.js
// después de la suite completa — pase o falle — para que ningún dato
// AUTOTEST_ sobreviva a una corrida. Complementa (no reemplaza) la
// limpieza puntual que cada spec ya hace de lo suyo.
import { spawnSync } from 'node:child_process'

export default async function globalTeardown() {
  console.log('[global-teardown] Corriendo cleanup:test-data...')
  const result = spawnSync('node', ['scripts/cleanup-test-data.js'], {
    stdio: 'inherit',
    env: process.env, // hereda TEST_USER_EMAIL/PASSWORD ya cargados por el wrapper de test:e2e
  })
  if (result.status !== 0) {
    console.error('[global-teardown] cleanup:test-data terminó con error — revisar staging a mano.')
  }
}

// Config separada de vite.config.js — tests de integración
// (tests/integration/) pegan contra la base REAL de staging, así que
// corren aparte de la suite rápida de unit tests y nunca como parte de
// `npm test`. Timeout más largo por test porque hacen red real.
//
// `process.loadEnvFile` es una red de seguridad para cuando este
// config se invoca directo (ej. `npx vitest --config
// vitest.integration.config.js`, sin pasar por
// `npm run test:integration`, que ya carga .env.local vía `node
// --env-file` en scripts/run-integration-tests.js) — Vite excluye
// .env.local de su propia carga de env cuando mode==='test' (el que
// usa Vitest por default), así que sin esto VITE_SUPABASE_URL/ANON_KEY
// llegarían undefined en ese escenario.
try { process.loadEnvFile('.env.local') } catch { /* no existe, seguir */ }

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node', // no se renderiza nada, no hace falta jsdom
    globals: true,
    include: ['tests/integration/**/*.test.js'],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})

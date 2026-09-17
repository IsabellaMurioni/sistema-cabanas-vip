import { defineConfig, devices } from '@playwright/test'

// ============================================================
// Playwright config — Fase 5.4.
//
// ⚠️  STAGING ONLY. El dev server que arranca `webServer` lee
// .env.local (VITE_SUPABASE_URL/ANON_KEY), que en este repo apunta a
// staging — nunca producción.
//
// workers: 1 + fullyParallel: false + retries: 0 a propósito: estos
// specs pegan contra una base de staging COMPARTIDA y real — dos
// specs corriendo en simultáneo (o un retry silencioso) podrían
// pisarse datos o dar falsos positivos/negativos. Un solo worker,
// sin paralelismo, sin reintentos automáticos.
// ============================================================
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'html',
  globalSetup: './tests/e2e/global-setup.js',
  globalTeardown: './tests/e2e/global-teardown.js',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      // vip.spec.js hace su propio login real por UI — arranca SIN
      // storageState (navegador deslogueado), a propósito.
      name: 'fresh-login',
      testMatch: /vip\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // El resto reutiliza la sesión ya guardada por global-setup.js.
      name: 'authenticated',
      testMatch: /(mimmo|non-vip-smoke|fechas-historicas)\.spec\.js/,
      use: { ...devices['Desktop Chrome'], storageState: 'tests/e2e/.auth/full-access.json' },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    // SIEMPRE false, no sólo en CI: un dev server viejo en el puerto
    // 5173 (arrancado antes de un cambio a .env.local) sirve un bundle
    // con VITE_SUPABASE_URL/ANON_KEY viejos — Vite no hot-reloadea
    // archivos .env, hace falta reiniciar el proceso. reuseExistingServer
    // en true reusaría ese server viejo en silencio (confirmado durante
    // el desarrollo de esta suite: pisó el login real con una anon key
    // vencida). Server siempre nuevo, aunque sea más lento.
    reuseExistingServer: false,
  },
})

// Global setup (Fase 5.4): loguea UNA VEZ por UI real con el usuario de
// test de acceso completo (TEST_USER_EMAIL/PASSWORD, membresía en los 5
// complejos) y guarda el storageState — lo reutilizan mimmo.spec.js y
// non-vip-smoke.spec.js (proyecto "authenticated" de playwright.config.js).
// vip.spec.js NO reutiliza esto a propósito: hace su propio login real
// por UI, para que ese flujo también tenga cobertura E2E genuina.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

export default async function globalSetup(config) {
  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD
  if (!email || !password) {
    throw new Error(
      '[global-setup] Faltan TEST_USER_EMAIL / TEST_USER_PASSWORD en .env.local. ' +
      'Ver TESTING.md.'
    )
  }

  const baseURL = config.projects[0].use.baseURL || 'http://localhost:5173'
  const browser = await chromium.launch()
  const page = await browser.newPage()

  await page.goto(`${baseURL}/login`)
  // Login.jsx no asocia sus <label> con los inputs (ni htmlFor/id ni
  // wrapping) — no hay accessible name para getByLabel. Cada input es
  // el único de su type en la página, así que alcanza con eso.
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()

  // Espera a salir de /login (redirect real tras el login exitoso).
  // Timeout generoso (30s, no 15s): este es el primer request contra un
  // dev server recién arrancado (reuseExistingServer: false siempre —
  // ver playwright.config.js), y el cold-start de Vite (pre-bundling de
  // dependencias en el primer hit real) puede comerse varios segundos
  // por sí solo, sin que sea un problema de la app ni del login en sí
  // (confirmado reproduciendo el mismo login a mano contra un server ya
  // tibio: entra en menos de 1s).
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })
  // Espera a que el layout autenticado esté realmente montado (el
  // switcher de complejo sólo aparece una vez que cargó la sesión y el
  // complejo activo), no sólo a que cambió la URL.
  await page.getByTestId('complejo-switcher-toggle').waitFor({ state: 'visible', timeout: 30000 })

  const authDir = path.join(process.cwd(), 'tests/e2e/.auth')
  fs.mkdirSync(authDir, { recursive: true })
  await page.context().storageState({ path: path.join(authDir, 'full-access.json') })

  await browser.close()
}

// Fase 5.4 — flujo completo E2E para Cabañas VIP.
//
// Único spec que NO reutiliza storageState (proyecto "fresh-login" en
// playwright.config.js) — hace login real por UI a propósito, para que
// ese flujo también tenga cobertura.
//
// Todo lo que crea lleva el prefijo AUTOTEST_ (ver tests/integration/
// helpers.js) y se borra al final por UI — el global-teardown corre
// igual como red de seguridad.
import { test, expect } from '@playwright/test'
import { autotestNombre } from '../integration/helpers.js'

const EMAIL = process.env.TEST_USER_EMAIL
const PASSWORD = process.env.TEST_USER_PASSWORD

// El valor de un tile de Ganancias viene formateado es-AR ("$1.234.567")
// — sólo dígitos y signo quedan tras sacar todo lo demás.
function parseArs(texto) {
  return Number((texto || '').replace(/[^\d-]/g, '')) || 0
}

test('VIP — flujo completo end-to-end', async ({ page }) => {
  const nombreCliente = autotestNombre('VIP')
  let reservaId

  await test.step('1. Login real por UI', async () => {
    if (!EMAIL || !PASSWORD) {
      throw new Error('[vip.spec] Faltan TEST_USER_EMAIL / TEST_USER_PASSWORD en .env.local.')
    }
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(EMAIL)
    await page.locator('input[type="password"]').fill(PASSWORD)
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 })
    await expect(page.getByTestId('complejo-switcher-toggle')).toBeVisible()
  })

  await test.step('2. Switch a / confirmar Cabañas VIP', async () => {
    await page.getByTestId('complejo-switcher-toggle').click()
    await page.getByTestId('complejo-option-cabanas-vip').click()
    await expect(page.getByTestId('complejo-activo-nombre')).toHaveText('Cabañas VIP')
    await expect(page).toHaveURL(/\/cabanas-vip\//)
  })

  let ingresosArsAntes
  await test.step('2b. Capturar Ingresos ARS de Ganancias ANTES de crear la reserva', async () => {
    await page.goto('/cabanas-vip/ganancias')
    const texto = await page.getByTestId('tile-ingresos-ars-value').textContent()
    ingresosArsAntes = parseArs(texto)
  })

  await test.step('3. Crear reserva AUTOTEST_ con precio y seña por transferencia bancaria', async () => {
    await page.goto('/cabanas-vip/reservas/nueva')
    await page.getByTestId('input-nombre-apellido').fill(nombreCliente)
    await page.getByTestId('input-email').fill('autotest@example.com')
    await page.getByTestId('select-cabana').selectOption({ label: 'Bahama' })
    // Fechas bien en el futuro, dentro del período "en adelante" seedeado
    // (mínimo 2 noches) — 4 noches para no chocar con ningún mínimo más
    // alto de otros períodos, sea cual sea el estado real de precios.
    await page.getByTestId('input-fecha-entrada').fill('2027-04-10')
    await page.getByTestId('input-fecha-salida').fill('2027-04-14')
    // Precio fijo explícito — no depender de si hay precios reales
    // cargados para esa fecha en periodos_precios/precios_pax.
    await page.getByTestId('input-monto-total').fill('50000')
    await page.getByTestId('input-sena1-monto').fill('20000')
    await page.getByTestId('select-sena1-tipo').selectOption('Banco')
    await page.getByTestId('btn-submit-reserva').click()

    await page.waitForURL(/\/cabanas-vip\/reservas\/[0-9a-f-]{36}$/, { timeout: 15000 })
    reservaId = page.url().split('/').pop()
    expect(reservaId).toBeTruthy()
  })

  await test.step('4. Intentar un pago que excede el precio — la UI lo bloquea', async () => {
    await page.goto(`/cabanas-vip/reservas/${reservaId}/pago`)
    // Ya pagado: 20000. Precio: 50000. Saldo: 30000. Se intenta 40000 — excede.
    await page.getByTestId('input-pago-monto').fill('40000')
    await page.getByTestId('btn-submit-pago').click()

    // La constraint nativa (setCustomValidity) frena el submit ANTES de
    // que el handler de React llegue a navegar — sigue en /pago.
    await expect(page).toHaveURL(new RegExp(`/cabanas-vip/reservas/${reservaId}/pago$`))
    const validationMessage = await page.getByTestId('input-pago-monto').evaluate((el) => el.validationMessage)
    expect(validationMessage).toContain('saldo pendiente')
  })

  await test.step('5. Ingresos ARS de Ganancias AHORA refleja exactamente el delta de la seña', async () => {
    await page.goto('/cabanas-vip/ganancias')
    const texto = await page.getByTestId('tile-ingresos-ars-value').textContent()
    const ingresosArsDespues = parseArs(texto)
    // Sólo se afirma el DELTA — el total absoluto cambia con el tiempo
    // por datos reales de staging.
    expect(ingresosArsDespues - ingresosArsAntes).toBe(20000)
  })

  await test.step('6. La seña aparece en la pestaña Banco de Caja', async () => {
    await page.goto('/cabanas-vip/caja')
    await page.getByRole('button', { name: 'Banco', exact: true }).click()
    const fila = page.locator('tr', { hasText: nombreCliente })
    await expect(fila).toBeVisible()
    await expect(fila).toContainText('20.000')
  })

  await test.step('7. Eliminar la reserva por UI — el movimiento de Caja vinculado desaparece también', async () => {
    await page.goto('/cabanas-vip/reservas')
    await page.getByPlaceholder('Buscar por nombre, código, email o cabaña...').fill(nombreCliente)
    const filaReserva = page.locator('tr', { hasText: nombreCliente })
    await expect(filaReserva).toBeVisible()

    page.once('dialog', (d) => d.accept())
    await filaReserva.getByRole('button', { name: 'Eliminar' }).click()
    await expect(filaReserva).toHaveCount(0)

    await page.goto('/cabanas-vip/caja')
    await page.getByRole('button', { name: 'Banco', exact: true }).click()
    const filaCaja = page.locator('tr', { hasText: nombreCliente })
    await expect(filaCaja).toHaveCount(0)
  })
})

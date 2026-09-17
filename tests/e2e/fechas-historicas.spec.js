// Restricción de fechas — la app ya NO bloquea crear una reserva con
// fecha de entrada en el pasado (para poder cargar datos históricos).
// Esa restricción vivía ENTERAMENTE en el JS del cliente
// (ReservaForm.jsx: un `if` en handleSubmit + el atributo HTML `min`
// del input, sólo al crear) — nunca fue un CHECK de base ni una
// política de RLS, así que la ÚNICA forma real de probar que el bug
// está arreglado es manejando el form real (acá) — un test de
// integración que hable directo con supabase-js pasaría igual antes y
// después del fix, porque nunca pasaba por ese código.
//
// El candado de período ya cerrado (fechaEstaCerrada/cierreQueContiene)
// no se tocó en este cambio — sigue exactamente igual, ya cubierto a
// fondo en tests/integration/validations.test.js (incluida una
// variante específica con fecha histórica) — no se repite acá con un
// spec E2E completo porque el código que lo implementa no cambió.
//
// Reutiliza el storageState del usuario de acceso completo (proyecto
// "authenticated" de playwright.config.js).
import { test, expect } from '@playwright/test'
import { autotestNombre } from '../integration/helpers.js'

test('Cabañas VIP — crear una reserva con fecha de entrada en el pasado ya no está bloqueado', async ({ page }) => {
  const nombreCliente = autotestNombre('Historica VIP')

  await test.step('Switch a Cabañas VIP', async () => {
    await page.goto('/')
    await page.getByTestId('complejo-switcher-toggle').click()
    await page.getByTestId('complejo-option-cabanas-vip').click()
    await expect(page).toHaveURL(/\/cabanas-vip\//)
  })

  let reservaId
  await test.step('Crear reserva AUTOTEST_ con fecha de entrada de 2015 — antes bloqueado, ahora debe funcionar', async () => {
    await page.goto('/cabanas-vip/reservas/nueva')
    await page.getByTestId('input-nombre-apellido').fill(nombreCliente)
    await page.getByTestId('input-email').fill('autotest@example.com')
    await page.getByTestId('select-cabana').selectOption({ label: 'Bahama' })
    await page.getByTestId('input-fecha-entrada').fill('2015-02-10')
    await page.getByTestId('input-fecha-salida').fill('2015-02-14')
    // Sin período de precios cubriendo 2015 — precio fijo explícito,
    // igual que hace vip.spec.js para fechas reales.
    await page.getByTestId('input-monto-total').fill('50000')
    // Estado real de una estadía histórica que ya sucedió — no queda
    // colgada como "Pendiente" a merced del cron de vencimiento.
    await page.getByTestId('select-estado').selectOption('Finalizada')
    await page.getByTestId('btn-submit-reserva').click()

    // Antes de este fix, el atributo `min` del input y el `if` de
    // handleSubmit bloqueaban esto — la navegación jamás llegaba a
    // pasar. Ahora sí debe navegar a la reserva recién creada.
    await page.waitForURL(/\/cabanas-vip\/reservas\/[0-9a-f-]{36}$/, { timeout: 15000 })
    reservaId = page.url().split('/').pop()
    expect(reservaId).toBeTruthy()
  })

  await test.step('Limpieza — eliminar la reserva por UI', async () => {
    await page.goto('/cabanas-vip/reservas')
    await page.getByPlaceholder('Buscar por nombre, código, email o cabaña...').fill(nombreCliente)
    const filaReserva = page.locator('tr', { hasText: nombreCliente })
    await expect(filaReserva).toBeVisible()

    page.once('dialog', (d) => d.accept())
    await filaReserva.getByRole('button', { name: 'Eliminar' }).click()
    await expect(filaReserva).toHaveCount(0)
  })
})

test('Mimmo (NO-VIP) — crear una reserva con fecha de entrada en el pasado ya no está bloqueado', async ({ page }) => {
  const nombreCliente = autotestNombre('Historica Mimmo')

  await test.step('Switch a Mimmo', async () => {
    await page.goto('/')
    await page.getByTestId('complejo-switcher-toggle').click()
    await page.getByTestId('complejo-option-mimmo').click()
    await expect(page).toHaveURL(/\/mimmo\//)
  })

  let reservaId
  await test.step('Crear reserva AUTOTEST_ con fecha de entrada de 2015 — antes bloqueado, ahora debe funcionar', async () => {
    await page.goto('/mimmo/reservas/nueva')
    await page.getByTestId('input-nombre-apellido').fill(nombreCliente)
    await page.getByTestId('input-email').fill('autotest@example.com')

    // Mimmo tiene bloques (Bloque + Cabaña) — mismo toPass() que usa
    // mimmo.spec.js para la carrera async de cabanasPorGrupo.
    await expect(async () => {
      const selectBloque = page.getByTestId('select-bloque')
      if (await selectBloque.count()) {
        await selectBloque.selectOption({ index: 1 })
      }
      await page.getByTestId('select-cabana').selectOption({ index: 1 }, { timeout: 2000 })
    }).toPass({ timeout: 10000 })

    await page.getByTestId('input-fecha-entrada').fill('2015-01-10')
    await page.getByTestId('input-fecha-salida').fill('2015-01-14')
    await page.getByTestId('input-monto-total').fill('30000')
    await page.getByTestId('select-estado').selectOption('Finalizada')
    await page.getByTestId('btn-submit-reserva').click()

    await page.waitForURL(/\/mimmo\/reservas\/[0-9a-f-]{36}$/, { timeout: 15000 })
    reservaId = page.url().split('/').pop()
    expect(reservaId).toBeTruthy()
  })

  await test.step('Limpieza — eliminar la reserva por UI', async () => {
    await page.goto('/mimmo/reservas')
    await page.getByPlaceholder('Buscar por nombre, código, email o cabaña...').fill(nombreCliente)
    const filaReserva = page.locator('tr', { hasText: nombreCliente })
    await expect(filaReserva).toBeVisible()

    page.once('dialog', (d) => d.accept())
    await filaReserva.getByRole('button', { name: 'Eliminar' }).click()
    await expect(filaReserva).toHaveCount(0)
  })
})

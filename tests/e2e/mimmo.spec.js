// Fase 5.4 — flujo completo E2E para Mimmo (complejo NO-VIP
// representativo, con precios reales — no se toca el seed de precios
// de prueba de Casas Azahar/Los Amigos/Chacras del Mar acá).
//
// Reutiliza el storageState del usuario de acceso completo (proyecto
// "authenticated" de playwright.config.js) — no hace login por UI de
// nuevo, eso ya lo cubre vip.spec.js.
//
// Fechas: Mimmo YA tiene un cierre real cubriendo el mes actual en
// staging (confirmado corriendo este spec por primera vez — el
// candado de período cerrado bloqueó, correctamente, un intento con
// fecha "hoy"). Por eso todo acá usa un mes futuro fijo
// (diciembre 2026) en vez de depender de la fecha de hoy, tanto para
// las señas/movimientos como para los filtros de Caja/Ganancias que
// los tienen que mostrar — nunca asumir que "hoy" está abierto.
//
// Todo lo que crea lleva el prefijo AUTOTEST_ (ver tests/integration/
// helpers.js). La reserva y su seña auto-sincronizada se borran por UI
// en el propio spec; el cierre y el movimiento de prueba de la sección
// de "Cerrar caja" quedan para que los barra el global-teardown, tal
// como pide la consigna.
import { test, expect } from '@playwright/test'
import { autotestNombre, autotestDetalle, autotestCierreNombre } from '../integration/helpers.js'

function parseArs(texto) {
  return Number((texto || '').replace(/[^\d-]/g, '')) || 0
}

const MES_SEGURO_INDEX = '11' // Diciembre (0-indexado, como getMonth())
const ANIO_SEGURO = '2026'
const FECHA_ENTRADA = '2026-12-10'
const FECHA_SALIDA = '2026-12-14'
const FECHA_SENA = '2026-12-10'
const FECHA_MOV_MANUAL = '2026-12-11'

test('Mimmo — flujo completo end-to-end', async ({ page }) => {
  const nombreCliente = autotestNombre('Mimmo')
  const detalleCierreMov = autotestDetalle('Cerrar caja test')
  const nombreCierre = autotestCierreNombre('Test')
  let reservaId

  await test.step('1. Switch a Mimmo', async () => {
    await page.goto('/')
    await page.getByTestId('complejo-switcher-toggle').click()
    await page.getByTestId('complejo-option-mimmo').click()
    await expect(page).toHaveURL(/\/mimmo\//)
  })

  let ingresosArsAntes
  await test.step('1b. Capturar Ingresos ARS de Ganancias ANTES (diciembre 2026)', async () => {
    await page.goto('/mimmo/ganancias')
    await page.getByTestId('select-ganancias-anio').selectOption(ANIO_SEGURO)
    await page.getByTestId('select-ganancias-mes').selectOption(MES_SEGURO_INDEX)
    const texto = await page.getByTestId('tile-ingresos-ars-value').textContent()
    ingresosArsAntes = parseArs(texto)
  })

  await test.step('2. Crear reserva AUTOTEST_ con seña — confirmar auto-sync a movimientos_caja con tag Automático', async () => {
    await page.goto('/mimmo/reservas/nueva')
    await page.getByTestId('input-nombre-apellido').fill(nombreCliente)
    await page.getByTestId('input-email').fill('autotest@example.com')

    // Mimmo tiene bloques (Bloque + Cabaña) — se elige lo primero
    // disponible en cada select, sin asumir nombres puntuales.
    // cabanasPorGrupo llega async desde ComplejoContext: el form puede
    // renderizar brevemente la variante de un solo select antes de
    // pasar a Bloque+Cabaña (confirmado reproduciendo ambos casos a
    // mano) — toPass() reintenta la secuencia completa hasta que sea
    // consistente, en vez de asumir el primer estado que se vea.
    await expect(async () => {
      const selectBloque = page.getByTestId('select-bloque')
      if (await selectBloque.count()) {
        await selectBloque.selectOption({ index: 1 })
      }
      await page.getByTestId('select-cabana').selectOption({ index: 1 }, { timeout: 2000 })
    }).toPass({ timeout: 10000 })

    await page.getByTestId('input-fecha-entrada').fill(FECHA_ENTRADA)
    await page.getByTestId('input-fecha-salida').fill(FECHA_SALIDA)
    await page.getByTestId('input-monto-total').fill('30000')
    await page.getByTestId('input-sena1-monto').fill('3000')
    await page.getByTestId('select-sena1-tipo').selectOption('Banco') // -> bucket monto_depositos
    await page.getByTestId('input-sena1-fecha').fill(FECHA_SENA)
    await page.getByTestId('btn-submit-reserva').click()

    await page.waitForURL(/\/mimmo\/reservas\/[0-9a-f-]{36}$/, { timeout: 15000 })
    reservaId = page.url().split('/').pop()
    expect(reservaId).toBeTruthy()

    await page.goto('/mimmo/caja')
    await page.getByTestId('select-anio').selectOption(ANIO_SEGURO)
    await page.getByTestId('select-mes').selectOption(MES_SEGURO_INDEX)
    const filaAuto = page.locator('tr', { hasText: nombreCliente }).filter({ hasText: 'Automático' })
    await expect(filaAuto).toBeVisible()
    await expect(filaAuto).toContainText('3.000')
  })

  await test.step('3. Movimiento manual (vinculado a la reserva) — sin tag Automático', async () => {
    await page.getByRole('button', { name: '+ Nuevo movimiento' }).click()
    await page.getByTestId('select-tipo-movimiento').selectOption('ingreso')
    await page.getByTestId('input-fecha-movimiento').fill(FECHA_MOV_MANUAL)

    const opcionReserva = page.getByTestId('select-reserva-vincular').locator('option', { hasText: nombreCliente })
    const valorOpcion = await opcionReserva.getAttribute('value')
    await page.getByTestId('select-reserva-vincular').selectOption(valorOpcion)
    // El detalle se auto-completa como "Alquiler — {codigo} {nombre}" al vincular.
    await page.getByTestId('input-monto-depositos').fill('1000')
    await page.getByTestId('btn-guardar-movimiento').click()

    // OJO: la Categoría ("Alquiler") es la misma para la seña automática y
    // este movimiento manual vinculado — filtrar por 'Alquiler' solo
    // matchea las DOS filas. Lo que sí es único es la fecha (11/12, vs.
    // 10/12 de la seña) — desambiguar por ahí, no por categoría/detalle.
    const filaManual = page.locator('tr', { hasText: nombreCliente }).filter({ hasText: '11/12/2026' })
    await expect(filaManual).toBeVisible()
    await expect(filaManual).not.toContainText('Automático')
    await expect(filaManual).toContainText('1.000')
  })

  await test.step('4. $0 en un movimiento manual — la UI lo bloquea (mismo tratamiento que VIP)', async () => {
    await page.getByRole('button', { name: '+ Nuevo movimiento' }).click()
    await page.getByTestId('select-tipo-movimiento').selectOption('ingreso')
    await page.getByTestId('input-fecha-movimiento').fill(FECHA_MOV_MANUAL)
    // Los 3 montos quedan en blanco (0) a propósito.
    await page.getByTestId('btn-guardar-movimiento').click()

    // El modal sigue abierto — no hubo submit real.
    await expect(page.getByTestId('btn-guardar-movimiento')).toBeVisible()
    const msg = await page.getByTestId('input-monto-depositos').evaluate((el) => el.validationMessage)
    expect(msg).toContain('mayor a $0')

    await page.getByRole('button', { name: 'Cancelar' }).click()
  })

  await test.step('5. Cerrar caja sobre un rango sintético sin datos reales', async () => {
    // Enero 2025: muy anterior a que este complejo tuviera datos reales
    // en movimientos_caja en esta app, y dentro del rango de años que
    // el filtro de la página puede mostrar (para poder verificarlo).
    await page.getByTestId('select-anio').selectOption('2025')
    await page.getByTestId('select-mes').selectOption('0') // Enero

    await expect(page.getByText('Todavía no cargaste movimientos en este período.')).toBeVisible()

    // Un único movimiento AUTOTEST_ dentro de ese rango, específico para este test.
    await page.getByRole('button', { name: '+ Nuevo movimiento' }).click()
    await page.getByTestId('select-tipo-movimiento').selectOption('ingreso')
    await page.getByTestId('input-fecha-movimiento').fill('2025-01-15')
    await page.getByTestId('input-detalle-movimiento').fill(detalleCierreMov)
    await page.getByTestId('input-monto-depositos').fill('5000')
    await page.getByTestId('btn-guardar-movimiento').click()

    const filaTest = page.locator('tr', { hasText: detalleCierreMov })
    await expect(filaTest).toBeVisible()

    await page.getByRole('button', { name: 'Cerrar caja' }).click()
    await page.getByTestId('input-cierre-nombre').fill(nombreCierre)
    await page.getByTestId('input-cierre-fecha-desde').fill('2025-01-01')
    await page.getByTestId('input-cierre-fecha-hasta').fill('2025-01-31')
    await page.getByTestId('input-cierre-inicio-manual').fill('0')

    page.once('dialog', (d) => d.accept())
    await page.getByTestId('btn-confirmar-cierre').click()

    const cierreCard = page.getByTestId('cierre-card').filter({ hasText: nombreCierre })
    await expect(cierreCard).toBeVisible()

    // El movimiento dentro del rango cerrado queda con editar/borrar deshabilitados.
    const filaBloqueada = page.locator('tr', { hasText: detalleCierreMov })
    const botones = filaBloqueada.locator('button')
    await expect(botones.nth(0)).toBeDisabled()
    await expect(botones.nth(1)).toBeDisabled()

    // "Ver detalle" muestra el recap correcto.
    await cierreCard.getByRole('button', { name: 'Ver detalle' }).click()
    await expect(page.getByText('Resumen recalculado del período')).toBeVisible()
    await expect(page.locator('div').filter({ hasText: /^Ventas\$5\.000$/ }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  })

  await test.step('6. Ingresos ARS de Ganancias refleja exactamente el delta (seña + movimiento manual, diciembre 2026)', async () => {
    await page.goto('/mimmo/ganancias')
    await page.getByTestId('select-ganancias-anio').selectOption(ANIO_SEGURO)
    await page.getByTestId('select-ganancias-mes').selectOption(MES_SEGURO_INDEX)
    const texto = await page.getByTestId('tile-ingresos-ars-value').textContent()
    const ingresosArsDespues = parseArs(texto)
    // 3.000 (seña automática) + 1.000 (manual vinculado) = 4.000. Lo del
    // rango de Cerrar caja (enero 2025) no entra en diciembre 2026.
    expect(ingresosArsDespues - ingresosArsAntes).toBe(4000)
  })

  await test.step('7. Cancelar/eliminar la reserva — cierre y movimiento de prueba quedan para el global-teardown', async () => {
    await page.goto('/mimmo/reservas')
    await page.getByPlaceholder('Buscar por nombre, código, email o cabaña...').fill(nombreCliente)
    const filaReserva = page.locator('tr', { hasText: nombreCliente })
    await expect(filaReserva).toBeVisible()

    page.once('dialog', (d) => d.accept())
    await filaReserva.getByRole('button', { name: 'Eliminar' }).click()
    await expect(filaReserva).toHaveCount(0)
  })
})

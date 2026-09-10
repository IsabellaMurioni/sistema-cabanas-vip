// Fase 5.4 — smoke test liviano para los 3 complejos con precios de
// prueba (Casas Azahar, Los Amigos, Chacras del Mar). No crea datos —
// sólo confirma que cada complejo carga con su nombre/color correcto y
// que Reservas/Caja/Ganancias no explotan. A propósito NO se toca el
// seed de precios de prueba de estos 3 complejos acá.
//
// Reutiliza el storageState del usuario de acceso completo (proyecto
// "authenticated" de playwright.config.js).
import { test, expect } from '@playwright/test'

const COMPLEJOS = [
  { slug: 'casas-azahar',    nombre: 'Casas Azahar',    colorPrimario: '#FE824C' },
  { slug: 'los-amigos',      nombre: 'Los Amigos',      colorPrimario: '#8A6852' },
  { slug: 'chacras-del-mar', nombre: 'Chacras del Mar', colorPrimario: '#68B999' },
]

for (const complejo of COMPLEJOS) {
  test(`${complejo.nombre} — carga con nombre/color correctos, Reservas/Caja/Ganancias sin errores`, async ({ page }) => {
    const erroresConsola = []
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      // [EmailJS] es un warning-como-error esperado en este entorno:
      // .env.local a propósito no tiene credenciales de EmailJS (no se
      // mandan mails reales en tests) — sale en TODAS las páginas de
      // TODOS los complejos (confirmado también en vip.spec.js), no es
      // nada roto por esta página en particular. Cualquier otro error
      // de consola sigue contando.
      if (msg.text().includes('[EmailJS]')) return
      erroresConsola.push(msg.text())
    })
    page.on('pageerror', (err) => erroresConsola.push(err.message))

    await test.step('Switch al complejo — nombre y color correctos', async () => {
      await page.goto('/')
      await page.getByTestId('complejo-switcher-toggle').click()
      await page.getByTestId(`complejo-option-${complejo.slug}`).click()
      await expect(page).toHaveURL(new RegExp(`/${complejo.slug}/`))
      await expect(page.getByTestId('complejo-activo-nombre')).toHaveText(complejo.nombre)

      const colorPrimarioReal = await page.evaluate(
        () => getComputedStyle(document.documentElement).getPropertyValue('--color-primario').trim()
      )
      expect(colorPrimarioReal.toUpperCase()).toBe(complejo.colorPrimario.toUpperCase())
    })

    await test.step('Reservas carga sin crashear', async () => {
      await page.goto(`/${complejo.slug}/reservas`)
      await expect(page.getByRole('heading', { name: 'Reservas' })).toBeVisible()
    })

    await test.step('Caja carga sin crashear', async () => {
      await page.goto(`/${complejo.slug}/caja`)
      // CajaTemporada.jsx muestra el tile "Ganancia" (BigTotal) siempre.
      await expect(page.getByText('Ganancia', { exact: true })).toBeVisible()
    })

    await test.step('Ganancias carga sin crashear', async () => {
      await page.goto(`/${complejo.slug}/ganancias`)
      await expect(page.getByRole('heading', { name: 'Ganancias' })).toBeVisible()
      await expect(page.getByTestId('tile-ingresos-ars-value')).toBeVisible()
    })

    expect(erroresConsola, `Errores de consola en ${complejo.nombre}: ${erroresConsola.join(' | ')}`).toEqual([])
  })
}

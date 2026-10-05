// "Resumen económico" → tarjeta TOTAL en ReservaDetalle.jsx ("Ver
// reserva"): cuando la reserva tiene un descuento aplicado
// (descuento_monto > 0), monto_total ya queda guardado POST-descuento
// (ver handleSubmit en ReservaForm.jsx) — hoy no quedaba ningún rastro
// visible de eso en el detalle, sólo el total final. Este cambio
// agrega, debajo del total (sin tocarlo), el monto original tachado +
// el descuento en verde, y el motivo si se cargó uno — reconstruyendo
// el original a partir de datos ya guardados (monto_total +
// descuento_monto), sin leer ni escribir nada nuevo en la base.
//
// Cambio puramente visual: sin descuento, la tarjeta TOTAL debe
// quedar EXACTAMENTE como hoy — estos tests verifican eso
// explícitamente (nada de las líneas nuevas en el DOM, no sólo
// ocultas), además del caso con descuento completo y el caso
// intermedio (descuento sin motivo cargado).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ReservaDetalle from '../../src/pages/ReservaDetalle'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../src/context/ComplejoContext', () => ({ useComplejo: vi.fn() }))

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'

const RESERVA_BASE = {
  id: 'reserva-1',
  codigo: 'A2527',
  nombre_apellido: 'Huésped de Prueba',
  email: 'huesped@example.com',
  cabana: 'Cabaña 1',
  pax: 2,
  fecha_entrada: '2026-07-01',
  fecha_salida: '2026-07-03',
  noches: 2,
  mes: 'Julio',
  monto_total: 130,
  sena1_monto: 0,
  sena2_monto: 0,
  pago_cabana_monto: 0,
  estado: 'Pendiente',
  descuento_monto: null,
  descuento_motivo: null,
}

function mockReserva(overrides) {
  useComplejo.mockReturnValue({
    complejoActivo: { id: 'complejo-1', slug: 'cabanas-vip', nombre: 'Cabañas VIP' },
  })
  const reserva = { ...RESERVA_BASE, ...overrides }
  supabase.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: reserva, error: null }),
      }),
    }),
  })
  return reserva
}

async function renderDetalle() {
  render(
    <MemoryRouter initialEntries={['/cabanas-vip/reservas/reserva-1']}>
      <Routes>
        <Route path="/:complejoSlug/reservas/:id" element={<ReservaDetalle />} />
      </Routes>
    </MemoryRouter>
  )
  await waitFor(() => expect(screen.getByText('Resumen económico')).toBeInTheDocument())
}

// La tarjeta TOTAL = el contenedor que tiene el label "Total" adentro.
function cajaTotal() {
  return screen.getByText('Total').closest('div')
}

describe('ReservaDetalle.jsx — "Resumen económico" → tarjeta TOTAL', () => {
  beforeEach(() => vi.clearAllMocks())

  it('SIN descuento (null): la tarjeta TOTAL queda exactamente como hoy — sólo label + monto, nada más en el DOM', async () => {
    mockReserva({ monto_total: 130, descuento_monto: null, descuento_motivo: null })
    await renderDetalle()

    const caja = cajaTotal()
    // Dos hijos nada más: el label "Total" y el monto — ninguna línea
    // nueva, ni siquiera oculta.
    expect(caja.children).toHaveLength(2)
    expect(caja.textContent).toBe('Total$130')
  })

  it('descuento_monto en 0 (no sólo null): mismo resultado — sin líneas extra', async () => {
    mockReserva({ monto_total: 130, descuento_monto: 0, descuento_motivo: null })
    await renderDetalle()

    expect(cajaTotal().children).toHaveLength(2)
  })

  it('descuento_monto ausente (undefined, campo ni presente): mismo resultado — sin líneas extra', async () => {
    mockReserva({ monto_total: 130, descuento_monto: undefined, descuento_motivo: undefined })
    await renderDetalle()

    expect(cajaTotal().children).toHaveLength(2)
  })

  it('CON descuento y motivo: muestra el total final sin cambios, el original tachado, el descuento en verde, y el motivo en cursiva', async () => {
    // sena1_monto distinto de 0 para que Saldo ($100) no coincida con
    // Total ($130) y la búsqueda de texto no sea ambigua.
    mockReserva({ monto_total: 130, sena1_monto: 30, descuento_monto: 170, descuento_motivo: 'Descuento especial' })
    await renderDetalle()

    // El total final (grande, bold) sigue igual.
    expect(screen.getByText('$130')).toBeInTheDocument()

    // Original = monto_total + descuento_monto = 130 + 170 = $300, tachado.
    const original = screen.getByText('$300')
    expect(original.style.textDecoration).toBe('line-through')
    expect(original.style.color).toBe('rgb(167, 174, 187)') // #A7AEBB

    // Descuento en verde, con el signo menos.
    const descuento = screen.getByText('−$170')
    expect(descuento.style.color).toBe('rgb(21, 128, 61)') // #15803D
    expect(descuento.style.fontWeight).toBe('700')

    // Motivo, en cursiva.
    const motivo = screen.getByText('Descuento especial')
    expect(motivo.style.fontStyle).toBe('italic')
    expect(motivo.style.color).toBe('rgb(154, 162, 177)') // #9AA2B1
  })

  it('CON descuento pero SIN motivo cargado: muestra original tachado + descuento en verde, pero ninguna tercera línea', async () => {
    mockReserva({ monto_total: 130, descuento_monto: 170, descuento_motivo: null })
    await renderDetalle()

    expect(screen.getByText('$300')).toBeInTheDocument()
    expect(screen.getByText('−$170')).toBeInTheDocument()
    // Nada de texto de motivo — la caja tiene sólo 3 hijos (label,
    // monto, línea original+descuento), no 4.
    expect(cajaTotal().children).toHaveLength(3)
  })

  it('CON descuento y motivo vacío (string ""): se trata igual que "sin motivo" — no se muestra la tercera línea', async () => {
    mockReserva({ monto_total: 130, descuento_monto: 170, descuento_motivo: '' })
    await renderDetalle()

    expect(screen.getByText('−$170')).toBeInTheDocument()
    expect(cajaTotal().children).toHaveLength(3)
  })

  it('1ª Seña, 2ª Seña y Saldo quedan sin cambios cuando hay descuento', async () => {
    mockReserva({ monto_total: 130, descuento_monto: 170, descuento_motivo: 'Descuento especial', sena1_monto: 50 })
    await renderDetalle()

    // Acotado a la tarjeta "Resumen económico" — "1ª Seña" también
    // aparece como título en "Historial de pagos", más abajo.
    const resumen = screen.getByText('Resumen económico').closest('.card')
    expect(within(resumen).getByText('1ª Seña')).toBeInTheDocument()
    expect(within(resumen).getByText('2ª Seña')).toBeInTheDocument()
    expect(within(resumen).getByText('Saldo')).toBeInTheDocument()
    // $50 de 1ª seña se sigue mostrando normal, sin tocar — también
    // acotado (el mismo monto aparece de nuevo en "Historial de pagos").
    expect(within(resumen).getByText('$50')).toBeInTheDocument()
  })
})

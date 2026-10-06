// Bug real reportado: editar una reserva que YA tenía un descuento
// aplicado (monto_total guardado post-descuento, igual criterio que
// usa ReservaDetalle.jsx) y cambiar ese descuento calculaba el nuevo
// descuento sobre el total YA descontado, en vez de sobre el monto
// original — "descuento sobre descuento". Ej: original $300, descuento
// $170 guardado → monto_total guardado = $130. Al editar y cambiar el
// descuento a $100, el bug daba $130 - $100 = $30 en vez del correcto
// $300 - $100 = $200.
//
// Causa real: el formulario de edición arrancaba SIEMPRE con el
// checkbox "Aplicar descuento" destildado y montoBaseDescuento en
// null, sin importar si la reserva ya tenía un descuento guardado — la
// única forma de que montoBaseDescuento se capturara era que el
// usuario TILDARA el checkbox a mano, y en ese momento capturaba
// Number(form.monto_total) (el YA descontado, porque en edición
// precioBaseNeto siempre es null) en vez del original.
//
// Fix: al cargar una reserva en edición, si ya tiene descuento_monto
// guardado, se precarga el checkbox tildado, el monto/motivo del
// descuento, y montoBaseDescuento se reconstruye como
// monto_total + descuento_monto (misma fórmula que ya usa
// ReservaDetalle.jsx para el "antes" tachado) — así cualquier cambio
// posterior al descuento resta sobre la base correcta.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ReservaForm from '../../src/pages/ReservaForm'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../src/context/ComplejoContext', () => ({ useComplejo: vi.fn() }))
vi.mock('../../src/lib/email', () => ({
  sendEmailConfirmacion: vi.fn(),
  sendEmailRecibo: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'
import { sendEmailConfirmacion } from '../../src/lib/email'

const COMPLEJO_VIP = { id: 'complejo-vip', slug: 'cabanas-vip', nombre: 'Cabañas VIP' }

// Original $300, descuento $170 ya aplicado y guardado → monto_total
// guardado = $130 (post-descuento, igual criterio que ReservaDetalle.jsx).
const RESERVA_CON_DESCUENTO = {
  id: 'reserva-con-descuento-id',
  codigo: 'A3000',
  nombre_apellido: 'Huésped Con Descuento',
  email: 'condescuento@example.com',
  cabana: 'Cabaña 1',
  pax: 2,
  fecha_entrada: '2026-07-01',
  fecha_salida: '2026-07-03',
  noches: 2,
  mes: 'Julio',
  monto_total: 130,
  sena1_monto: 0,
  sena1_tipo: 'Banco',
  sena2_monto: 0,
  sena2_tipo: 'Banco',
  pago_cabana_monto: 0,
  estado: 'Pendiente',
  descuento_monto: 170,
  descuento_motivo: 'Cliente frecuente',
}

function makeSupabaseMock({ reservaExistente } = {}) {
  let ultimoUpdateReservas = null

  const from = vi.fn((table) => {
    let idBuscado = null
    const builder = {
      select: () => builder,
      eq: (campo, valor) => {
        if (campo === 'id') idBuscado = valor
        return builder
      },
      neq: () => builder,
      like: () => builder,
      order: () => builder,
      limit: () => builder,
      lt: () => builder,
      gt: () => builder,
      in: () => builder,
      update: (payload) => {
        if (table === 'reservas') ultimoUpdateReservas = payload
        return builder
      },
      single: () => {
        if (table === 'reservas' && idBuscado && reservaExistente) {
          return Promise.resolve({ data: reservaExistente, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
      then: (onFulfilled, onRejected) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected),
    }
    return builder
  })

  return { from, getUltimoUpdateReservas: () => ultimoUpdateReservas }
}

function renderEnEdicion() {
  render(
    <MemoryRouter initialEntries={['/cabanas-vip/reservas/reserva-con-descuento-id/editar']}>
      <Routes>
        <Route path="/:complejoSlug/reservas/:id/editar" element={<ReservaForm />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useComplejo.mockReturnValue({
    complejoActivo: COMPLEJO_VIP,
    cabanasPorGrupo: [{ grupo: null, cabanas: ['Cabaña 1', 'Cabaña 2'] }],
  })
  sendEmailConfirmacion.mockResolvedValue(new Date().toISOString())
})

describe('ReservaForm.jsx — editar una reserva que YA tiene un descuento guardado', () => {
  it('el checkbox arranca tildado, con el monto y motivo del descuento ya guardado, y el desglose muestra el ORIGINAL ($300), no el ya descontado', async () => {
    const mockSupabase = makeSupabaseMock({ reservaExistente: RESERVA_CON_DESCUENTO })
    supabase.from.mockImplementation(mockSupabase.from)
    renderEnEdicion()

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(130))

    const checkbox = screen.getByText('Aplicar descuento').previousElementSibling
    expect(checkbox).toBeChecked()
    expect(screen.getByTestId('input-descuento-monto')).toHaveValue(170)
    expect(screen.getByPlaceholderText('Ej: Cliente frecuente')).toHaveValue('Cliente frecuente')

    // Desglose: precio base = el ORIGINAL ($300), no el ya descontado
    // ($130) — éste era exactamente el valor equivocado que se
    // hubiera capturado como base con el bug.
    expect(screen.getByText('Precio base')).toBeInTheDocument()
    expect(screen.getByText('$300')).toBeInTheDocument()
  })

  it('cambiar el descuento de $170 a $100 resta sobre el ORIGINAL ($300 - $100 = $200), no sobre el ya descontado ($130 - $100 = $30, el bug)', async () => {
    const mockSupabase = makeSupabaseMock({ reservaExistente: RESERVA_CON_DESCUENTO })
    supabase.from.mockImplementation(mockSupabase.from)
    const user = userEvent.setup()
    renderEnEdicion()

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(130))

    const montoDescuentoInput = screen.getByTestId('input-descuento-monto')
    await user.clear(montoDescuentoInput)
    await user.type(montoDescuentoInput, '100')

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(200))
    expect(screen.getByTestId('input-monto-total')).not.toHaveValue(30)

    await user.click(screen.getByTestId('btn-submit-reserva'))
    await waitFor(() => expect(mockSupabase.getUltimoUpdateReservas()).not.toBeNull())
    const updated = mockSupabase.getUltimoUpdateReservas()
    expect(Number(updated.monto_total)).toBe(200)
    expect(Number(updated.descuento_monto)).toBe(100)
  })

  it('guardar sin tocar nada persiste exactamente lo mismo que ya estaba guardado (sin regresión)', async () => {
    const mockSupabase = makeSupabaseMock({ reservaExistente: RESERVA_CON_DESCUENTO })
    supabase.from.mockImplementation(mockSupabase.from)
    const user = userEvent.setup()
    renderEnEdicion()

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(130))
    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoUpdateReservas()).not.toBeNull())
    const updated = mockSupabase.getUltimoUpdateReservas()
    expect(Number(updated.monto_total)).toBe(130)
    expect(Number(updated.descuento_monto)).toBe(170)
    expect(updated.descuento_motivo).toBe('Cliente frecuente')
  })

  it('destildar "Aplicar descuento" quita el descuento y restaura el monto ORIGINAL ($300), guardando descuento_monto en null', async () => {
    const mockSupabase = makeSupabaseMock({ reservaExistente: RESERVA_CON_DESCUENTO })
    supabase.from.mockImplementation(mockSupabase.from)
    const user = userEvent.setup()
    renderEnEdicion()

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(130))
    await user.click(screen.getByText('Aplicar descuento')) // destilda

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(300))

    await user.click(screen.getByTestId('btn-submit-reserva'))
    await waitFor(() => expect(mockSupabase.getUltimoUpdateReservas()).not.toBeNull())
    const updated = mockSupabase.getUltimoUpdateReservas()
    expect(Number(updated.monto_total)).toBe(300)
    expect(updated.descuento_monto).toBeNull()
    expect(updated.descuento_motivo).toBeNull()
  })
})

describe('ReservaForm.jsx — editar una reserva SIN descuento previo: sin regresión', () => {
  it('el checkbox arranca destildado y el campo de descuento vacío, igual que siempre', async () => {
    const RESERVA_SIN_DESCUENTO = { ...RESERVA_CON_DESCUENTO, id: 'reserva-sin-descuento-id', monto_total: 300, descuento_monto: null, descuento_motivo: null }
    const mockSupabase = makeSupabaseMock({ reservaExistente: RESERVA_SIN_DESCUENTO })
    supabase.from.mockImplementation(mockSupabase.from)
    render(
      <MemoryRouter initialEntries={['/cabanas-vip/reservas/reserva-sin-descuento-id/editar']}>
        <Routes>
          <Route path="/:complejoSlug/reservas/:id/editar" element={<ReservaForm />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(300))
    const checkbox = screen.getByText('Aplicar descuento').previousElementSibling
    expect(checkbox).not.toBeChecked()
    expect(screen.queryByTestId('input-descuento-monto')).not.toBeInTheDocument()
  })
})

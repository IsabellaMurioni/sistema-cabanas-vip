// Bug real reportado: al tipear un descuento (ej. "20") en ReservaForm.jsx,
// el saldo total no se actualizaba. Investigación en vivo confirmó que el
// campo es un PORCENTAJE (variable descuento_porcentaje, label "Porcentaje
// (%)", desglose "Descuento (X%)" en la UI) — no un monto fijo. La causa
// real: el efecto que aplicaba el descuento sólo recalculaba monto_total a
// partir de precioBaseNeto (el precio AUTOMÁTICO resuelto por período), y
// además estaba deshabilitado por completo en edición (`if (isEdit) return`).
// Un precio tipeado a mano (sin período configurado) o cualquier edición de
// una reserva existente dejaban el descuento sin ningún efecto.
//
// El fix introduce montoBaseDescuento — el precio "antes del descuento",
// capturado en el momento de tildar el checkbox "Aplicar descuento" (sea
// cual sea su origen: automático, manual, o el monto ya cargado de una
// reserva en edición) — y hace que el efecto que aplica el % corra tanto en
// creación como en edición.
//
// Estos tests renderizan el componente real y completan/envían el
// formulario — no reimplementan handleSubmit ni la lógica de descuento.
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

// Mismo mock "universal" que tests/unit/reserva-form-vencimiento.test.jsx —
// ver ese archivo para el detalle de por qué cada método está ahí. Como
// nunca se mockea `periodos_precios` con datos reales, precioBaseNeto queda
// siempre null (sinPeriodo=true) — exactamente el escenario "precio
// manual" del bug real (el otro escenario roto, edición, se cubre con
// `reservaExistente`).
function makeSupabaseMock({ reservaExistente } = {}) {
  let ultimoInsertReservas = null
  let ultimoUpdateReservas = null

  const from = vi.fn((table) => {
    let esInsert = false
    const builder = {
      select: () => builder,
      eq: () => builder,
      neq: () => builder,
      like: () => builder,
      order: () => builder,
      limit: () => builder,
      lt: () => builder,
      gt: () => builder,
      in: () => builder,
      insert: (payload) => {
        esInsert = true
        if (table === 'reservas') ultimoInsertReservas = payload
        return builder
      },
      update: (payload) => {
        if (table === 'reservas') ultimoUpdateReservas = payload
        return builder
      },
      single: () => {
        if (table === 'reservas' && esInsert) {
          return Promise.resolve({
            data: ultimoInsertReservas ? { id: 'nueva-reserva-id', ...ultimoInsertReservas } : null,
            error: null,
          })
        }
        if (table === 'reservas' && reservaExistente) {
          return Promise.resolve({ data: reservaExistente, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
      then: (onFulfilled, onRejected) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected),
    }
    return builder
  })

  return {
    from,
    getUltimoInsertReservas: () => ultimoInsertReservas,
    getUltimoUpdateReservas: () => ultimoUpdateReservas,
  }
}

async function aplicarDescuento(user, porcentaje) {
  await user.click(screen.getByText('Aplicar descuento'))
  const pctInput = await screen.findByPlaceholderText('Ej: 10')
  await user.clear(pctInput)
  await user.type(pctInput, String(porcentaje))
}

describe('ReservaForm.jsx — descuento porcentual con precio MANUAL (creación, código real)', () => {
  let mockSupabase

  beforeEach(() => {
    vi.clearAllMocks()
    useComplejo.mockReturnValue({
      complejoActivo: COMPLEJO_VIP,
      cabanasNombres: ['Cabaña 1', 'Cabaña 2'],
      cabanasPorGrupo: [{ grupo: null, cabanas: ['Cabaña 1', 'Cabaña 2'] }],
    })
    mockSupabase = makeSupabaseMock()
    supabase.from.mockImplementation(mockSupabase.from)
    sendEmailConfirmacion.mockResolvedValue(new Date().toISOString())
  })

  it('20% de descuento sobre un precio tipeado a mano ($1000) actualiza el total a $800 (bug real: antes no cambiaba nada)', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)

    await waitFor(() => expect(screen.getByTestId('select-cabana')).toBeInTheDocument())
    await user.selectOptions(screen.getByTestId('select-cabana'), 'Cabaña 1')
    await user.type(screen.getByTestId('input-fecha-entrada'), '2026-06-01')
    await user.type(screen.getByTestId('input-fecha-salida'), '2026-06-03')
    await user.clear(screen.getByTestId('input-monto-total'))
    await user.type(screen.getByTestId('input-monto-total'), '1000')

    await aplicarDescuento(user, 20)

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(800))
  })

  it('un descuento que NO llega a $0 (20%) se guarda correctamente en el insert y sigue dando de alta email/vencimiento', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)

    await waitFor(() => expect(screen.getByTestId('select-cabana')).toBeInTheDocument())
    await user.type(screen.getByTestId('input-nombre-apellido'), 'Huésped Descuento')
    await user.type(screen.getByTestId('input-email'), 'descuento@example.com')
    await user.selectOptions(screen.getByTestId('select-cabana'), 'Cabaña 1')
    await user.type(screen.getByTestId('input-fecha-entrada'), '2026-06-01')
    await user.type(screen.getByTestId('input-fecha-salida'), '2026-06-03')
    await user.clear(screen.getByTestId('input-monto-total'))
    await user.type(screen.getByTestId('input-monto-total'), '1000')
    await aplicarDescuento(user, 20)
    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(800))

    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoInsertReservas()).not.toBeNull())
    const inserted = mockSupabase.getUltimoInsertReservas()
    expect(Number(inserted.monto_total)).toBe(800)
    expect(inserted.fecha_vencimiento).not.toBeNull()
    await waitFor(() => expect(sendEmailConfirmacion).toHaveBeenCalled())
  })

  it('un descuento del 100% ($1000 → $0) hace que la reserva se comporte como cualquier reserva a $0: sin email, sin vencimiento', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)

    await waitFor(() => expect(screen.getByTestId('select-cabana')).toBeInTheDocument())
    await user.type(screen.getByTestId('input-nombre-apellido'), 'Huésped Descuento Total')
    await user.type(screen.getByTestId('input-email'), 'descuentototal@example.com')
    await user.selectOptions(screen.getByTestId('select-cabana'), 'Cabaña 1')
    await user.type(screen.getByTestId('input-fecha-entrada'), '2026-06-01')
    await user.type(screen.getByTestId('input-fecha-salida'), '2026-06-03')
    await user.clear(screen.getByTestId('input-monto-total'))
    await user.type(screen.getByTestId('input-monto-total'), '1000')
    await aplicarDescuento(user, 100)
    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(0))

    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoInsertReservas()).not.toBeNull())
    const inserted = mockSupabase.getUltimoInsertReservas()
    expect(Number(inserted.monto_total)).toBe(0)
    // No debe especial-casearse "descuento a $0" como camino aparte — debe
    // caer naturalmente en los mismos chequeos monto_total <= 0 ya
    // existentes (debeVencerA48hs / debeEnviarEmailConfirmacion).
    expect(inserted.fecha_vencimiento).toBeNull()
    expect(sendEmailConfirmacion).not.toHaveBeenCalled()
  })
})

describe('ReservaForm.jsx — descuento porcentual al EDITAR una reserva existente (código real)', () => {
  const RESERVA_EXISTENTE = {
    id: 'reserva-existente-id',
    codigo: 'A1234',
    nombre_apellido: 'Huésped Existente',
    email: 'existente@example.com',
    cabana: 'Cabaña 1',
    pax: 2,
    fecha_entrada: '2026-07-01',
    fecha_salida: '2026-07-03',
    noches: 2,
    mes: 'Julio',
    monto_total: 1000,
    sena1_monto: 0,
    sena1_tipo: 'Banco',
    sena2_monto: 0,
    sena2_tipo: 'Banco',
    pago_cabana_monto: 0,
    estado: 'Pendiente',
    fecha_vencimiento: null,
  }

  let mockSupabase

  beforeEach(() => {
    vi.clearAllMocks()
    useComplejo.mockReturnValue({
      complejoActivo: COMPLEJO_VIP,
      cabanasNombres: ['Cabaña 1', 'Cabaña 2'],
      cabanasPorGrupo: [{ grupo: null, cabanas: ['Cabaña 1', 'Cabaña 2'] }],
    })
    mockSupabase = makeSupabaseMock({ reservaExistente: RESERVA_EXISTENTE })
    supabase.from.mockImplementation(mockSupabase.from)
    sendEmailConfirmacion.mockResolvedValue(new Date().toISOString())
  })

  it('tildar "Aplicar descuento" y poner 20% en edición actualiza el total/saldo de $1000 a $800 (bug real: antes no hacía nada en edición)', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/cabanas-vip/reservas/reserva-existente-id/editar']}>
        <Routes>
          <Route path="/:complejoSlug/reservas/:id/editar" element={<ReservaForm />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(1000))

    await aplicarDescuento(user, 20)

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(800))

    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoUpdateReservas()).not.toBeNull())
    const updated = mockSupabase.getUltimoUpdateReservas()
    expect(Number(updated.monto_total)).toBe(800)
  })
})

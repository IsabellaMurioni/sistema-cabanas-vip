// El descuento de ReservaForm.jsx pasó de ser un PORCENTAJE a un MONTO
// FIJO en pesos (requerimiento real del negocio, confirmado
// 2026-09-28 — la investigación previa había arreglado el % pero el
// negocio en realidad siempre quiso un monto fijo). Campo renombrado
// de descuento_porcentaje a descuento_monto; el cálculo pasa de
// `base * (1 - pct/100)` a `Math.max(0, base - monto)` — el descuento
// nunca puede llevar el total por debajo de $0. montoBaseDescuento (el
// precio "antes del descuento", capturado al tildar el checkbox) no
// cambia de lógica — sigue funcionando igual en creación y en edición,
// con precio automático o tipeado a mano.
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
// siempre null (sinPeriodo=true) — el escenario "precio tipeado a mano"
// (el otro escenario, edición, se cubre con `reservaExistente`).
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

async function aplicarDescuento(user, montoPesos, motivo) {
  await user.click(screen.getByText('Aplicar descuento'))
  const montoInput = await screen.findByPlaceholderText('Ej: 5000')
  await user.clear(montoInput)
  await user.type(montoInput, String(montoPesos))
  if (motivo) {
    await user.type(screen.getByPlaceholderText('Ej: Cliente frecuente'), motivo)
  }
}

describe('ReservaForm.jsx — descuento en MONTO FIJO con precio manual (creación, código real)', () => {
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

  async function completarDatosBase(user) {
    await waitFor(() => expect(screen.getByTestId('select-cabana')).toBeInTheDocument())
    await user.type(screen.getByTestId('input-nombre-apellido'), 'Huésped Descuento')
    await user.type(screen.getByTestId('input-email'), 'descuento@example.com')
    await user.selectOptions(screen.getByTestId('select-cabana'), 'Cabaña 1')
    await user.type(screen.getByTestId('input-fecha-entrada'), '2026-06-01')
    await user.type(screen.getByTestId('input-fecha-salida'), '2026-06-03')
    await user.clear(screen.getByTestId('input-monto-total'))
    await user.type(screen.getByTestId('input-monto-total'), '1000')
  }

  it('un descuento parcial ($200 sobre una base de $1000 tipeada a mano) baja el total a $800', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user)

    await aplicarDescuento(user, 200)

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(800))
  })

  it('un descuento parcial se guarda en el insert (monto_total, descuento_monto, descuento_motivo) y sigue disparando email/vencimiento', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user)
    await aplicarDescuento(user, 200, 'Cliente frecuente')
    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(800))

    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoInsertReservas()).not.toBeNull())
    const inserted = mockSupabase.getUltimoInsertReservas()
    expect(Number(inserted.monto_total)).toBe(800)
    expect(Number(inserted.descuento_monto)).toBe(200)
    expect(inserted.descuento_motivo).toBe('Cliente frecuente')
    expect(inserted.fecha_vencimiento).not.toBeNull()
    await waitFor(() => expect(sendEmailConfirmacion).toHaveBeenCalled())
  })

  it('un descuento que SUPERA la base ($1500 sobre $1000) se clampea a $0 — nunca un total negativo — y se comporta como cualquier reserva a $0: sin email, sin vencimiento', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user)

    await aplicarDescuento(user, 1500)
    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(0))

    // El desglose muestra el descuento EFECTIVO ($1000, lo que
    // realmente se restó), no lo tipeado crudo ($1500) — así el clamp
    // queda visible en vez de silencioso.
    expect(screen.getByText('− $1.000')).toBeInTheDocument()
    expect(screen.queryByText('− $1.500')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoInsertReservas()).not.toBeNull())
    const inserted = mockSupabase.getUltimoInsertReservas()
    expect(Number(inserted.monto_total)).toBe(0)
    // El monto persistido también es el efectivo (clampeado a la base),
    // no el tipeado crudo — mismo criterio que el desglose.
    expect(Number(inserted.descuento_monto)).toBe(1000)
    // No debe especial-casearse "descuento clampeado a $0" como camino
    // aparte — debe caer naturalmente en los mismos chequeos
    // monto_total <= 0 ya existentes (debeVencerA48hs /
    // debeEnviarEmailConfirmacion). Este escenario NO estaba probado
    // bajo el diseño viejo de porcentaje.
    expect(inserted.fecha_vencimiento).toBeNull()
    expect(sendEmailConfirmacion).not.toHaveBeenCalled()
  })

  it('un descuento de $0 (o vacío) no cambia el total — se comporta como si no hubiera descuento, sigue > $0', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user)

    await user.click(screen.getByText('Aplicar descuento'))
    // No se tipea nada en el monto — queda vacío.
    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(1000))

    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoInsertReservas()).not.toBeNull())
    const inserted = mockSupabase.getUltimoInsertReservas()
    expect(Number(inserted.monto_total)).toBe(1000)
    expect(inserted.fecha_vencimiento).not.toBeNull()
    await waitFor(() => expect(sendEmailConfirmacion).toHaveBeenCalled())
  })
})

describe('ReservaForm.jsx — descuento en MONTO FIJO al EDITAR una reserva existente (código real)', () => {
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

  it('tildar "Aplicar descuento" y poner $200 en edición baja el total de $1000 a $800, y se persiste en el update', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/cabanas-vip/reservas/reserva-existente-id/editar']}>
        <Routes>
          <Route path="/:complejoSlug/reservas/:id/editar" element={<ReservaForm />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(1000))

    await aplicarDescuento(user, 200, 'Reprogramación')

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(800))

    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoUpdateReservas()).not.toBeNull())
    const updated = mockSupabase.getUltimoUpdateReservas()
    expect(Number(updated.monto_total)).toBe(800)
    expect(Number(updated.descuento_monto)).toBe(200)
    expect(updated.descuento_motivo).toBe('Reprogramación')
  })

  it('un descuento en edición que supera la base también se clampea a $0 (no negativo)', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/cabanas-vip/reservas/reserva-existente-id/editar']}>
        <Routes>
          <Route path="/:complejoSlug/reservas/:id/editar" element={<ReservaForm />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(1000))

    await aplicarDescuento(user, 5000)

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(0))
    expect(screen.queryByTestId('input-monto-total')).not.toHaveValue(-4000)
  })
})

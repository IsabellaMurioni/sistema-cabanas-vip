// El descuento de ReservaForm.jsx es un MONTO FIJO en pesos (no un %),
// restado directo de montoBaseDescuento (el precio "antes del
// descuento", capturado al tildar el checkbox — funciona igual en
// creación y en edición, con precio automático o tipeado a mano).
//
// Un monto que supera la base es INVÁLIDO — a diferencia de un diseño
// anterior que lo clampeaba en silencio a $0, ahora NO se aplica nada:
// aparece un error junto al input y el total se mantiene en la base
// (como si no hubiera descuento) hasta que se corrija a un valor
// válido (0 <= monto <= base). El error es derivado en cada render
// (descuentoExcedeBase en ReservaForm.jsx), así que desaparece solo
// apenas se corrige el monto.
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
// / "Precio personalizado" (el otro escenario, edición, se cubre con
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

async function aplicarDescuento(user, montoPesos, motivo) {
  await user.click(screen.getByText('Aplicar descuento'))
  const montoInput = await screen.findByTestId('input-descuento-monto')
  await user.clear(montoInput)
  await user.type(montoInput, String(montoPesos))
  if (motivo) {
    await user.type(screen.getByPlaceholderText('Ej: Cliente frecuente'), motivo)
  }
}

describe('ReservaForm.jsx — descuento en MONTO FIJO con precio manual/"Precio personalizado" (creación, código real)', () => {
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
    await waitFor(() => expect(screen.getByTestId('cabana-picker-trigger')).toBeInTheDocument())
    await user.type(screen.getByTestId('input-nombre-apellido'), 'Huésped Descuento')
    await user.type(screen.getByTestId('input-email'), 'descuento@example.com')
    // Selector de cabaña(s) custom (CabinMultiPicker) — ver
    // reserva-form-multi-cabana.test.jsx para la cobertura dedicada.
    await user.click(screen.getByTestId('cabana-picker-trigger'))
    await user.click(screen.getByTestId('cabana-picker-row-Cabaña 1'))
    await user.click(screen.getByTestId('cabana-picker-listo'))
    await user.type(screen.getByTestId('input-fecha-entrada'), '2026-06-01')
    await user.type(screen.getByTestId('input-fecha-salida'), '2026-06-03')
    await user.clear(screen.getByTestId('input-monto-total'))
    await user.type(screen.getByTestId('input-monto-total'), '1000')
  }

  it('un descuento parcial ($200 sobre una base de $1000 tipeada a mano) baja el total a $800, sin error', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user)

    await aplicarDescuento(user, 200)

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(800))
    expect(screen.queryByTestId('error-descuento-excede')).not.toBeInTheDocument()
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

  it('un descuento EXACTAMENTE IGUAL a la base ($1000 sobre $1000) es válido — total $0, sin error, y se comporta como cualquier reserva a $0', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user)
    await aplicarDescuento(user, 1000)

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(0))
    expect(screen.queryByTestId('error-descuento-excede')).not.toBeInTheDocument()
    // El desglose SÍ se muestra (es válido): Precio base $1.000, Descuento − $1.000, Total final $0.
    expect(screen.getByText('− $1.000')).toBeInTheDocument()

    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoInsertReservas()).not.toBeNull())
    const inserted = mockSupabase.getUltimoInsertReservas()
    expect(Number(inserted.monto_total)).toBe(0)
    expect(Number(inserted.descuento_monto)).toBe(1000)
    expect(inserted.fecha_vencimiento).toBeNull()
    expect(sendEmailConfirmacion).not.toHaveBeenCalled()
  })

  it('un descuento UN PESO por encima de la base ($1001 sobre $1000) es INVÁLIDO — muestra error, el total se mantiene en $1000 sin cambios', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user)

    await aplicarDescuento(user, 1001)

    await waitFor(() => expect(screen.getByTestId('error-descuento-excede')).toBeInTheDocument())
    expect(screen.getByTestId('error-descuento-excede').textContent).toBe(
      'El descuento no puede ser mayor al monto total ($1.000)'
    )
    // El total NO cambia — se queda en la base, como si no hubiera
    // descuento todavía (nada de clamp a $0 ni ningún otro valor).
    expect(screen.getByTestId('input-monto-total')).toHaveValue(1000)
    // El desglose no se muestra mientras es inválido (mostrar "Total
    // final $1000" con "Descuento -$1001" sería contradictorio).
    expect(screen.queryByText('Total final')).not.toBeInTheDocument()

    // Si se envía en este estado inválido, no se persiste ningún
    // descuento — coincide con lo que se ve en pantalla.
    await user.click(screen.getByTestId('btn-submit-reserva'))
    await waitFor(() => expect(mockSupabase.getUltimoInsertReservas()).not.toBeNull())
    const inserted = mockSupabase.getUltimoInsertReservas()
    expect(Number(inserted.monto_total)).toBe(1000)
    expect(inserted.descuento_monto).toBeNull()
    expect(inserted.descuento_motivo).toBeNull()
  })

  it('escribir un monto que excede la base y después corregirlo hace desaparecer el error y aplica el descuento correcto', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user)

    await aplicarDescuento(user, 1500)
    await waitFor(() => expect(screen.getByTestId('error-descuento-excede')).toBeInTheDocument())
    expect(screen.getByTestId('input-monto-total')).toHaveValue(1000)

    const montoInput = screen.getByTestId('input-descuento-monto')
    await user.clear(montoInput)
    await user.type(montoInput, '300')

    await waitFor(() => expect(screen.queryByTestId('error-descuento-excede')).not.toBeInTheDocument())
    expect(screen.getByTestId('input-monto-total')).toHaveValue(700)
  })

  it('un descuento de $0 (o vacío) no cambia el total — se comporta como si no hubiera descuento, sigue > $0', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user)

    await user.click(screen.getByText('Aplicar descuento'))
    // No se tipea nada en el monto — queda vacío.
    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(1000))
    expect(screen.queryByTestId('error-descuento-excede')).not.toBeInTheDocument()

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

  function renderEnEdicion() {
    return render(
      <MemoryRouter initialEntries={['/cabanas-vip/reservas/reserva-existente-id/editar']}>
        <Routes>
          <Route path="/:complejoSlug/reservas/:id/editar" element={<ReservaForm />} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('tildar "Aplicar descuento" y poner $200 en edición baja el total de $1000 a $800, y se persiste en el update', async () => {
    const user = userEvent.setup()
    renderEnEdicion()

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

  it('un descuento en edición que supera la base es inválido — muestra error, el total se mantiene en $1000', async () => {
    const user = userEvent.setup()
    renderEnEdicion()

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(1000))

    await aplicarDescuento(user, 5000)

    await waitFor(() => expect(screen.getByTestId('error-descuento-excede')).toBeInTheDocument())
    expect(screen.getByTestId('error-descuento-excede').textContent).toBe(
      'El descuento no puede ser mayor al monto total ($1.000)'
    )
    expect(screen.getByTestId('input-monto-total')).toHaveValue(1000)
  })

  it('en edición, corregir un monto inválido a uno válido hace desaparecer el error y aplica el descuento', async () => {
    const user = userEvent.setup()
    renderEnEdicion()

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(1000))

    await aplicarDescuento(user, 5000)
    await waitFor(() => expect(screen.getByTestId('error-descuento-excede')).toBeInTheDocument())

    const montoInput = screen.getByTestId('input-descuento-monto')
    await user.clear(montoInput)
    await user.type(montoInput, '1000')

    await waitFor(() => expect(screen.queryByTestId('error-descuento-excede')).not.toBeInTheDocument())
    expect(screen.getByTestId('input-monto-total')).toHaveValue(0)
  })
})

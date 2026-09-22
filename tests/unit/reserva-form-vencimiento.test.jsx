// Prueba la decisión real (handleSubmit, ReservaForm.jsx) de que
// fecha_vencimiento se setea EN EL INSERT, independiente por completo
// de si sendEmailConfirmacion tiene éxito o falla — a diferencia del
// código viejo, donde fecha_vencimiento sólo se seteaba adentro del
// .then() de éxito de ese email (y como ese email nunca resuelve con
// éxito en producción — investigado en la tarea anterior — el
// vencimiento nunca se seteaba para NINGUNA reserva). Renderiza el
// componente real y completa/envía el formulario — no reimplementa
// handleSubmit.
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

// Query builder "universal": cualquier cadena de select/eq/neq/like/
// order/limit/lt/gt/in devuelve el mismo objeto encadenable, que
// además es awaitable directo (resuelve {data:[],error:null} salvo que
// se pida explícitamente otra cosa) — cubre los varios .from('reservas')
// de sólo lectura que disparan los efectos de fondo (fetchNextCode,
// chequeo de ocupadas, chequeo de superposición en el submit) sin tener
// que mockear cada uno por separado. `insert` sobre 'reservas' se
// captura aparte para poder inspeccionar el payload real que
// handleSubmit mandó a la base.
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
      // Rama de edición: handleSubmit hace `await supabase.from('reservas')
      // .update(payload).eq('id', id)` (sin .single()) — se captura el
      // payload acá para poder confirmar que nunca incluye fecha_vencimiento.
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
        // .select('*').eq('id', id).single() — carga de la reserva a editar.
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

async function completarYEnviarFormulario(user) {
  await waitFor(() => expect(screen.getByTestId('select-cabana')).toBeInTheDocument())

  await user.type(screen.getByTestId('input-nombre-apellido'), 'Huésped de Prueba')
  await user.type(screen.getByTestId('input-email'), 'huesped@example.com')
  await user.selectOptions(screen.getByTestId('select-cabana'), 'Cabaña 1')
  await user.type(screen.getByTestId('input-fecha-entrada'), '2026-06-01')
  await user.type(screen.getByTestId('input-fecha-salida'), '2026-06-03')
  await user.clear(screen.getByTestId('input-monto-total'))
  await user.type(screen.getByTestId('input-monto-total'), '15000')

  await user.click(screen.getByTestId('btn-submit-reserva'))
}

describe('ReservaForm.jsx — fecha_vencimiento al crear, independiente del email (código real)', () => {
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
  })

  it('el email de confirmación FALLA (rejecta) y fecha_vencimiento se setea igual, en el insert', async () => {
    sendEmailConfirmacion.mockRejectedValue(new Error('EmailJS no está configurado'))
    const user = userEvent.setup()

    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarYEnviarFormulario(user)

    await waitFor(() => expect(mockSupabase.getUltimoInsertReservas()).not.toBeNull())
    const inserted = mockSupabase.getUltimoInsertReservas()

    expect(inserted.estado).toBe('Pendiente')
    expect(inserted.fecha_vencimiento).not.toBeNull()

    const vencimiento = new Date(inserted.fecha_vencimiento).getTime()
    const esperado = Date.now() + 48 * 60 * 60 * 1000
    expect(Math.abs(vencimiento - esperado)).toBeLessThan(5000) // tolerancia de 5s

    // Confirma que efectivamente se intentó el email (y que rejectó) —
    // el insert con fecha_vencimiento no depende de este resultado.
    await waitFor(() => expect(sendEmailConfirmacion).toHaveBeenCalled())
  })

  it('el email de confirmación tiene ÉXITO y fecha_vencimiento sigue viniendo del insert (no cambia)', async () => {
    sendEmailConfirmacion.mockResolvedValue(new Date().toISOString())
    const user = userEvent.setup()

    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarYEnviarFormulario(user)

    await waitFor(() => expect(mockSupabase.getUltimoInsertReservas()).not.toBeNull())
    const inserted = mockSupabase.getUltimoInsertReservas()

    expect(inserted.fecha_vencimiento).not.toBeNull()
    const vencimiento = new Date(inserted.fecha_vencimiento).getTime()
    const esperado = Date.now() + 48 * 60 * 60 * 1000
    expect(Math.abs(vencimiento - esperado)).toBeLessThan(5000)
  })

  it('reserva a $0 → fecha_vencimiento sigue viniendo null en el insert (no regresiona el fix anterior)', async () => {
    sendEmailConfirmacion.mockResolvedValue(new Date().toISOString())
    const user = userEvent.setup()

    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await waitFor(() => expect(screen.getByTestId('select-cabana')).toBeInTheDocument())

    await user.type(screen.getByTestId('input-nombre-apellido'), 'Huésped Gratis')
    await user.type(screen.getByTestId('input-email'), 'gratis@example.com')
    await user.selectOptions(screen.getByTestId('select-cabana'), 'Cabaña 1')
    await user.type(screen.getByTestId('input-fecha-entrada'), '2026-06-01')
    await user.type(screen.getByTestId('input-fecha-salida'), '2026-06-03')
    await user.clear(screen.getByTestId('input-monto-total'))
    await user.type(screen.getByTestId('input-monto-total'), '0')
    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoInsertReservas()).not.toBeNull())
    const inserted = mockSupabase.getUltimoInsertReservas()

    expect(Number(inserted.monto_total)).toBe(0)
    expect(inserted.fecha_vencimiento).toBeNull()
    expect(sendEmailConfirmacion).not.toHaveBeenCalled()
  })
})

// Requisito #3 del pedido: re-guardar una reserva Pendiente YA EXISTENTE
// no debe tocar su fecha_vencimiento (no debe resetear el reloj de
// vencimiento). El código real sólo calcula/asigna fecha_vencimiento
// adentro de la rama `else` (creación) de handleSubmit — la rama
// `if (isEdit)` llama a `.update(payload)` con el mismo `payload`
// compartido, que nunca incluye ese campo. Este test carga una reserva
// existente en modo edición, la re-envía sin tocar nada, y confirma que
// el payload de UPDATE mandado a Supabase no trae `fecha_vencimiento`.
describe('ReservaForm.jsx — editar una reserva Pendiente existente NO toca fecha_vencimiento (código real)', () => {
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
    monto_total: 15000,
    sena1_monto: 0,
    sena1_tipo: 'Banco',
    sena2_monto: 0,
    sena2_tipo: 'Banco',
    pago_cabana_monto: 0,
    estado: 'Pendiente',
    // Vencimiento ya seteado en la creación original — el punto del test
    // es confirmar que re-guardar no lo pisa ni lo borra vía el payload.
    fecha_vencimiento: '2026-01-01T00:00:00.000Z',
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

  it('re-guardar sin cambios no incluye fecha_vencimiento en el payload de UPDATE', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/cabanas-vip/reservas/reserva-existente-id/editar']}>
        <Routes>
          <Route path="/:complejoSlug/reservas/:id/editar" element={<ReservaForm />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTestId('input-nombre-apellido')).toHaveValue('Huésped Existente'))

    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoUpdateReservas()).not.toBeNull())
    const updated = mockSupabase.getUltimoUpdateReservas()

    expect(updated).not.toHaveProperty('fecha_vencimiento')
    // Confirma también que nunca se disparó el camino de creación (insert).
    expect(mockSupabase.getUltimoInsertReservas()).toBeNull()
  })
})

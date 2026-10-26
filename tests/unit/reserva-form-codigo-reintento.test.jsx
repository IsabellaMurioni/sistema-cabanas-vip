// fetchNextCode (ReservaForm.jsx) calcula el próximo código en el
// cliente (MAX(codigo)+1), sin ninguna atomicidad — dos "Nueva
// reserva" abiertas casi al mismo tiempo para el MISMO complejo pueden
// calcular el mismo código antes de que ninguna de las dos haya
// insertado. El UNIQUE (complejo_id, codigo) (migración 014) protege
// la integridad de datos rechazando el segundo insert con un choque
// Postgres 23505 (unique_violation) — este test confirma que
// handleSubmit, ante ESE error específico, pide un código nuevo y
// reintenta el insert en vez de mostrarle al usuario el error crudo de
// la base. No reimplementa handleSubmit: renderiza el componente real
// y completa/envía el formulario, igual que reserva-form-vencimiento.test.jsx.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ReservaForm from '../../src/pages/ReservaForm'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../src/context/ComplejoContext', () => ({ useComplejo: vi.fn(), nombreActualDeCabana: (cabanasActivo, nombre) => nombre }))
vi.mock('../../src/lib/email', () => ({
  sendEmailConfirmacion: vi.fn(),
  sendEmailRecibo: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'
import { sendEmailConfirmacion } from '../../src/lib/email'

const COMPLEJO_VIP = { id: 'complejo-vip', slug: 'cabanas-vip', nombre: 'Cabañas VIP' }

// Mock de supabase a medida (no el genérico de reserva-form-vencimiento.
// test.jsx): necesita distinguir la lectura puntual de fetchNextCode
// (`.select('codigo')`, sin tocar ningún otro `.select(...)` de
// chequeo de conflicto/ocupación) para poder devolver un código
// DISTINTO cada vez que se llama, y necesita que el PRIMER insert a
// 'reservas' falle con 23505 mientras el SEGUNDO tenga éxito.
function makeSupabaseMock({ firstAttemptError = null } = {}) {
  let fetchCodigoCallCount = 0
  let insertReservasCallCount = 0
  const insertsReservasCapturados = []

  const from = vi.fn((table) => {
    let esInsert = false
    let selectArg = null
    const builder = {
      select: (arg) => { selectArg = arg; return builder },
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
        if (table === 'reservas') {
          insertReservasCallCount++
          insertsReservasCapturados.push(payload)
        }
        return builder
      },
      update: () => builder,
      single: () => {
        if (table === 'reservas' && esInsert) {
          if (firstAttemptError && insertReservasCallCount === 1) {
            return Promise.resolve({ data: null, error: firstAttemptError })
          }
          const payload = insertsReservasCapturados[insertsReservasCapturados.length - 1]
          return Promise.resolve({ data: { id: 'nueva-reserva-id', ...payload }, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
      then: (onFulfilled, onRejected) => {
        if (table === 'reservas' && selectArg === 'codigo') {
          fetchCodigoCallCount++
          // "Último código" distinto en cada llamada — así se puede
          // confirmar que el reintento pidió uno NUEVO, no reenvió el
          // mismo que ya chocó.
          const ultimoCodigoExistente = `A250${fetchCodigoCallCount}`
          return Promise.resolve({ data: [{ codigo: ultimoCodigoExistente }], error: null }).then(onFulfilled, onRejected)
        }
        return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
      },
    }
    return builder
  })

  return {
    from,
    getInsertsReservasCapturados: () => insertsReservasCapturados,
    getInsertReservasCallCount: () => insertReservasCallCount,
  }
}

async function completarYEnviarFormulario(user) {
  await waitFor(() => expect(screen.getByTestId('cabana-picker-trigger')).toBeInTheDocument())

  await user.type(screen.getByTestId('input-nombre-apellido'), 'Huésped de Prueba')
  await user.type(screen.getByTestId('input-email'), 'huesped@example.com')
  await user.click(screen.getByTestId('cabana-picker-trigger'))
  await user.click(screen.getByTestId('cabana-picker-row-Cabaña 1'))
  await user.click(screen.getByTestId('cabana-picker-listo'))
  await user.type(screen.getByTestId('input-fecha-entrada'), '2026-06-01')
  await user.type(screen.getByTestId('input-fecha-salida'), '2026-06-03')
  await user.clear(screen.getByTestId('input-monto-total'))
  await user.type(screen.getByTestId('input-monto-total'), '15000')

  await user.click(screen.getByTestId('btn-submit-reserva'))
}

describe('ReservaForm.jsx — reintento ante choque de código (23505) al crear', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useComplejo.mockReturnValue({
      complejoActivo: COMPLEJO_VIP,
      cabanasNombres: ['Cabaña 1', 'Cabaña 2'],
      cabanasPorGrupo: [{ grupo: null, cabanas: ['Cabaña 1', 'Cabaña 2'] }],
    })
    sendEmailConfirmacion.mockResolvedValue(new Date().toISOString())
  })

  it('el primer insert choca con 23505 → pide un código nuevo y reintenta, sin mostrarle error al usuario', async () => {
    const mockSupabase = makeSupabaseMock({
      firstAttemptError: { code: '23505', message: 'duplicate key value violates unique constraint "reservas_codigo_complejo_key"' },
    })
    supabase.from.mockImplementation(mockSupabase.from)
    const user = userEvent.setup()

    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarYEnviarFormulario(user)

    // Reintento invisible: se terminó llamando a insert DOS veces
    // (el que chocó + el reintento exitoso), y la navegación/éxito se
    // completó sin que aparezca el banner de error.
    await waitFor(() => expect(mockSupabase.getInsertReservasCallCount()).toBe(2))

    const [primerIntento, segundoIntento] = mockSupabase.getInsertsReservasCapturados()
    expect(primerIntento.codigo).toBe('A2502')
    expect(segundoIntento.codigo).toBe('A2503')
    expect(segundoIntento.codigo).not.toBe(primerIntento.codigo)

    // El resto del payload (todo lo que el usuario tipeó) viaja igual
    // en ambos intentos — el reintento sólo cambia el código.
    expect(segundoIntento.nombre_apellido).toBe('Huésped de Prueba')
    expect(segundoIntento.email).toBe('huesped@example.com')

    expect(screen.queryByText(/Error al guardar/i)).not.toBeInTheDocument()
  })

  it('sin choque de código, el insert se hace una sola vez (no reintenta de más)', async () => {
    const mockSupabase = makeSupabaseMock()
    supabase.from.mockImplementation(mockSupabase.from)
    const user = userEvent.setup()

    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarYEnviarFormulario(user)

    await waitFor(() => expect(mockSupabase.getInsertReservasCallCount()).toBeGreaterThan(0))
    // Dar tiempo a que, si hubiera un reintento de más, ya se hubiera
    // disparado — confirma que se queda en 1.
    await new Promise((r) => setTimeout(r, 50))
    expect(mockSupabase.getInsertReservasCallCount()).toBe(1)
  })

  it('un error que NO es 23505 muestra el banner de error de siempre, sin reintentar', async () => {
    const mockSupabase = makeSupabaseMock({
      firstAttemptError: { code: '23514', message: 'check constraint violation' },
    })
    supabase.from.mockImplementation(mockSupabase.from)
    const user = userEvent.setup()

    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarYEnviarFormulario(user)

    await waitFor(() => expect(screen.getByText(/Error al guardar/i)).toBeInTheDocument())
    expect(mockSupabase.getInsertReservasCallCount()).toBe(1)
  })
})

// Multi-select de cabañas al crear una reserva (ReservaForm.jsx), vía
// el control custom CabinMultiPicker: Lorena puede elegir una o más
// cabañas para la MISMA reserva (mismas fechas/cliente/precio). Antes
// de crear, se chequea CADA cabaña elegida contra reservas no
// canceladas existentes — si CUALQUIERA tiene conflicto, no se crea
// nada (all-or-nothing). Si no hay conflictos, se crea UNA sola fila
// en `reservas`, con `cabana` = los nombres elegidos unidos con "\n",
// en el orden de selección.
//
// Requisito crítico de compatibilidad: con exactamente UNA cabaña
// elegida (el caso de hoy, la gran mayoría), `cabana` debe quedar
// IDÉNTICO a como queda hoy — un string plano, sin "\n" — para que
// Disponibilidad/Reservas/emails/Ganancias/Caja/el cron, que hacen
// match exacto contra esa columna, sigan funcionando sin cambios.
//
// Este archivo prueba el control NUEVO (CabinMultiPicker: abrir el
// trigger, clickear cada fila por su cabaña, cerrar con "Listo") en
// vez del <select multiple> nativo de antes — pero ejercita exactamente
// la misma lógica de abajo (cabanasSeleccionadas/toggleCabana/
// getConflictoMultiple/el re-chequeo final en submit), sin reimplementar
// nada de eso.
//
// Dos capas de protección, ambas cubiertas acá:
//  1. UI: el botón de submit YA se deshabilita cuando `fechaConflicto`
//     (el preview en vivo) detecta un conflicto — comportamiento
//     PRE-EXISTENTE (disabled={saving || !!fechaConflicto || ...}),
//     sin cambios. Con una cabaña en conflicto entre las elegidas, el
//     preview en vivo lo detecta y el botón queda deshabilitado — un
//     click real (userEvent.click) correctamente no hace nada, igual
//     que en un navegador real.
//  2. Lógica: el re-chequeo final en handleSubmit (código real, no
//     reimplementado acá) es la red de seguridad — por si el preview
//     en vivo quedara desactualizado. Para probar ESE código
//     directamente (no sólo que el botón quede deshabilitado), estos
//     tests disparan el evento submit del <form> directo
//     (fireEvent.submit), que sí llega al handler de React incluso
//     con el botón deshabilitado — igual que harían las otras pruebas
//     de ReservaForm si alguna vez necesitaran ejercitar ese camino.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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

// Mismo builder genérico que ya usa reserva-form-vencimiento.test.jsx
// (select/eq/neq/lt/gt/.../then resuelve {data:[],error:null} por
// default), extendido con `cabanasOcupadas`: un mapa cabaña -> filas
// ya "reservadas" para esa cabaña específica, para poder simular un
// conflicto sólo en una cabaña puntual entre varias seleccionadas.
function makeSupabaseMock({ cabanasOcupadas = {} } = {}) {
  let ultimoInsertReservas = null
  let cantidadInserts = 0

  const from = vi.fn((table) => {
    let cabanaFiltro = null
    let esInsert = false
    const builder = {
      select: () => builder,
      eq: (campo, valor) => {
        if (campo === 'cabana') cabanaFiltro = valor
        return builder
      },
      neq: () => builder,
      lt: () => builder,
      gt: () => builder,
      like: () => builder,
      order: () => builder,
      limit: () => builder,
      in: () => builder,
      insert: (payload) => {
        esInsert = true
        if (table === 'reservas') {
          ultimoInsertReservas = payload
          cantidadInserts += 1
        }
        return builder
      },
      single: () => {
        if (table === 'reservas' && esInsert) {
          return Promise.resolve({
            data: ultimoInsertReservas ? { id: `reserva-${cantidadInserts}`, ...ultimoInsertReservas } : null,
            error: null,
          })
        }
        return Promise.resolve({ data: null, error: null })
      },
      then: (onFulfilled, onRejected) => {
        const data = table === 'reservas' && cabanaFiltro && cabanasOcupadas[cabanaFiltro]
          ? cabanasOcupadas[cabanaFiltro]
          : []
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected)
      },
    }
    return builder
  })

  return {
    from,
    getUltimoInsertReservas: () => ultimoInsertReservas,
    getCantidadInserts: () => cantidadInserts,
  }
}

function setup({ cabanasOcupadas } = {}) {
  useComplejo.mockReturnValue({
    complejoActivo: COMPLEJO_VIP,
    cabanasNombres: ['Cabaña 1', 'Cabaña 2', 'Cabaña 3'],
    cabanasPorGrupo: [{ grupo: null, cabanas: ['Cabaña 1', 'Cabaña 2', 'Cabaña 3'] }],
  })
  const mockSupabase = makeSupabaseMock({ cabanasOcupadas })
  supabase.from.mockImplementation(mockSupabase.from)
  sendEmailConfirmacion.mockResolvedValue(new Date().toISOString())
  return mockSupabase
}

// Abre el picker, clickea cada cabaña pedida (toggleCabana real, una
// fila por vez) y cierra con "Listo" — equivalente, con el control
// nuevo, a lo que antes era un solo userEvent.selectOptions.
async function seleccionarCabanas(user, cabanas) {
  await user.click(screen.getByTestId('cabana-picker-trigger'))
  for (const cabana of cabanas) {
    await user.click(screen.getByTestId(`cabana-picker-row-${cabana}`))
  }
  await user.click(screen.getByTestId('cabana-picker-listo'))
}

async function completarDatosBase(user, { cabanas, email = 'huesped@example.com' } = {}) {
  await waitFor(() => expect(screen.getByTestId('cabana-picker-trigger')).toBeInTheDocument())
  await user.type(screen.getByTestId('input-nombre-apellido'), 'Huésped de Prueba')
  if (email) await user.type(screen.getByTestId('input-email'), email)
  if (cabanas) {
    const lista = Array.isArray(cabanas) ? cabanas : [cabanas]
    await seleccionarCabanas(user, lista)
  }
  await user.type(screen.getByTestId('input-fecha-entrada'), '2026-06-01')
  await user.type(screen.getByTestId('input-fecha-salida'), '2026-06-03')
  await user.clear(screen.getByTestId('input-monto-total'))
  await user.type(screen.getByTestId('input-monto-total'), '15000')
}

describe('ReservaForm.jsx — selección de UNA sola cabaña: compatibilidad exacta con hoy', () => {
  beforeEach(() => vi.clearAllMocks())

  it('seleccionar exactamente una cabaña guarda `cabana` como string plano, sin "\\n"', async () => {
    const mockSupabase = setup()
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user, { cabanas: 'Cabaña 1' })

    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoInsertReservas()).not.toBeNull())
    const inserted = mockSupabase.getUltimoInsertReservas()
    expect(inserted.cabana).toBe('Cabaña 1')
    expect(inserted.cabana).not.toContain('\n')
    expect(mockSupabase.getCantidadInserts()).toBe(1)
  })
})

describe('ReservaForm.jsx — multi-select de cabañas al crear (CabinMultiPicker)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sin conflictos en ninguna de las N cabañas elegidas: crea UNA sola fila, con `cabana` unidas por "\\n" en el orden de selección', async () => {
    const mockSupabase = setup()
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user, { cabanas: ['Cabaña 1', 'Cabaña 2', 'Cabaña 3'] })

    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoInsertReservas()).not.toBeNull())
    expect(mockSupabase.getCantidadInserts()).toBe(1) // una sola fila, no una por cabaña
    const inserted = mockSupabase.getUltimoInsertReservas()
    expect(inserted.cabana).toBe('Cabaña 1\nCabaña 2\nCabaña 3')
  })

  it('el preview en vivo detecta el conflicto y deshabilita el botón de submit (no se puede ni intentar enviar)', async () => {
    setup({
      cabanasOcupadas: {
        'Cabaña 2': [{ fecha_entrada: '2026-06-02', fecha_salida: '2026-06-05', nombre_apellido: 'Ocupante Previo' }],
      },
    })
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user, { cabanas: ['Cabaña 1', 'Cabaña 2', 'Cabaña 3'] })

    await waitFor(() => expect(screen.getByTestId('btn-submit-reserva')).toBeDisabled())
    expect(screen.getByText(/Fechas ya reservadas en Cabaña 2/)).toBeInTheDocument()
  })

  it('conflicto en UNA sola de varias cabañas elegidas bloquea TODA la creación — cero filas insertadas, ni para las cabañas libres', async () => {
    const mockSupabase = setup({
      cabanasOcupadas: {
        'Cabaña 2': [{ fecha_entrada: '2026-06-02', fecha_salida: '2026-06-05', nombre_apellido: 'Ocupante Previo' }],
      },
    })
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user, { cabanas: ['Cabaña 1', 'Cabaña 2', 'Cabaña 3'] })

    // El botón ya está deshabilitado acá (ver el test anterior) — se
    // dispara el submit del <form> directo para ejercitar el
    // re-chequeo final de handleSubmit en sí, no sólo la UI.
    fireEvent.submit(screen.getByTestId('cabana-picker-trigger').closest('form'))

    await waitFor(() => expect(screen.getByTestId('reserva-form-error')).toBeInTheDocument())
    expect(screen.getByTestId('reserva-form-error').textContent).toContain('Cabaña 2')
    expect(screen.getByTestId('reserva-form-error').textContent).toContain('Ocupante Previo')
    // Ni la cabaña en conflicto NI las otras dos (libres) generaron
    // ninguna fila — all-or-nothing, no un subconjunto.
    expect(mockSupabase.getCantidadInserts()).toBe(0)
    expect(mockSupabase.getUltimoInsertReservas()).toBeNull()
  })

  it('conflicto en varias cabañas a la vez: el mensaje de error menciona cada una', async () => {
    const mockSupabase = setup({
      cabanasOcupadas: {
        'Cabaña 1': [{ fecha_entrada: '2026-06-01', fecha_salida: '2026-06-04', nombre_apellido: 'García' }],
        'Cabaña 3': [{ fecha_entrada: '2026-06-02', fecha_salida: '2026-06-06', nombre_apellido: 'Pérez' }],
      },
    })
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user, { cabanas: ['Cabaña 1', 'Cabaña 2', 'Cabaña 3'] })

    fireEvent.submit(screen.getByTestId('cabana-picker-trigger').closest('form'))

    await waitFor(() => expect(screen.getByTestId('reserva-form-error')).toBeInTheDocument())
    const texto = screen.getByTestId('reserva-form-error').textContent
    expect(texto).toContain('Cabaña 1')
    expect(texto).toContain('García')
    expect(texto).toContain('Cabaña 3')
    expect(texto).toContain('Pérez')
    expect(mockSupabase.getCantidadInserts()).toBe(0)
  })

  it('el re-chequeo final en submit (no sólo el preview en vivo) también bloquea — simula una reserva que se crea DESPUÉS de que el preview ya cargó', async () => {
    // El preview en vivo (ver `ocupadasPorCabana`) pide una vez, cuando
    // cambia la selección de cabañas — si otra reserva ocupa "Cabaña 2"
    // DESPUÉS de eso (justo antes de enviar), el preview en vivo queda
    // desactualizado (fechaConflicto sigue vacío, botón habilitado). El
    // re-chequeo final de handleSubmit, que pide de nuevo directo a la
    // base en el momento del submit, es la red de seguridad para ese
    // caso — este test lo aísla: deja que el preview en vivo resuelva
    // primero con "libre" (botón habilitado), recién AHÍ muta los datos
    // del mock a "ocupada", y entonces clickea submit — igual que una
    // reserva creada por otra persona en el medio.
    const cabanasOcupadas = {}
    const mockSupabase = setup({ cabanasOcupadas })
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user, { cabanas: ['Cabaña 1', 'Cabaña 2', 'Cabaña 3'] })

    // El preview en vivo ya resolvió con "libre" — el botón está
    // habilitado (nada lo bloquea todavía).
    await waitFor(() => expect(screen.getByTestId('btn-submit-reserva')).not.toBeDisabled())

    // Ahora "aparece" una reserva en Cabaña 2 — el preview en vivo ya
    // no se vuelve a pedir solo (no cambió la selección de cabañas),
    // así que fechaConflicto sigue vacío y el botón sigue habilitado.
    cabanasOcupadas['Cabaña 2'] = [{ fecha_entrada: '2026-06-02', fecha_salida: '2026-06-05', nombre_apellido: 'Recién Llegado' }]
    expect(screen.getByTestId('btn-submit-reserva')).not.toBeDisabled()

    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(screen.getByTestId('reserva-form-error')).toBeInTheDocument())
    expect(screen.getByTestId('reserva-form-error').textContent).toContain('Cabaña 2')
    expect(screen.getByTestId('reserva-form-error').textContent).toContain('Recién Llegado')
    expect(mockSupabase.getCantidadInserts()).toBe(0)
    expect(mockSupabase.getUltimoInsertReservas()).toBeNull()
  })

  it('no se puede enviar sin elegir ninguna cabaña', async () => {
    setup()
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user, { cabanas: null })

    // A diferencia del <select multiple required> viejo, CabinMultiPicker
    // no es un control nativo — nada bloquea el submit a nivel HTML acá,
    // así que un click real alcanza para llegar al guard explícito de
    // handleSubmit ("Seleccioná al menos una cabaña").
    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(screen.getByTestId('reserva-form-error')).toBeInTheDocument())
    expect(screen.getByTestId('reserva-form-error').textContent).toContain('Seleccioná al menos una cabaña')
  })
})

describe('ReservaForm.jsx — interacción propia de CabinMultiPicker', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clickear una fila de cabaña togglea su selección SIN cerrar el picker', async () => {
    setup()
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await waitFor(() => expect(screen.getByTestId('cabana-picker-trigger')).toBeInTheDocument())

    await user.click(screen.getByTestId('cabana-picker-trigger'))
    expect(screen.getByTestId('cabana-picker-panel')).toBeInTheDocument()

    // Tildar una cabaña — el panel sigue abierto.
    await user.click(screen.getByTestId('cabana-picker-row-Cabaña 1'))
    expect(screen.getByTestId('cabana-picker-panel')).toBeInTheDocument()
    expect(screen.getByTestId('cabana-picker-chip-Cabaña 1')).toBeInTheDocument()

    // Seguir sumando otra cabaña más — sigue sin cerrarse.
    await user.click(screen.getByTestId('cabana-picker-row-Cabaña 2'))
    expect(screen.getByTestId('cabana-picker-panel')).toBeInTheDocument()
    expect(screen.getByTestId('cabana-picker-chip-Cabaña 2')).toBeInTheDocument()

    // Destildar la primera — sigue abierto, y el chip desaparece.
    await user.click(screen.getByTestId('cabana-picker-row-Cabaña 1'))
    expect(screen.getByTestId('cabana-picker-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('cabana-picker-chip-Cabaña 1')).not.toBeInTheDocument()
    expect(screen.getByTestId('cabana-picker-chip-Cabaña 2')).toBeInTheDocument()
  })

  it('las cabañas seleccionadas se muestran como chips en el trigger colapsado', async () => {
    setup()
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await waitFor(() => expect(screen.getByTestId('cabana-picker-trigger')).toBeInTheDocument())

    // Sin nada elegido, el trigger muestra el placeholder, no chips.
    expect(screen.getByText('Seleccionar cabaña')).toBeInTheDocument()

    await seleccionarCabanas(user, ['Cabaña 2', 'Cabaña 3'])

    // Picker cerrado (ya se clickeó "Listo" dentro de seleccionarCabanas).
    expect(screen.queryByTestId('cabana-picker-panel')).not.toBeInTheDocument()
    expect(screen.queryByText('Seleccionar cabaña')).not.toBeInTheDocument()

    const trigger = screen.getByTestId('cabana-picker-trigger')
    expect(trigger).toContainElement(screen.getByTestId('cabana-picker-chip-Cabaña 2'))
    expect(trigger).toContainElement(screen.getByTestId('cabana-picker-chip-Cabaña 3'))
  })
})

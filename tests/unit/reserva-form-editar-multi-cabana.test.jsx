// Edición de reserva (ReservaForm.jsx) — bug real pre-lanzamiento: el
// formulario de "Editar reserva" seguía usando el flujo viejo de UNA
// sola cabaña (dropdown BLOQUE → CABAÑA), que no entendía reservas
// multi-cabaña (cabana con varios nombres separados por "\n") — abrir
// una de esas para editar no mostraba ninguna cabaña seleccionada, con
// riesgo real de pisar/perder las cabañas de la reserva si se guardaba
// así sin darse cuenta.
//
// Fix: mismo CabinMultiPicker que ya usa creación, también en edición
// — un solo camino de código para los dos modos, en vez de dos. Al
// cargar el form en edición, `form.cabana` (split por "\n") precarga
// `cabanasSeleccionadas` con lo que ya estaba guardado, sin importar si
// es 1 cabaña o varias, de uno o de varios bloques. El resto de la
// lógica (toggleCabana/getConflictoMultiple/el re-chequeo final en
// submit) es EXACTAMENTE la misma que ya prueba
// reserva-form-multi-cabana.test.jsx para creación — acá sólo se
// ejercita en modo edición.
//
// Punto crítico: el chequeo de superposición en edición tiene que
// EXCLUIR a la propia reserva que se está editando (si no, reabrir
// cualquier reserva sin tocar fechas/cabañas se marcaría en falso
// conflicto consigo misma). Esto ya existía para el caso de una sola
// cabaña (`.neq('id', id)` en el re-chequeo final, y el filter por id
// en el preview en vivo) — estos tests confirman que sigue aplicando,
// ahora por cabaña, al unificar edición con el mismo
// cabanasSeleccionadas que usa creación.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
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

// Mismo builder genérico que ya usa reserva-form-multi-cabana.test.jsx
// (create), extendido con:
//  - `reservaExistente`: lo que devuelve `.eq('id', id).single()` al
//    cargar el form en edición.
//  - `update(payload)`: captura el payload del UPDATE (en vez de
//    insert) para los asserts.
//  - `neq('id', valor)` FUNCIONAL (no un no-op como en el mock de
//    creación): filtra ese id de `cabanasOcupadas[cabana]` antes de
//    resolver — necesario para poder probar de verdad la exclusión de
//    la propia reserva, tanto en el preview en vivo (que además filtra
//    de nuevo del lado de la app) como en el re-chequeo final del
//    submit (que depende 100% de este `.neq('id', id)` del lado del
//    mock, como en Supabase real).
function makeSupabaseMock({ cabanasOcupadas = {}, reservaExistente = null } = {}) {
  let ultimoUpdateReservas = null
  let cantidadUpdates = 0

  const from = vi.fn((table) => {
    let cabanaFiltro = null
    let idBuscado = null
    let idExcluido = null
    const builder = {
      select: () => builder,
      eq: (campo, valor) => {
        if (campo === 'cabana') cabanaFiltro = valor
        if (campo === 'id') idBuscado = valor
        return builder
      },
      neq: (campo, valor) => {
        if (campo === 'id') idExcluido = valor
        return builder
      },
      lt: () => builder,
      gt: () => builder,
      like: () => builder,
      ilike: () => builder,
      order: () => builder,
      limit: () => builder,
      in: () => builder,
      delete: () => builder,
      update: (payload) => {
        if (table === 'reservas') {
          ultimoUpdateReservas = payload
          cantidadUpdates += 1
        }
        return builder
      },
      single: () => {
        if (table === 'reservas' && idBuscado && reservaExistente) {
          return Promise.resolve({ data: reservaExistente, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
      then: (onFulfilled, onRejected) => {
        let data = table === 'reservas' && cabanaFiltro && cabanasOcupadas[cabanaFiltro]
          ? cabanasOcupadas[cabanaFiltro]
          : []
        if (idExcluido !== null) data = data.filter((r) => String(r.id) !== String(idExcluido))
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected)
      },
    }
    return builder
  })

  return {
    from,
    getUltimoUpdateReservas: () => ultimoUpdateReservas,
    getCantidadUpdates: () => cantidadUpdates,
  }
}

function renderEnEdicion(reservaId = 'reserva-existente-id') {
  render(
    <MemoryRouter initialEntries={[`/cabanas-vip/reservas/${reservaId}/editar`]}>
      <Routes>
        <Route path="/:complejoSlug/reservas/:id/editar" element={<ReservaForm />} />
      </Routes>
    </MemoryRouter>
  )
}

async function seleccionarCabanas(user, cabanas) {
  for (const cabana of cabanas) {
    await user.click(screen.getByTestId(`cabana-picker-row-${cabana}`))
  }
}

beforeEach(() => vi.clearAllMocks())

describe('ReservaForm.jsx — editar: compatibilidad de UNA sola cabaña (sin regresión)', () => {
  const RESERVA_UNA_CABANA = {
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
    sena2_monto: 0,
    pago_cabana_monto: 0,
    estado: 'Pendiente',
  }

  it('el picker abre con esa única cabaña pre-tildada (chip visible sin abrir el panel)', async () => {
    useComplejo.mockReturnValue({
      complejoActivo: COMPLEJO_VIP,
      cabanasPorGrupo: [{ grupo: null, cabanas: ['Cabaña 1', 'Cabaña 2', 'Cabaña 3'] }],
    })
    const mockSupabase = makeSupabaseMock({ reservaExistente: RESERVA_UNA_CABANA })
    supabase.from.mockImplementation(mockSupabase.from)
    sendEmailConfirmacion.mockResolvedValue(new Date().toISOString())

    renderEnEdicion()

    await waitFor(() => expect(screen.getByTestId('cabana-picker-chip-Cabaña 1')).toBeInTheDocument())
    // Nada más aparece tildado.
    expect(screen.queryByTestId('cabana-picker-chip-Cabaña 2')).not.toBeInTheDocument()
  })

  it('guardar sin tocar la cabaña persiste `cabana` IDÉNTICO (string plano, sin regresión vs. hoy)', async () => {
    useComplejo.mockReturnValue({
      complejoActivo: COMPLEJO_VIP,
      cabanasPorGrupo: [{ grupo: null, cabanas: ['Cabaña 1', 'Cabaña 2', 'Cabaña 3'] }],
    })
    const mockSupabase = makeSupabaseMock({ reservaExistente: RESERVA_UNA_CABANA })
    supabase.from.mockImplementation(mockSupabase.from)
    sendEmailConfirmacion.mockResolvedValue(new Date().toISOString())

    const user = userEvent.setup()
    renderEnEdicion()

    await waitFor(() => expect(screen.getByTestId('cabana-picker-chip-Cabaña 1')).toBeInTheDocument())
    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoUpdateReservas()).not.toBeNull())
    const updated = mockSupabase.getUltimoUpdateReservas()
    expect(updated.cabana).toBe('Cabaña 1')
    expect(updated.cabana).not.toContain('\n')
    expect(mockSupabase.getCantidadUpdates()).toBe(1)
  })
})

describe('ReservaForm.jsx — editar: reserva multi-cabaña del MISMO bloque', () => {
  const RESERVA_DOS_CABANAS = {
    id: 'reserva-multi-id',
    codigo: 'A5678',
    nombre_apellido: 'Huésped Multi',
    email: 'multi@example.com',
    cabana: 'Mimmo A\nMimmo B',
    pax: 4,
    fecha_entrada: '2026-08-01',
    fecha_salida: '2026-08-03',
    noches: 2,
    mes: 'Agosto',
    monto_total: 20000,
    sena1_monto: 0,
    sena2_monto: 0,
    pago_cabana_monto: 0,
    estado: 'Pendiente',
  }

  function setup() {
    useComplejo.mockReturnValue({
      complejoActivo: COMPLEJO_VIP,
      cabanasPorGrupo: [{ grupo: 'MIMMO I', cabanas: ['Mimmo A', 'Mimmo B', 'Mimmo C'] }],
    })
    const mockSupabase = makeSupabaseMock({ reservaExistente: RESERVA_DOS_CABANAS })
    supabase.from.mockImplementation(mockSupabase.from)
    sendEmailConfirmacion.mockResolvedValue(new Date().toISOString())
    return mockSupabase
  }

  it('el picker abre con AMBAS cabañas pre-tildadas', async () => {
    setup()
    renderEnEdicion('reserva-multi-id')

    await waitFor(() => expect(screen.getByTestId('cabana-picker-chip-Mimmo A')).toBeInTheDocument())
    expect(screen.getByTestId('cabana-picker-chip-Mimmo B')).toBeInTheDocument()
    expect(screen.queryByTestId('cabana-picker-chip-Mimmo C')).not.toBeInTheDocument()
  })

  it('agregar y sacar una cabaña durante la edición guarda la lista actualizada, unida por "\\n"', async () => {
    const mockSupabase = setup()
    const user = userEvent.setup()
    renderEnEdicion('reserva-multi-id')

    await waitFor(() => expect(screen.getByTestId('cabana-picker-chip-Mimmo A')).toBeInTheDocument())

    await user.click(screen.getByTestId('cabana-picker-trigger'))
    // Saca Mimmo B, agrega Mimmo C — Mimmo A queda como estaba.
    await seleccionarCabanas(user, ['Mimmo B', 'Mimmo C'])
    await user.click(screen.getByTestId('cabana-picker-listo'))

    expect(screen.getByTestId('cabana-picker-chip-Mimmo A')).toBeInTheDocument()
    expect(screen.queryByTestId('cabana-picker-chip-Mimmo B')).not.toBeInTheDocument()
    expect(screen.getByTestId('cabana-picker-chip-Mimmo C')).toBeInTheDocument()

    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoUpdateReservas()).not.toBeNull())
    expect(mockSupabase.getUltimoUpdateReservas().cabana).toBe('Mimmo A\nMimmo C')
  })
})

describe('ReservaForm.jsx — editar: reserva multi-cabaña de DOS bloques distintos', () => {
  const RESERVA_DOS_BLOQUES = {
    id: 'reserva-dosbloques-id',
    codigo: 'A9999',
    nombre_apellido: 'Huésped Dos Bloques',
    email: 'dosbloques@example.com',
    cabana: 'Mimmo I A\nMimmo II A',
    pax: 6,
    fecha_entrada: '2026-09-01',
    fecha_salida: '2026-09-03',
    noches: 2,
    mes: 'Septiembre',
    monto_total: 30000,
    sena1_monto: 0,
    sena2_monto: 0,
    pago_cabana_monto: 0,
    estado: 'Pendiente',
  }

  function setup() {
    useComplejo.mockReturnValue({
      complejoActivo: COMPLEJO_VIP,
      cabanasPorGrupo: [
        { grupo: 'MIMMO I', cabanas: ['Mimmo I A', 'Mimmo I B'] },
        { grupo: 'MIMMO II', cabanas: ['Mimmo II A', 'Mimmo II B'] },
      ],
    })
    const mockSupabase = makeSupabaseMock({ reservaExistente: RESERVA_DOS_BLOQUES })
    supabase.from.mockImplementation(mockSupabase.from)
    sendEmailConfirmacion.mockResolvedValue(new Date().toISOString())
    return mockSupabase
  }

  it('el picker abre con las cabañas de AMBOS bloques pre-tildadas, agrupadas correctamente', async () => {
    setup()
    const user = userEvent.setup()
    renderEnEdicion('reserva-dosbloques-id')

    await waitFor(() => expect(screen.getByTestId('cabana-picker-chip-Mimmo I A')).toBeInTheDocument())
    expect(screen.getByTestId('cabana-picker-chip-Mimmo II A')).toBeInTheDocument()

    await user.click(screen.getByTestId('cabana-picker-trigger'))
    const panel = screen.getByTestId('cabana-picker-panel')
    expect(within(panel).getByText('MIMMO I')).toBeInTheDocument()
    expect(within(panel).getByText('MIMMO II')).toBeInTheDocument()

    // Cada fila tildada muestra el check (fondo celeste + tache) — las
    // otras dos cabañas (I B / II B) quedan sin tildar.
    const filaIA = screen.getByTestId('cabana-picker-row-Mimmo I A')
    const filaIIA = screen.getByTestId('cabana-picker-row-Mimmo II A')
    const filaIB = screen.getByTestId('cabana-picker-row-Mimmo I B')
    expect(filaIA.style.backgroundColor).toBe('rgb(238, 244, 255)') // #EEF4FF — tildada
    expect(filaIIA.style.backgroundColor).toBe('rgb(238, 244, 255)')
    expect(filaIB.style.backgroundColor).toBe('rgb(255, 255, 255)') // #fff — sin tildar
  })

  it('guardar sin tocar nada persiste ambas cabañas, en el mismo orden, unidas por "\\n"', async () => {
    const mockSupabase = setup()
    renderEnEdicion('reserva-dosbloques-id')

    await waitFor(() => expect(screen.getByTestId('cabana-picker-chip-Mimmo I A')).toBeInTheDocument())
    await userEvent.setup().click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoUpdateReservas()).not.toBeNull())
    expect(mockSupabase.getUltimoUpdateReservas().cabana).toBe('Mimmo I A\nMimmo II A')
  })
})

describe('ReservaForm.jsx — editar: la validación de superposición EXCLUYE a la propia reserva', () => {
  const RESERVA_EXISTENTE = {
    id: 'reserva-self-id',
    codigo: 'A1111',
    nombre_apellido: 'Huésped Propio',
    email: 'propio@example.com',
    cabana: 'Mimmo A\nMimmo B',
    pax: 4,
    fecha_entrada: '2026-10-01',
    fecha_salida: '2026-10-03',
    noches: 2,
    mes: 'Octubre',
    monto_total: 20000,
    sena1_monto: 0,
    sena2_monto: 0,
    pago_cabana_monto: 0,
    estado: 'Pendiente',
  }

  it('re-guardar SIN cambiar fechas ni cabañas no dispara un falso conflicto consigo misma (ni en el preview en vivo ni en el submit)', async () => {
    useComplejo.mockReturnValue({
      complejoActivo: COMPLEJO_VIP,
      cabanasPorGrupo: [{ grupo: 'MIMMO I', cabanas: ['Mimmo A', 'Mimmo B', 'Mimmo C'] }],
    })
    // "cabanasOcupadas" simula lo que devolvería la base: la fila de
    // CADA cabaña incluye la reserva actual (mismo id, mismas fechas) —
    // exactamente lo que pasaría en producción, porque esta reserva
    // misma ES una fila ocupando esas cabañas en esas fechas. Si la
    // exclusión por id no funcionara, esto se marcaría como conflicto
    // consigo misma.
    const mockSupabase = makeSupabaseMock({
      reservaExistente: RESERVA_EXISTENTE,
      cabanasOcupadas: {
        'Mimmo A': [{ id: 'reserva-self-id', fecha_entrada: '2026-10-01', fecha_salida: '2026-10-03', nombre_apellido: 'Huésped Propio' }],
        'Mimmo B': [{ id: 'reserva-self-id', fecha_entrada: '2026-10-01', fecha_salida: '2026-10-03', nombre_apellido: 'Huésped Propio' }],
      },
    })
    supabase.from.mockImplementation(mockSupabase.from)
    sendEmailConfirmacion.mockResolvedValue(new Date().toISOString())

    const user = userEvent.setup()
    renderEnEdicion('reserva-self-id')

    await waitFor(() => expect(screen.getByTestId('cabana-picker-chip-Mimmo A')).toBeInTheDocument())

    // Preview en vivo: sin aviso de fechas ocupadas, botón habilitado.
    expect(screen.queryByText(/Fechas ya reservadas/)).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('btn-submit-reserva')).not.toBeDisabled())

    await user.click(screen.getByTestId('btn-submit-reserva'))

    // El re-chequeo final del submit tampoco la bloquea — llega a
    // guardar de verdad, sin ningún error de conflicto.
    await waitFor(() => expect(mockSupabase.getUltimoUpdateReservas()).not.toBeNull())
    expect(screen.queryByTestId('reserva-form-error')).not.toBeInTheDocument()
    expect(mockSupabase.getUltimoUpdateReservas().cabana).toBe('Mimmo A\nMimmo B')
  })

  it('agregar una cabaña que SÍ choca con una reserva de otra persona bloquea todo, all-or-nothing', async () => {
    useComplejo.mockReturnValue({
      complejoActivo: COMPLEJO_VIP,
      cabanasPorGrupo: [{ grupo: 'MIMMO I', cabanas: ['Mimmo A', 'Mimmo B', 'Mimmo C'] }],
    })
    const mockSupabase = makeSupabaseMock({
      reservaExistente: RESERVA_EXISTENTE,
      cabanasOcupadas: {
        // La propia reserva, en sus propias cabañas (se excluye igual
        // que en el test anterior).
        'Mimmo A': [{ id: 'reserva-self-id', fecha_entrada: '2026-10-01', fecha_salida: '2026-10-03', nombre_apellido: 'Huésped Propio' }],
        'Mimmo B': [{ id: 'reserva-self-id', fecha_entrada: '2026-10-01', fecha_salida: '2026-10-03', nombre_apellido: 'Huésped Propio' }],
        // Mimmo C: ocupada por OTRA reserva real (id distinto) — esta
        // NO se excluye, y tiene que bloquear el guardado.
        'Mimmo C': [{ id: 'reserva-otra-persona', fecha_entrada: '2026-10-02', fecha_salida: '2026-10-05', nombre_apellido: 'Ocupante Ajeno' }],
      },
    })
    supabase.from.mockImplementation(mockSupabase.from)
    sendEmailConfirmacion.mockResolvedValue(new Date().toISOString())

    const user = userEvent.setup()
    renderEnEdicion('reserva-self-id')

    await waitFor(() => expect(screen.getByTestId('cabana-picker-chip-Mimmo A')).toBeInTheDocument())

    await user.click(screen.getByTestId('cabana-picker-trigger'))
    await seleccionarCabanas(user, ['Mimmo C'])
    await user.click(screen.getByTestId('cabana-picker-listo'))

    // El preview en vivo detecta el conflicto en Mimmo C y deshabilita
    // el botón — igual que en creación.
    await waitFor(() => expect(screen.getByTestId('btn-submit-reserva')).toBeDisabled())
    expect(screen.getByText(/Fechas ya reservadas en Mimmo C/)).toBeInTheDocument()

    // Re-chequeo final del submit (form directo, igual que el test
    // equivalente de creación) — all-or-nothing: NINGÚN update se
    // manda, ni siquiera para Mimmo A/Mimmo B que seguían libres.
    fireEvent.submit(screen.getByTestId('cabana-picker-trigger').closest('form'))

    await waitFor(() => expect(screen.getByTestId('reserva-form-error')).toBeInTheDocument())
    expect(screen.getByTestId('reserva-form-error').textContent).toContain('Mimmo C')
    expect(screen.getByTestId('reserva-form-error').textContent).toContain('Ocupante Ajeno')
    expect(mockSupabase.getCantidadUpdates()).toBe(0)
    expect(mockSupabase.getUltimoUpdateReservas()).toBeNull()
  })
})

describe('ReservaForm.jsx — editar: cabaña guardada que ya no existe en cabanasPorGrupo', () => {
  const RESERVA_CABANA_RENOMBRADA = {
    id: 'reserva-renombrada-id',
    codigo: 'A2222',
    nombre_apellido: 'Huésped Viejo',
    email: 'viejo@example.com',
    // "Cabaña Vieja" ya no está en cabanasPorGrupo (renombrada/eliminada
    // desde que se creó esta reserva) — "Cabaña 1" sí sigue existiendo.
    cabana: 'Cabaña Vieja\nCabaña 1',
    pax: 2,
    fecha_entrada: '2026-11-01',
    fecha_salida: '2026-11-03',
    noches: 2,
    mes: 'Noviembre',
    monto_total: 10000,
    sena1_monto: 0,
    sena2_monto: 0,
    pago_cabana_monto: 0,
    estado: 'Pendiente',
  }

  it('no revienta: muestra el chip de la cabaña no reconocida igual (sin grupo), y conserva ambas cabañas si se guarda sin tocar nada', async () => {
    useComplejo.mockReturnValue({
      complejoActivo: COMPLEJO_VIP,
      cabanasPorGrupo: [{ grupo: null, cabanas: ['Cabaña 1', 'Cabaña 2'] }],
    })
    const mockSupabase = makeSupabaseMock({ reservaExistente: RESERVA_CABANA_RENOMBRADA })
    supabase.from.mockImplementation(mockSupabase.from)
    sendEmailConfirmacion.mockResolvedValue(new Date().toISOString())

    const user = userEvent.setup()
    renderEnEdicion('reserva-renombrada-id')

    // Ambos chips aparecen — "Cabaña Vieja" (no reconocida) igual que
    // "Cabaña 1" (sí reconocida). El chip sale directo de
    // `cabanasSeleccionadas`, no de cabanasPorGrupo, así que no
    // depende de que la cabaña siga existiendo en el catálogo actual.
    await waitFor(() => expect(screen.getByTestId('cabana-picker-chip-Cabaña Vieja')).toBeInTheDocument())
    expect(screen.getByTestId('cabana-picker-chip-Cabaña 1')).toBeInTheDocument()

    // Dentro del panel no hay ninguna fila tildable para "Cabaña Vieja"
    // (no está en ningún grupo del catálogo actual) — sólo las del
    // catálogo real.
    await user.click(screen.getByTestId('cabana-picker-trigger'))
    expect(screen.queryByTestId('cabana-picker-row-Cabaña Vieja')).not.toBeInTheDocument()
    expect(screen.getByTestId('cabana-picker-row-Cabaña 1')).toBeInTheDocument()
    await user.click(screen.getByTestId('cabana-picker-listo'))

    // Guardar sin tocar nada conserva las dos, tal cual estaban.
    await user.click(screen.getByTestId('btn-submit-reserva'))
    await waitFor(() => expect(mockSupabase.getUltimoUpdateReservas()).not.toBeNull())
    expect(mockSupabase.getUltimoUpdateReservas().cabana).toBe('Cabaña Vieja\nCabaña 1')
  })
})

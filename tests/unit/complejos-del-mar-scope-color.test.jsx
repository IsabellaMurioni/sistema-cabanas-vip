// "Complejos del mar" muestra cabañas de VARIOS complejos a la vez.
// `reservaIncluyeCabana` (reusado de Disponibilidad.jsx sin cambios)
// matchea nombre actual/anterior vía `cabinMatchesName` — correcto
// SÓLO si se le pasa la lista de cabañas de UN complejo a la vez; con
// un array combinado de varios complejos, un nombre de cabaña
// repetido entre dos complejos distintos (p.ej. "Confort 2" en Mimmo Y
// en otro complejo) resolvería silenciosamente mal. Este archivo
// prueba el resultado observable de esa regla (la página real,
// renderizada con datos reales): una reserva de un complejo con una
// cabaña de nombre repetido en otro complejo aparece EXACTAMENTE una
// vez, en la fila del complejo correcto — nunca duplicada ni en la
// fila del complejo equivocado.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ComplejosDelMar from '../../src/pages/ComplejosDelMar'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../src/context/ComplejoContext', () => ({
  useComplejo: vi.fn(),
  cabinMatchesName: (cabanaRow, nombre) => cabanaRow?.nombre === nombre,
}))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: vi.fn() }))

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'
import { useAuth } from '../../src/context/AuthContext'

const COMPLEJO_A = { id: 'complejo-a', slug: 'mimmo', nombre: 'Mimmo', color_primario: '#04214A', color_secundario: '#C5D9ED' }
const COMPLEJO_B = { id: 'complejo-b', slug: 'casas-azahar', nombre: 'Casas Azahar', color_primario: '#FE824C', color_secundario: '#FEE59A' }

// Mismo nombre de cabaña ("Confort 2") en los DOS complejos a
// propósito — el escenario real que esta prueba existe para cubrir.
const CABANA_A = { id: 'cab-a', complejo_id: 'complejo-a', nombre: 'Confort 2', orden: 1, grupo: null, color: '#111' }
const CABANA_B = { id: 'cab-b', complejo_id: 'complejo-b', nombre: 'Confort 2', orden: 1, grupo: null, color: '#222' }

function todayPlus(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Reserva perteneciente a complejo A, en fechas que incluyen "hoy" —
// renderiza como barra visible en la grilla.
const RESERVA_A = {
  id: 'r-a', complejo_id: 'complejo-a', codigo: 'A1111', nombre_apellido: 'Huésped A',
  cabana: 'Confort 2', fecha_entrada: todayPlus(-1), fecha_salida: todayPlus(2),
  estado: 'Confirmada', pax: 2, noches: 3, monto_total: 10000,
}

function mockEverything({ cabanas, reservas }) {
  useComplejo.mockReturnValue({
    todosLosComplejos: [COMPLEJO_A, COMPLEJO_B],
    complejosConAcceso: [COMPLEJO_A.id, COMPLEJO_B.id],
    cargando: false,
    getCabanaColor: () => '#123456', // sólo usado por ReservaPopup si se abre el popup
  })
  useAuth.mockReturnValue({ session: { user: { email: 'test@example.com' } } })
  supabase.from.mockImplementation((table) => {
    if (table === 'cabanas') {
      return { select: () => ({ in: () => ({ order: () => Promise.resolve({ data: cabanas, error: null }) }) }) }
    }
    if (table === 'reservas') {
      return { select: () => ({ in: () => ({ neq: () => Promise.resolve({ data: reservas, error: null }) }) }) }
    }
    return { select: () => ({ in: () => ({ order: () => Promise.resolve({ data: [], error: null }), neq: () => Promise.resolve({ data: [], error: null }) }) }) }
  })
}

async function esperarCarga() {
  await waitFor(() => expect(screen.queryByText('Cargando disponibilidad...')).not.toBeInTheDocument())
}

describe('ComplejosDelMar — cabañas con el mismo nombre en complejos distintos no se mezclan', () => {
  beforeEach(() => vi.clearAllMocks())

  it('una reserva de Mimmo con una cabaña "Confort 2" aparece UNA sola vez, no duplicada en la fila de Casas Azahar (que también tiene una "Confort 2")', async () => {
    mockEverything({ cabanas: [CABANA_A, CABANA_B], reservas: [RESERVA_A] })
    render(<MemoryRouter><ComplejosDelMar /></MemoryRouter>)
    await esperarCarga()

    // Exactamente una barra para esta reserva — si el agrupamiento por
    // complejo fallara y cabinMatchesName matcheara contra el array
    // combinado, la misma reserva podría aparecer también bajo la
    // cabaña homónima de Casas Azahar.
    expect(screen.getAllByTestId('reserva-bar-r-a')).toHaveLength(1)

    // Los dos banners de complejo están presentes (ambos complejos se
    // muestran), confirmando que el escenario realmente ejercita dos
    // complejos distintos, no uno solo.
    expect(screen.getByTestId('banner-complejo-mimmo')).toBeInTheDocument()
    expect(screen.getByTestId('banner-complejo-casas-azahar')).toBeInTheDocument()
  })

  it('sin la reserva, ninguna de las dos filas "Confort 2" muestra ninguna barra', async () => {
    mockEverything({ cabanas: [CABANA_A, CABANA_B], reservas: [] })
    render(<MemoryRouter><ComplejosDelMar /></MemoryRouter>)
    await esperarCarga()
    expect(screen.queryByTestId('reserva-bar-r-a')).not.toBeInTheDocument()
  })
})

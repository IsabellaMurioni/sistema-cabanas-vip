// "Ver detalle" en el popup de una reserva (ComplejosDelMar.jsx) tiene
// que navegar al slug del complejo DE ESA RESERVA puntual — nunca a
// ningún complejo "activo" global, porque en esta página no existe
// ninguno (es la razón de ser de la vista: mostrar varios complejos a
// la vez, sin que ninguno sea "el" activo). Este archivo prueba eso
// contra el componente real: una reserva de un complejo que NO es el
// primero en `todosLosComplejos` navega al slug CORRECTO, no al del
// primero de la lista (que sería el bug si algo adentro asumiera
// "activo = el primero" en vez de resolver por `reserva.complejo_id`).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ComplejosDelMar from '../../src/pages/ComplejosDelMar'

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})
vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../src/context/ComplejoContext', () => ({
  useComplejo: vi.fn(),
  cabinMatchesName: (cabanaRow, nombre) => cabanaRow?.nombre === nombre,
}))
vi.mock('../../src/context/AuthContext', () => ({ useAuth: vi.fn() }))

import { MemoryRouter } from 'react-router-dom'
import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'
import { useAuth } from '../../src/context/AuthContext'

// A propósito, el complejo de la reserva (B) NO es el primero de
// `todosLosComplejos` — si "Ver detalle" navegara al primero de la
// lista en vez de resolver por reserva.complejo_id, este test lo
// detectaría (navegaría a /mimmo/... en vez de /casas-azahar/...).
const COMPLEJO_A = { id: 'complejo-a', slug: 'mimmo', nombre: 'Mimmo', color_primario: '#04214A', color_secundario: '#C5D9ED' }
const COMPLEJO_B = { id: 'complejo-b', slug: 'casas-azahar', nombre: 'Casas Azahar', color_primario: '#FE824C', color_secundario: '#FEE59A' }

const CABANA_B = { id: 'cab-b', complejo_id: 'complejo-b', nombre: 'Casa Azahar I', orden: 1, grupo: null, color: '#222' }

function todayPlus(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const RESERVA_B = {
  id: 'reserva-b-id', complejo_id: 'complejo-b', codigo: 'B2222', nombre_apellido: 'Huésped B',
  cabana: 'Casa Azahar I', fecha_entrada: todayPlus(-1), fecha_salida: todayPlus(2),
  estado: 'Confirmada', pax: 3, noches: 3, monto_total: 20000,
}

function mockEverything() {
  useComplejo.mockReturnValue({
    todosLosComplejos: [COMPLEJO_A, COMPLEJO_B],
    complejosConAcceso: [COMPLEJO_A.id, COMPLEJO_B.id],
    cargando: false,
    getCabanaColor: () => '#123456', // usado por ReservaPopup al abrirse
  })
  useAuth.mockReturnValue({ session: { user: { email: 'test@example.com' } } })
  supabase.from.mockImplementation((table) => {
    if (table === 'cabanas') {
      return { select: () => ({ in: () => ({ order: () => Promise.resolve({ data: [CABANA_B], error: null }) }) }) }
    }
    if (table === 'reservas') {
      return { select: () => ({ in: () => ({ neq: () => Promise.resolve({ data: [RESERVA_B], error: null }) }) }) }
    }
    return { select: () => ({ in: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }
  })
}

async function esperarCarga() {
  await waitFor(() => expect(screen.queryByText('Cargando disponibilidad...')).not.toBeInTheDocument())
}

describe('ComplejosDelMar — "Ver detalle" navega al complejo de LA RESERVA, nunca a uno global', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEverything()
  })

  it('clickear la barra y "Ver detalle" navega a /casas-azahar/reservas/reserva-b-id (el complejo real de la reserva, no el primero de la lista)', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ComplejosDelMar /></MemoryRouter>)
    await esperarCarga()

    await user.click(screen.getByTestId('reserva-bar-reserva-b-id'))
    // El botón ahora dice "Ver detalle en {complejo} →" (color/nombre
    // pasados vía colorOverride/complejoNombre) — confirma de paso que
    // el popup resolvió el complejo REAL de la reserva (Casas Azahar),
    // no uno global.
    await user.click(screen.getByText(/Ver detalle en Casas Azahar/))

    expect(mockNavigate).toHaveBeenCalledWith('/casas-azahar/reservas/reserva-b-id')
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('/mimmo/'))
  })
})

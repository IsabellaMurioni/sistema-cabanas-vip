// Reproduce el bug real encontrado en vivo: al entrar directo a la URL de
// un complejo, complejoActivo pasa brevemente por un valor "default" (el
// primer complejo con membresía del usuario) antes de que Layout.jsx lo
// corrija al slug real de la URL (ver Layout.jsx líneas 86-96 y el mismo
// guard ya aplicado en Ganancias.jsx). Reservas.jsx dispara su fetch en
// cada cambio de complejoActivo?.id — sin guard de "respuesta obsoleta",
// si el fetch del complejo VIEJO (default) resuelve DESPUÉS del fetch del
// complejo CORREGIDO, pisa la lista ya correcta con las reservas de otro
// complejo. Este test simula exactamente esa carrera (A pedido primero,
// B pedido después, A resuelve último) y prueba que la pantalla se queda
// con los datos de B — no re-implementa la lógica, renderiza el
// componente real.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Reservas from '../../src/pages/Reservas'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../src/context/ComplejoContext', () => ({ useComplejo: vi.fn() }))

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'

function makeDeferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

const COMPLEJO_A = { id: 'complejo-a', slug: 'complejo-a', nombre: 'Complejo A' }
const COMPLEJO_B = { id: 'complejo-b', slug: 'complejo-b', nombre: 'Complejo B' }

const RESERVA_A = {
  id: 'r-a', codigo: 'A-STALE', nombre_apellido: 'Reserva De A',
  cabana: 'Cabaña A', fecha_entrada: '2026-01-01', fecha_salida: '2026-01-03',
  noches: 2, monto_total: 100, estado: 'Confirmada', mes: 'Enero',
}
const RESERVA_B = {
  id: 'r-b', codigo: 'B-CORRECTA', nombre_apellido: 'Reserva De B',
  cabana: 'Cabaña B', fecha_entrada: '2026-02-01', fecha_salida: '2026-02-03',
  noches: 2, monto_total: 200, estado: 'Confirmada', mes: 'Febrero',
}

function mockComplejo(complejoActivo) {
  useComplejo.mockReturnValue({
    complejoActivo,
    getCabanaColor: () => '#123456',
    cabanasPorGrupo: [],
  })
}

describe('Reservas.jsx — guard contra respuesta obsoleta al cambiar de complejo', () => {
  let deferredByComplejo

  beforeEach(() => {
    deferredByComplejo = {}
    supabase.from.mockReset()
    supabase.from.mockImplementation(() => ({
      select: () => ({
        eq: (_col, complejoId) => ({
          order: () => {
            if (!deferredByComplejo[complejoId]) deferredByComplejo[complejoId] = makeDeferred()
            return deferredByComplejo[complejoId].promise
          },
        }),
      }),
    }))
  })

  it('descarta la respuesta del complejo viejo si resuelve después que la del complejo corregido', async () => {
    mockComplejo(COMPLEJO_A)
    const { rerender } = render(<MemoryRouter><Reservas /></MemoryRouter>)

    // El primer fetch (complejo A, "default" antes de la corrección) ya
    // está en vuelo pero todavía no resolvió.
    await waitFor(() => expect(deferredByComplejo['complejo-a']).toBeDefined())

    // Layout.jsx corrige complejoActivo al slug real de la URL (complejo
    // B) ANTES de que A haya resuelto — dispara un segundo fetch.
    mockComplejo(COMPLEJO_B)
    rerender(<MemoryRouter><Reservas /></MemoryRouter>)
    await waitFor(() => expect(deferredByComplejo['complejo-b']).toBeDefined())

    // B (el fetch correcto, pedido después) resuelve PRIMERO.
    deferredByComplejo['complejo-b'].resolve({ data: [RESERVA_B], error: null })
    await screen.findByText('B-CORRECTA')

    // A (el fetch viejo/obsoleto) resuelve DESPUÉS. Sin el guard, este
    // .then() pisaría el estado con los datos de A.
    deferredByComplejo['complejo-a'].resolve({ data: [RESERVA_A], error: null })

    // Le da tiempo al .then() obsoleto a correr (si va a pisar el estado,
    // lo hace acá) y confirma que la pantalla se queda con B.
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByText('B-CORRECTA')).toBeInTheDocument()
    expect(screen.queryByText('A-STALE')).not.toBeInTheDocument()
  })

  it('sigue mostrando los datos correctos cuando no hay carrera (caso normal)', async () => {
    mockComplejo(COMPLEJO_B)
    render(<MemoryRouter><Reservas /></MemoryRouter>)

    await waitFor(() => expect(deferredByComplejo['complejo-b']).toBeDefined())
    deferredByComplejo['complejo-b'].resolve({ data: [RESERVA_B], error: null })

    await screen.findByText('B-CORRECTA')
    expect(screen.queryByText('A-STALE')).not.toBeInTheDocument()
  })
})

// Se sacaron las tarjetas "Retiro pesos" / "Retiro USD" del Resumen de
// Ganancias (sólo existían para Cabañas VIP) — el resto de las
// tarjetas de esa fila (incluidas las agregadas en una tarea anterior,
// "Lo cobrado"/"Lo pendiente") quedan sin cambios. Este test renderiza
// el componente real y completo — no reimplementa el JSX.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Ganancias from '../../src/pages/Ganancias'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../src/context/ComplejoContext', () => ({ useComplejo: vi.fn() }))

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'

const COMPLEJO_VIP = { id: 'complejo-vip', slug: 'cabanas-vip', nombre: 'Cabañas VIP', color_primario: '#000' }

// Mock "universal" — cualquier cadena select/eq resuelve {data: [],
// error: null}, para las 5 tablas que consulta la rama VIP en
// paralelo (reservas/caja_silvia/caja_juli/caja_banco/
// caja_mercado_pago). No hace falta data real: sólo importa qué
// tarjetas aparecen/desaparecen, no sus valores.
function mockSupabaseVacio() {
  const from = vi.fn(() => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      neq: () => builder,
      then: (onFulfilled, onRejected) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected),
    }
    return builder
  })
  return from
}

describe('Ganancias.jsx — Resumen (Cabañas VIP): "Retiro pesos"/"Retiro USD" ya no se muestran (código real)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useComplejo.mockReturnValue({ complejoActivo: COMPLEJO_VIP, getCabanaColor: () => '#123456' })
    supabase.from.mockImplementation(mockSupabaseVacio())
  })

  it('las tarjetas "Retiro pesos" y "Retiro USD" no se renderizan', async () => {
    render(<Ganancias />)
    await waitFor(() => expect(screen.getByTestId('tile-facturado')).toBeInTheDocument())

    expect(screen.queryByTestId('tile-retiro-pesos')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tile-retiro-usd')).not.toBeInTheDocument()
    expect(screen.queryByText('Retiro pesos')).not.toBeInTheDocument()
    expect(screen.queryByText('Retiro USD')).not.toBeInTheDocument()
  })

  it('el resto de las tarjetas del Resumen (incluidas "Lo cobrado"/"Lo pendiente") se siguen mostrando, sin cambios', async () => {
    render(<Ganancias />)
    await waitFor(() => expect(screen.getByTestId('tile-facturado')).toBeInTheDocument())

    expect(screen.getByTestId('tile-reservas')).toBeInTheDocument()
    expect(screen.getByTestId('tile-facturado')).toBeInTheDocument()
    expect(screen.getByTestId('tile-lo-cobrado')).toBeInTheDocument()
    expect(screen.getByTestId('tile-lo-pendiente')).toBeInTheDocument()
    expect(screen.getByTestId('tile-juli-ingresos')).toBeInTheDocument()
    expect(screen.getByTestId('tile-juli-egresos')).toBeInTheDocument()
  })
})

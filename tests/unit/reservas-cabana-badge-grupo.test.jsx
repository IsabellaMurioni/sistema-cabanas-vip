// Bug real reportado: en la columna "Cabaña" de Reservas.jsx, una
// reserva multi-cabaña con 2+ cabañas del MISMO bloque/grupo (p. ej.
// "Chalet 3 Ambientes" y "Confort 2", ambas de MIMMO I) mostraba el
// badge de grupo "MIMMO I" UNA VEZ POR CABAÑA (duplicado) en vez de
// una sola vez para todo el grupo. Este test renderiza el componente
// real (no reimplementa el agrupamiento) y prueba: 2+ cabañas del
// mismo grupo → un solo badge de grupo; cabañas de dos grupos
// distintos → un badge por grupo, cada uno con sólo sus propias
// cabañas debajo; una sola cabaña sin grupo → sin badge, sin cambios.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Reservas from '../../src/pages/Reservas'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../src/context/ComplejoContext', () => ({ useComplejo: vi.fn() }))

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'

const COMPLEJO = { id: 'c1', slug: 'mimmo', nombre: 'Mimmo' }

// Mismos bloques/grupos reales de Mimmo que ya usa CabinMultiPicker
// (ReservaForm.jsx) para "MIMMO I"/"MIMMO II" — misma fuente de datos.
const CABANAS_POR_GRUPO = [
  { grupo: 'MIMMO I', cabanas: ['Chalet 3 Ambientes', 'Confort 2', 'Confort 3'] },
  { grupo: 'MIMMO II', cabanas: ['Mimmo I', 'Mimmo II', 'Mimmo III'] },
]

const RESERVA_MISMO_GRUPO = {
  id: 'r-mismo-grupo', codigo: 'A-MISMOGRUPO', nombre_apellido: 'Dos cabañas, un grupo',
  cabana: 'Chalet 3 Ambientes\nConfort 2',
  fecha_entrada: '2026-01-01', fecha_salida: '2026-01-03',
  noches: 2, monto_total: 200, sena1_monto: 0, sena2_monto: 0, pago_cabana_monto: 0,
  estado: 'Confirmada', mes: 'Enero',
}

const RESERVA_DOS_GRUPOS = {
  id: 'r-dos-grupos', codigo: 'A-DOSGRUPOS', nombre_apellido: 'Cabañas de dos grupos',
  cabana: 'Confort 3\nMimmo I\nMimmo II',
  fecha_entrada: '2026-02-01', fecha_salida: '2026-02-03',
  noches: 2, monto_total: 300, sena1_monto: 0, sena2_monto: 0, pago_cabana_monto: 0,
  estado: 'Confirmada', mes: 'Febrero',
}

const RESERVA_UNA_SIN_GRUPO = {
  id: 'r-sin-grupo', codigo: 'A-SINGRUPO', nombre_apellido: 'Una cabaña sin grupo',
  cabana: 'Bahama', // no está en CABANAS_POR_GRUPO — sin grupo, como antes de esta feature.
  fecha_entrada: '2026-03-01', fecha_salida: '2026-03-03',
  noches: 2, monto_total: 100, sena1_monto: 0, sena2_monto: 0, pago_cabana_monto: 0,
  estado: 'Confirmada', mes: 'Marzo',
}

beforeEach(() => {
  vi.clearAllMocks()
  useComplejo.mockReturnValue({
    complejoActivo: COMPLEJO,
    getCabanaColor: () => '#123456',
    cabanasPorGrupo: CABANAS_POR_GRUPO,
  })
  supabase.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve({
          data: [RESERVA_MISMO_GRUPO, RESERVA_DOS_GRUPOS, RESERVA_UNA_SIN_GRUPO],
          error: null,
        }),
      }),
    }),
  })
})

// Columnas de la tabla: Código, Nombre, Cabaña, Entrada, Salida,
// Noches, Total, Saldo, Estado, Acciones — Cabaña es la celda índice 2
// (mismo criterio que ya usa reservas-monto-cero.test.jsx).
function celdaCabana(codigo) {
  const fila = screen.getByText(codigo).closest('tr')
  return fila.querySelectorAll('td')[2]
}

describe('Reservas.jsx — columna Cabaña: badge de grupo sin duplicar', () => {
  it('2+ cabañas del MISMO grupo: el badge de grupo aparece UNA sola vez, con las dos cabañas debajo', async () => {
    render(<MemoryRouter><Reservas /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('A-MISMOGRUPO')).toBeInTheDocument())

    const celda = celdaCabana('A-MISMOGRUPO')
    expect(within(celda).getAllByText('MIMMO I')).toHaveLength(1)
    expect(within(celda).getByText('Chalet 3 Ambientes')).toBeInTheDocument()
    expect(within(celda).getByText('Confort 2')).toBeInTheDocument()
  })

  it('cabañas de DOS grupos distintos: un badge por grupo, cada uno con sólo sus propias cabañas debajo', async () => {
    render(<MemoryRouter><Reservas /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('A-DOSGRUPOS')).toBeInTheDocument())

    const celda = celdaCabana('A-DOSGRUPOS')
    expect(within(celda).getAllByText('MIMMO I')).toHaveLength(1)
    expect(within(celda).getAllByText('MIMMO II')).toHaveLength(1)
    expect(within(celda).getByText('Confort 3')).toBeInTheDocument()
    expect(within(celda).getByText('Mimmo I')).toBeInTheDocument()
    expect(within(celda).getByText('Mimmo II')).toBeInTheDocument()

    // El badge "MIMMO I" tiene sólo "Confort 3" debajo, no "Mimmo I"/"Mimmo II".
    const grupoUno = within(celda).getByText('MIMMO I').closest('div')
    expect(within(grupoUno).getByText('Confort 3')).toBeInTheDocument()
    expect(within(grupoUno).queryByText('Mimmo I')).not.toBeInTheDocument()
    expect(within(grupoUno).queryByText('Mimmo II')).not.toBeInTheDocument()

    // Y "MIMMO II" tiene sólo las suyas.
    const grupoDos = within(celda).getByText('MIMMO II').closest('div')
    expect(within(grupoDos).getByText('Mimmo I')).toBeInTheDocument()
    expect(within(grupoDos).getByText('Mimmo II')).toBeInTheDocument()
    expect(within(grupoDos).queryByText('Confort 3')).not.toBeInTheDocument()
  })

  it('una sola cabaña sin grupo: sin badge de grupo, exactamente como antes de esta feature', async () => {
    render(<MemoryRouter><Reservas /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('A-SINGRUPO')).toBeInTheDocument())

    const celda = celdaCabana('A-SINGRUPO')
    expect(within(celda).getByText('Bahama')).toBeInTheDocument()
    // Nada de texto en mayúsculas de bloque — ningún span de grupo.
    expect(celda.querySelector('.uppercase')).toBeNull()
  })
})

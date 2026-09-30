// Rediseño del header mobile de Disponibilidad (ítem 3 de la propuesta
// de diseño aprobada): antes, "Desde"/"Hasta"/toggle de vista/"Hoy"
// vivían en un único `flex flex-wrap`, así que en ~390px terminaban
// apilados en 3-4 filas por casualidad (lo que el wrap dejara caer),
// consumiendo ~260-280px verticales antes de cualquier contenido real.
//
// Ahora el header se arma en dos grupos EXPLÍCITOS, no algo que dependa
// de flex-wrap: Grupo 1 (Desde/Hasta, cada uno ~50% del ancho vía
// flex-1) y Grupo 2 (toggle de vista + "Hoy"), cada uno su propia fila
// desde ~390px hacia arriba — en sm:+ ambos grupos vuelven a fundirse
// en la fila única de siempre (display:contents + sm:flex-none en cada
// control). Este test verifica la agrupación real vía los
// data-testid puestos a propósito para esto, no reimplementa el CSS.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Disponibilidad from '../../src/pages/Disponibilidad'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../src/context/ComplejoContext', () => ({ useComplejo: vi.fn() }))

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'

function mockComplejo() {
  useComplejo.mockReturnValue({
    complejoActivo: { id: 'c1', slug: 'test-complejo', nombre: 'Test' },
    cabanasNombres: ['Cabaña 1', 'Cabaña 2'],
    getCabanaColor: () => '#123456',
    cabanasPorGrupo: [{ grupo: null, cabanas: ['Cabaña 1', 'Cabaña 2'] }],
  })
}

async function renderDisponibilidad() {
  mockComplejo()
  supabase.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        neq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  })
  render(<MemoryRouter><Disponibilidad /></MemoryRouter>)
  await waitFor(() => expect(screen.queryByText('Cargando disponibilidad...')).not.toBeInTheDocument())
}

describe('Disponibilidad — header en dos grupos explícitos (Desde/Hasta y toggle/Hoy)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('el grupo de fechas contiene exactamente los triggers de Desde y Hasta', async () => {
    await renderDisponibilidad()

    const grupoFechas = screen.getByTestId('disponibilidad-header-grupo-fechas')
    expect(within(grupoFechas).getByText('Desde')).toBeInTheDocument()
    expect(within(grupoFechas).getByText('Hasta')).toBeInTheDocument()
    // Nada del grupo de acciones se coló acá adentro.
    expect(within(grupoFechas).queryByText('Hoy')).not.toBeInTheDocument()
  })

  it('el grupo de acciones contiene exactamente el toggle de vista y "Hoy"', async () => {
    await renderDisponibilidad()

    const grupoAcciones = screen.getByTestId('disponibilidad-header-grupo-acciones')
    expect(within(grupoAcciones).getByRole('button', { name: 'Ver todas' })).toBeInTheDocument()
    expect(within(grupoAcciones).getByRole('button', { name: 'Hoy' })).toBeInTheDocument()
    // Nada del grupo de fechas se coló acá adentro.
    expect(within(grupoAcciones).queryByText('Desde')).not.toBeInTheDocument()
  })

  it('los triggers de Desde/Hasta son flex-1 (mitad del ancho disponible en mobile) y vuelven a tamaño de contenido en sm:+', async () => {
    await renderDisponibilidad()

    const grupoFechas = screen.getByTestId('disponibilidad-header-grupo-fechas')
    const desdeWrapper = within(grupoFechas).getByText('Desde').closest('.relative')
    const hastaWrapper = within(grupoFechas).getByText('Hasta').closest('.relative')

    expect(desdeWrapper.className).toMatch(/flex-1/)
    expect(desdeWrapper.className).toMatch(/sm:flex-none/)
    expect(hastaWrapper.className).toMatch(/flex-1/)
    expect(hastaWrapper.className).toMatch(/sm:flex-none/)
  })

  it('la misma agrupación de dos grupos aparece también en "Ver por cabaña" (header compartido)', async () => {
    await renderDisponibilidad()

    // Por defecto la vista es "Ver por cabaña" — confirmamos que los
    // mismos dos grupos ya están presentes sin tener que cambiar de tab.
    expect(screen.getByTestId('disponibilidad-header-grupo-fechas')).toBeInTheDocument()
    const grupoAcciones = screen.getByTestId('disponibilidad-header-grupo-acciones')
    expect(within(grupoAcciones).getByRole('button', { name: 'Ver todas' })).toBeInTheDocument()

    // Cambiamos a "Ver todas" y confirmamos que sigue siendo la MISMA
    // estructura (header realmente compartido, no una copia paralela).
    within(grupoAcciones).getByRole('button', { name: 'Ver todas' }).click()
    await waitFor(() => {
      expect(within(screen.getByTestId('disponibilidad-header-grupo-acciones')).getByRole('button', { name: '← Por cabaña' })).toBeInTheDocument()
    })
    expect(screen.getByTestId('disponibilidad-header-grupo-fechas')).toBeInTheDocument()
  })
})

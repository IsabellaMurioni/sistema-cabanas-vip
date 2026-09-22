// Bloquea la regresión que ya pasó DOS veces en "Ver por cabaña"
// (single-cabin view) de Disponibilidad.jsx: primero tenía su propia
// altura independiente (ROW_H_SINGLE/TARGET_MIN_H_SINGLE viejos,
// desalineados de "Ver todas"), después reusaba directo el `rowH`
// dinámico de "Ver todas" (con lo que VIP/Mimmo, con muchas cabañas,
// volvían a tener una fila corta ahí). La altura correcta es FIJA
// (ROW_H_SINGLE = 288, igual al `rowH` que "Ver todas" calcula hoy para
// Chacras del Mar) e igual en los 5 complejos, sin importar cuántas
// cabañas tenga cada uno. Este test renderiza el componente real (no
// reimplementa la fórmula) con 3 complejos de tamaño muy distinto (15,
// 12 y 2 cabañas — VIP/Mimmo/Chacras del Mar) y prueba que la fila
// única de "Ver por cabaña" sale con la MISMA altura en los tres.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Disponibilidad from '../../src/pages/Disponibilidad'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../src/context/ComplejoContext', () => ({ useComplejo: vi.fn() }))

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'

function cabanasDe(n, prefix) {
  return Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`)
}

function mockComplejoConCabanas(nombres) {
  useComplejo.mockReturnValue({
    complejoActivo: { id: 'c1', slug: 'test-complejo', nombre: 'Test' },
    cabanasNombres: nombres,
    getCabanaColor: () => '#123456',
    cabanasPorGrupo: [{ grupo: null, cabanas: nombres }],
  })
}

// Altura fija esperada de "Ver por cabaña" — ver comentario junto a
// ROW_H_SINGLE en src/pages/Disponibilidad.jsx. Si ese número cambia a
// propósito, actualizarlo acá también.
const ROW_H_SINGLE_ESPERADO = 288

async function renderYSeleccionarPrimeraCabana(nombres) {
  mockComplejoConCabanas(nombres)
  supabase.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        neq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  })

  render(<MemoryRouter><Disponibilidad /></MemoryRouter>)

  await waitFor(() => expect(screen.queryByText('Cargando disponibilidad...')).not.toBeInTheDocument())

  const botones = screen.getAllByRole('button', { name: new RegExp(nombres[0]) })
  botones[botones.length - 1].click()

  // El TimelineRow real es el único div con position:relative + height
  // inline que aparece tras seleccionar una cabaña.
  await waitFor(() => {
    const candidatos = Array.from(document.querySelectorAll('div'))
      .filter((d) => d.style.position === 'relative' && d.style.height)
    expect(candidatos.length).toBeGreaterThan(0)
  })

  const timelineRow = Array.from(document.querySelectorAll('div'))
    .find((d) => d.style.position === 'relative' && d.style.height)
  return parseFloat(timelineRow.style.height)
}

describe('Disponibilidad — "Ver por cabaña" usa una altura fija, igual en todos los complejos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it(`complejo con muchas cabañas (15, como VIP) → fila de ${ROW_H_SINGLE_ESPERADO}px`, async () => {
    const altura = await renderYSeleccionarPrimeraCabana(cabanasDe(15, 'Cabaña VIP'))
    expect(altura).toBe(ROW_H_SINGLE_ESPERADO)
  })

  it(`complejo con cabañas intermedias (12, como Mimmo) → misma fila de ${ROW_H_SINGLE_ESPERADO}px`, async () => {
    const altura = await renderYSeleccionarPrimeraCabana(cabanasDe(12, 'Cabaña Mimmo'))
    expect(altura).toBe(ROW_H_SINGLE_ESPERADO)
  })

  it(`complejo con pocas cabañas (2, como Chacras del Mar) → misma fila de ${ROW_H_SINGLE_ESPERADO}px`, async () => {
    const altura = await renderYSeleccionarPrimeraCabana(cabanasDe(2, 'Chacras'))
    expect(altura).toBe(ROW_H_SINGLE_ESPERADO)
  })

  it('las tres alturas anteriores son idénticas entre sí, no sólo cada una casualmente igual a 288', async () => {
    const alturaVip     = await renderYSeleccionarPrimeraCabana(cabanasDe(15, 'Cabaña VIP'))
    const alturaMimmo   = await renderYSeleccionarPrimeraCabana(cabanasDe(12, 'Cabaña Mimmo'))
    const alturaChacras = await renderYSeleccionarPrimeraCabana(cabanasDe(2, 'Chacras'))
    expect(new Set([alturaVip, alturaMimmo, alturaChacras]).size).toBe(1)
  })
})

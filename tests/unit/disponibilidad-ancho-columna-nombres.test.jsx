// Ancho dinámico de la columna de nombres de cabaña en "Ver todas"
// (reemplaza el viejo ancho fijo de 136px, que truncaba los 4 nombres
// más largos de Mimmo). Ver calcularAnchoColumnaNombres en
// src/pages/Disponibilidad.jsx y el mock de Canvas 2D en
// tests/setup/vitest.setup.js (jsdom no implementa Canvas de verdad).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Disponibilidad, { calcularAnchoColumnaNombres } from '../../src/pages/Disponibilidad'

// Nombres reales de los 5 complejos (staging), tal como se relevaron
// en la investigación previa a este cambio.
const NOMBRES_POR_COMPLEJO = {
  'Cabañas VIP': ['Bahama', 'Bahia', 'Maui', 'Itaparica', 'Acapulco', 'Cozumel', 'Ibiza', 'Ipanema', 'Maceio', 'Hawai', 'Vallarta', 'Aruba', 'Cancún', 'Buzios', 'Jamaica'],
  'Casas Azahar': ['Casa Azahar I', 'Casa Azahar II'],
  'Chacras del Mar': ['Chacras 23', 'Chacras 24'],
  'Los Amigos': ['Casa', 'Departamento', 'Dúplex 3', 'Dúplex 4'],
  Mimmo: ['Chalet 3 Ambientes', 'Confort 2', 'Confort 3', 'Dos Ambientes Planta Baja 4', 'Dos Ambientes Planta Baja 5', 'Dos Ambientes Planta Alta 6', 'Dos Ambientes Planta Alta 7', 'Clásica 8', 'Clásica 9', 'Mimmo I', 'Mimmo II', 'Mimmo III'],
}

// Overhead fijo no-texto de la celda (borderLeft 3 + paddingLeft 10 +
// dot 8 + gap 8 + paddingRight 8, ver el <div> de la fila de "Ver
// todas") + el margen de seguridad — hardcodeados ACÁ A PROPÓSITO, no
// importados de Disponibilidad.jsx: si alguien cambia el overhead o el
// buffer reales sin que corresponda, este test tiene que notarlo, no
// limitarse a repetir lo que el código ya hace.
const OVERHEAD = 37
const BUFFER = 6

function medirTexto(texto) {
  const ctx = document.createElement('canvas').getContext('2d')
  ctx.font = "600 12px 'Inter', system-ui, -apple-system, sans-serif"
  return ctx.measureText(texto).width
}

describe('calcularAnchoColumnaNombres — ancho dinámico por complejo, sin truncar ningún nombre', () => {
  Object.entries(NOMBRES_POR_COMPLEJO).forEach(([complejo, nombres]) => {
    it(`${complejo}: ningún nombre de cabaña excede el ancho de columna calculado para ese complejo`, () => {
      const ancho = calcularAnchoColumnaNombres(nombres)
      nombres.forEach((nombre) => {
        const anchoTexto = medirTexto(nombre)
        expect(anchoTexto + OVERHEAD).toBeLessThanOrEqual(ancho)
      })
    })
  })

  it('el ancho calculado es exactamente ceil(nombre más largo + overhead + buffer) — no un valor arbitrario', () => {
    const nombres = NOMBRES_POR_COMPLEJO.Mimmo
    const anchoMaximoTexto = Math.max(...nombres.map(medirTexto))
    const esperado = Math.ceil(anchoMaximoTexto + OVERHEAD + BUFFER)
    expect(calcularAnchoColumnaNombres(nombres)).toBe(esperado)
  })

  it('Mimmo (nombres largos) necesita una columna bastante más ancha que Cabañas VIP (nombres cortos)', () => {
    const anchoMimmo = calcularAnchoColumnaNombres(NOMBRES_POR_COMPLEJO.Mimmo)
    const anchoVip = calcularAnchoColumnaNombres(NOMBRES_POR_COMPLEJO['Cabañas VIP'])
    expect(anchoMimmo).toBeGreaterThan(anchoVip + 40)
  })

  it('con una lista vacía/nula devuelve un fallback positivo en vez de romper (loading, complejo sin cabañas aún)', () => {
    expect(calcularAnchoColumnaNombres([])).toBeGreaterThan(0)
    expect(calcularAnchoColumnaNombres(null)).toBeGreaterThan(0)
    expect(calcularAnchoColumnaNombres(undefined)).toBeGreaterThan(0)
  })
})

// ── Integración: el ancho se usa de forma CONSISTENTE en la grilla real ──
vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../src/context/ComplejoContext', () => ({ useComplejo: vi.fn() }))

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'

function mockComplejoConCabanas(nombres) {
  useComplejo.mockReturnValue({
    complejoActivo: { id: 'c1', slug: 'test-complejo', nombre: 'Test' },
    cabanasNombres: nombres,
    getCabanaColor: () => '#123456',
    cabanasPorGrupo: [{ grupo: null, cabanas: nombres }],
  })
}

async function renderYVerTodas(nombres) {
  mockComplejoConCabanas(nombres)
  supabase.from.mockReturnValue({
    select: () => ({ eq: () => ({ neq: () => Promise.resolve({ data: [], error: null }) }) }),
  })
  render(<MemoryRouter><Disponibilidad /></MemoryRouter>)
  await waitFor(() => expect(screen.queryByText('Cargando disponibilidad...')).not.toBeInTheDocument())
  screen.getByRole('button', { name: 'Ver todas' }).click()
  await waitFor(() => expect(screen.getByText('Libre')).toBeInTheDocument())
}

describe('Disponibilidad "Ver todas" — la grilla usa el ancho dinámico de forma consistente (no se desalinea)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('el ancho de la columna-esquina sticky coincide exactamente con calcularAnchoColumnaNombres para ese complejo', async () => {
    const nombres = NOMBRES_POR_COMPLEJO.Mimmo
    await renderYVerTodas(nombres)

    const esperado = calcularAnchoColumnaNombres(nombres)
    const columnaEsquina = Array.from(document.querySelectorAll('div')).find(
      (d) => d.style.position === 'sticky' && d.style.left === '0px' && d.style.zIndex === '22'
    )
    expect(columnaEsquina).toBeTruthy()
    expect(columnaEsquina.style.width).toBe(`${esperado}px`)
  })

  it('el ancho total de la fila (columna-esquina + columnas de día) es la suma correcta, no un cálculo desalineado', async () => {
    const nombres = NOMBRES_POR_COMPLEJO['Cabañas VIP']
    await renderYVerTodas(nombres)

    const anchoColumna = calcularAnchoColumnaNombres(nombres)
    // La fila flex que envuelve la columna-esquina + las columnas de
    // día — único div con display:flex cuyo ancho inline coincide con
    // "anchoColumna + numDays*DAY_W" para algún numDays entero positivo.
    const DAY_W = 38
    const filaCompleta = Array.from(document.querySelectorAll('div')).find((d) => {
      if (d.style.display !== 'flex' || !d.style.width) return false
      const w = parseFloat(d.style.width)
      const resto = w - anchoColumna
      return resto > 0 && Number.isInteger(resto / DAY_W)
    })
    expect(filaCompleta).toBeTruthy()
  })

  it('Mimmo (nombres largos) renderiza una columna-esquina más ancha que Cabañas VIP (nombres cortos)', async () => {
    await renderYVerTodas(NOMBRES_POR_COMPLEJO.Mimmo)
    const columnaMimmo = Array.from(document.querySelectorAll('div')).find(
      (d) => d.style.position === 'sticky' && d.style.left === '0px' && d.style.zIndex === '22'
    )
    const anchoMimmo = parseFloat(columnaMimmo.style.width)

    document.body.innerHTML = ''
    await renderYVerTodas(NOMBRES_POR_COMPLEJO['Cabañas VIP'])
    const columnaVip = Array.from(document.querySelectorAll('div')).find(
      (d) => d.style.position === 'sticky' && d.style.left === '0px' && d.style.zIndex === '22'
    )
    const anchoVip = parseFloat(columnaVip.style.width)

    expect(anchoMimmo).toBeGreaterThan(anchoVip)
  })
})

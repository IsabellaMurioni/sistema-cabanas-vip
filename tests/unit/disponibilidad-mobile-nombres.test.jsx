// Variante mobile-only de la columna de nombres de cabaña en "Ver
// todas" (Disponibilidad.jsx): ancho fijo igual en los 5 complejos
// (ANCHO_COLUMNA_NOMBRE_MOBILE), texto que wrapea en vez de truncarse,
// y una altura de fila uniforme por complejo que crece sólo lo
// necesario para que el nombre más exigente de ESE complejo entre
// completo. Desktop y "Ver por cabaña" (a cualquier ancho) no cambian
// — ver disponibilidad-ancho-columna-nombres.test.jsx, que sigue
// pasando sin tocar nada acá.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Disponibilidad, {
  calcularAnchoColumnaNombres,
  calcularAlturaFilaMobile,
  contarLineasNecesarias,
  ANCHO_COLUMNA_NOMBRE_MOBILE,
} from '../../src/pages/Disponibilidad'

const NOMBRES_POR_COMPLEJO = {
  'Cabañas VIP': ['Bahama', 'Bahia', 'Maui', 'Itaparica', 'Acapulco', 'Cozumel', 'Ibiza', 'Ipanema', 'Maceio', 'Hawai', 'Vallarta', 'Aruba', 'Cancún', 'Buzios', 'Jamaica'],
  'Casas Azahar': ['Casa Azahar I', 'Casa Azahar II'],
  'Chacras del Mar': ['Chacras 23', 'Chacras 24'],
  'Los Amigos': ['Casa', 'Departamento', 'Dúplex 3', 'Dúplex 4'],
  Mimmo: ['Chalet 3 Ambientes', 'Confort 2', 'Confort 3', 'Dos Ambientes Planta Baja 4', 'Dos Ambientes Planta Baja 5', 'Dos Ambientes Planta Alta 6', 'Dos Ambientes Planta Alta 7', 'Clásica 8', 'Clásica 9', 'Mimmo I', 'Mimmo II', 'Mimmo III'],
}

// Overhead real de la celda (ver OVERHEAD_COLUMNA_NOMBRE en
// Disponibilidad.jsx) — hardcodeado acá a propósito, no importado, por
// el mismo motivo que en disponibilidad-ancho-columna-nombres.test.jsx.
const OVERHEAD = 37

function medirTexto(texto) {
  const ctx = document.createElement('canvas').getContext('2d')
  ctx.font = "600 12px 'Inter', system-ui, -apple-system, sans-serif"
  return ctx.measureText(texto).width
}

describe('contarLineasNecesarias / calcularAlturaFilaMobile — wrap sin truncar, sin romper palabras', () => {
  it('un nombre corto que entra de sobra necesita 1 línea', () => {
    expect(contarLineasNecesarias('Bahama', 90)).toBe(1)
  })

  it('un nombre de varias palabras que no entra en una línea necesita 2', () => {
    expect(contarLineasNecesarias('Dos Ambientes Planta Baja 4', 90)).toBe(2)
  })

  it('NINGUNA palabra individual (de ningún nombre, de ningún complejo) excede el ancho de texto disponible en mobile — garantiza cero overflow y cero corte mid-word', () => {
    const anchoDisponible = ANCHO_COLUMNA_NOMBRE_MOBILE - OVERHEAD
    Object.entries(NOMBRES_POR_COMPLEJO).forEach(([complejo, nombres]) => {
      nombres.forEach((nombre) => {
        nombre.split(' ').forEach((palabra) => {
          const anchoPalabra = medirTexto(palabra)
          expect(anchoPalabra, `"${palabra}" de "${nombre}" (${complejo}) no entra en ${anchoDisponible}px`).toBeLessThanOrEqual(anchoDisponible)
        })
      })
    })
  })

  it('Mimmo (necesita 2 líneas para sus nombres largos) tiene una altura de fila mobile mayor que Cabañas VIP (1 línea alcanza)', () => {
    const alturaMimmo = calcularAlturaFilaMobile(NOMBRES_POR_COMPLEJO.Mimmo)
    const alturaVip = calcularAlturaFilaMobile(NOMBRES_POR_COMPLEJO['Cabañas VIP'])
    expect(alturaMimmo).toBeGreaterThan(alturaVip)
  })

  it('con una lista vacía/nula no rompe', () => {
    expect(calcularAlturaFilaMobile([])).toBe(0)
    expect(calcularAlturaFilaMobile(null)).toBe(0)
  })
})

// ── Integración: render real, mobile vs. desktop ──────────────────
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

function setAnchoVentana(ancho) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: ancho })
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

function filasDeNombre() {
  // Fila de cabaña = div con exactamente 2 hijos <span>: el punto de
  // color (8x8) y el texto.
  return Array.from(document.querySelectorAll('div')).filter((d) => {
    if (d.children.length !== 2) return false
    const [punto, texto] = d.children
    return punto.tagName === 'SPAN' && punto.style.width === '8px' && texto.tagName === 'SPAN'
  })
}

function columnaEsquina() {
  return Array.from(document.querySelectorAll('div')).find(
    (d) => d.style.position === 'sticky' && d.style.left === '0px' && d.style.zIndex === '22'
  )
}

describe('Disponibilidad "Ver todas" — mobile: ancho fijo + wrap + altura uniforme por complejo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    setAnchoVentana(1024) // de vuelta a "desktop" para no filtrar a otros tests de este archivo
  })

  it('usa ANCHO_COLUMNA_NOMBRE_MOBILE (fijo) para un complejo de nombres cortos (VIP) Y para uno de nombres largos (Mimmo) por igual', async () => {
    setAnchoVentana(390)
    await renderYVerTodas(NOMBRES_POR_COMPLEJO['Cabañas VIP'])
    expect(columnaEsquina().style.width).toBe(`${ANCHO_COLUMNA_NOMBRE_MOBILE}px`)

    document.body.innerHTML = ''
    await renderYVerTodas(NOMBRES_POR_COMPLEJO.Mimmo)
    expect(columnaEsquina().style.width).toBe(`${ANCHO_COLUMNA_NOMBRE_MOBILE}px`)
  })

  it('el texto wrapea (whiteSpace normal, sin ellipsis) en vez de truncarse', async () => {
    setAnchoVentana(390)
    await renderYVerTodas(NOMBRES_POR_COMPLEJO.Mimmo)

    const fila = filasDeNombre().find((f) => f.children[1].textContent === 'Dos Ambientes Planta Baja 4')
    const span = fila.children[1]
    expect(span.style.whiteSpace).toBe('normal')
    expect(span.style.textOverflow).toBe('')
    expect(span.textContent).toBe('Dos Ambientes Planta Baja 4') // nada cortado/reemplazado por "..."
  })

  it('todas las filas de un mismo complejo comparten exactamente la misma altura en mobile', async () => {
    setAnchoVentana(390)
    await renderYVerTodas(NOMBRES_POR_COMPLEJO.Mimmo)

    const alturas = new Set(filasDeNombre().map((f) => f.style.height))
    expect(alturas.size).toBe(1)
  })

  it('la altura de fila mobile de Mimmo (nombres que wrapean a 2 líneas) es mayor que la de VIP (1 línea alcanza)', async () => {
    setAnchoVentana(390)
    await renderYVerTodas(NOMBRES_POR_COMPLEJO.Mimmo)
    const alturaMimmo = parseFloat(filasDeNombre()[0].style.height)

    document.body.innerHTML = ''
    await renderYVerTodas(NOMBRES_POR_COMPLEJO['Cabañas VIP'])
    const alturaVip = parseFloat(filasDeNombre()[0].style.height)

    expect(alturaMimmo).toBeGreaterThan(alturaVip)
  })

  it('en desktop (ancho de ventana por defecto) sigue usando el ancho dinámico POR COMPLEJO, no el fijo de mobile', async () => {
    // Sin setAnchoVentana: jsdom arranca en 1024px ("desktop") por
    // default, así que esto cubre el comportamiento real sin tocar
    // ningún ancho explícitamente — si alguna vez cambia el default de
    // jsdom, este test lo haría evidente.
    await renderYVerTodas(NOMBRES_POR_COMPLEJO.Mimmo)

    const esperadoDesktop = calcularAnchoColumnaNombres(NOMBRES_POR_COMPLEJO.Mimmo)
    expect(esperadoDesktop).not.toBe(ANCHO_COLUMNA_NOMBRE_MOBILE) // son conceptualmente distintos
    expect(columnaEsquina().style.width).toBe(`${esperadoDesktop}px`)

    const span = filasDeNombre()[0].children[1]
    expect(span.style.whiteSpace).toBe('nowrap')
    expect(span.style.textOverflow).toBe('ellipsis')
  })

  it('"Ver por cabaña" no tiene columna-esquina en ningún ancho (mobile incluido) — no se ve afectada por este cambio', async () => {
    setAnchoVentana(390)
    mockComplejoConCabanas(NOMBRES_POR_COMPLEJO.Mimmo)
    supabase.from.mockReturnValue({
      select: () => ({ eq: () => ({ neq: () => Promise.resolve({ data: [], error: null }) }) }),
    })
    render(<MemoryRouter><Disponibilidad /></MemoryRouter>)
    await waitFor(() => expect(screen.queryByText('Cargando disponibilidad...')).not.toBeInTheDocument())
    // Vista por defecto ya es "Ver por cabaña" — no hace falta cambiar de tab.
    expect(columnaEsquina()).toBeUndefined()
  })
})

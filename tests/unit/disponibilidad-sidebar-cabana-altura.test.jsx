// Lista de cabañas de "Ver por cabaña" en desktop: con los nombres más
// largos de Mimmo tras el rename ("2 Ambientes Planta Baja 4", etc.),
// el nombre se truncaba con ellipsis en una sola línea porque la fila
// no era lo bastante alta.
//
// Primer intento (rechazado): wrap por ancho de contenedor
// (white-space:normal liso) — partía "2 Ambientes Planta Baja 4" en
// "2 Ambientes Planta Baja" / "4", un corte feo y dependiente del
// ancho disponible, no de dónde tiene sentido cortar el nombre.
//
// Versión final: partirNombreCabana hace un corte DELIBERADO sobre el
// string para el patrón "<número> Ambientes <resto>" — línea 1 SIEMPRE
// "<número> Ambientes", línea 2 SIEMPRE "<resto>" ("Planta Baja 4"),
// fijo, sin importar el ancho de la fila. Cualquier otro nombre (no
// matchea el patrón) no se corta — se ve exactamente igual que
// siempre, en cualquier complejo.
//
// La ALTURA de fila (calcularAlturaFilaSidebarDesktop) no cambió con
// este ajuste: sigue basada en cuántas líneas necesitaría el wrap por
// ancho (contarLineasNecesarias) — para los nombres reales de hoy, esa
// cuenta y la del corte deliberado coinciden (exactamente los mismos 4
// nombres de Mimmo necesitan 2 líneas en ambos esquemas), así que la
// altura uniforme ya aprobada sigue siendo correcta sin tocarla. Mismo
// tratamiento que ya tiene la grilla mobile de "Ver todas" desde el
// 02/10 para la ALTURA (calcularAlturaFilaMobile) — el corte de línea
// en sí es lo único que cambió acá, no el cálculo de altura. Ver
// src/pages/Disponibilidad.jsx y el mock de Canvas 2D (font 500 14px
// Inter, calibrado contra navegador real) en tests/setup/vitest.setup.js.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Disponibilidad, { calcularAlturaFilaSidebarDesktop, partirNombreCabana } from '../../src/pages/Disponibilidad'

// Nombres reales de Mimmo y Cabañas VIP (staging, confirmados en el
// audit del rename) — Mimmo es el único de los 5 complejos con algún
// nombre que necesita 2 líneas hoy.
const NOMBRES_MIMMO = [
  'Chalet 3 Ambientes', 'Confort 2', 'Confort 3',
  '2 Ambientes Planta Baja 4', '2 Ambientes Planta Baja 5',
  '2 Ambientes Planta Alta 6', '2 Ambientes Planta Alta 7',
  'Clásica 8', 'Clásica 9', 'Mimmo I', 'Mimmo II', 'Mimmo III',
]
const NOMBRES_VIP = ['Bahama', 'Bahia', 'Maui', 'Itaparica', 'Acapulco', 'Cozumel', 'Ibiza', 'Ipanema', 'Maceio', 'Hawai', 'Vallarta', 'Aruba', 'Cancún', 'Buzios', 'Jamaica']

describe('calcularAlturaFilaSidebarDesktop (código real, función pura)', () => {
  it('Mimmo (4 nombres necesitan 2 líneas) da una altura mayor que un complejo donde todos entran en 1 línea', () => {
    const alturaMimmo = calcularAlturaFilaSidebarDesktop(NOMBRES_MIMMO)
    const alturaVip = calcularAlturaFilaSidebarDesktop(NOMBRES_VIP)
    expect(alturaMimmo).toBeGreaterThan(alturaVip)
  })

  it('la altura es la misma sin importar CUÁNTOS nombres de ese complejo necesiten 2 líneas (peor caso único, no por cabaña)', () => {
    // Con 1 solo nombre largo alcanza para que TODO el complejo use la
    // altura de 2 líneas — no cambia si hay 1 o 4 nombres largos.
    const unSoloLargo = ['Confort 2', '2 Ambientes Planta Baja 4', 'Mimmo I']
    expect(calcularAlturaFilaSidebarDesktop(unSoloLargo)).toBe(calcularAlturaFilaSidebarDesktop(NOMBRES_MIMMO))
  })

  it('un complejo con todos los nombres cortos no crece más allá de la base de 1 línea', () => {
    const alturaVip = calcularAlturaFilaSidebarDesktop(NOMBRES_VIP)
    const alturaUnaCabana = calcularAlturaFilaSidebarDesktop(['Casa'])
    expect(alturaVip).toBe(alturaUnaCabana)
  })

  it('con una lista vacía/nula devuelve 0, no explota', () => {
    expect(calcularAlturaFilaSidebarDesktop([])).toBe(0)
    expect(calcularAlturaFilaSidebarDesktop(null)).toBe(0)
    expect(calcularAlturaFilaSidebarDesktop(undefined)).toBe(0)
  })
})

describe('partirNombreCabana (código real, función pura) — corte deliberado, no wrap por ancho', () => {
  it('"2 Ambientes Planta Baja 4" -> línea 1 "2 Ambientes", línea 2 "Planta Baja 4" (no "...Baja" / "4")', () => {
    expect(partirNombreCabana('2 Ambientes Planta Baja 4')).toEqual(['2 Ambientes', 'Planta Baja 4'])
  })

  it('los 4 nombres reales de Mimmo con este patrón cortan en el mismo punto, cada uno con su resto completo', () => {
    expect(partirNombreCabana('2 Ambientes Planta Baja 5')).toEqual(['2 Ambientes', 'Planta Baja 5'])
    expect(partirNombreCabana('2 Ambientes Planta Alta 6')).toEqual(['2 Ambientes', 'Planta Alta 6'])
    expect(partirNombreCabana('2 Ambientes Planta Alta 7')).toEqual(['2 Ambientes', 'Planta Alta 7'])
  })

  it('un número de más de un dígito también matchea (no asume un solo dígito)', () => {
    expect(partirNombreCabana('12 Ambientes Lo Que Sea')).toEqual(['12 Ambientes', 'Lo Que Sea'])
  })

  it('"Chalet 3 Ambientes" NO matchea (no empieza con "<número> Ambientes") — una sola línea, sin cortar', () => {
    expect(partirNombreCabana('Chalet 3 Ambientes')).toEqual(['Chalet 3 Ambientes'])
  })

  it('nombres sin relación al patrón (otros complejos) devuelven una sola línea', () => {
    expect(partirNombreCabana('Confort 2')).toEqual(['Confort 2'])
    expect(partirNombreCabana('Clásica 8')).toEqual(['Clásica 8'])
    expect(partirNombreCabana('Mimmo I')).toEqual(['Mimmo I'])
    expect(partirNombreCabana('Bahama')).toEqual(['Bahama'])
    expect(partirNombreCabana('Casa Azahar I')).toEqual(['Casa Azahar I'])
    expect(partirNombreCabana('Dúplex 3')).toEqual(['Dúplex 3'])
  })

  it('no explota con null/undefined/vacío', () => {
    expect(partirNombreCabana(null)).toEqual([null])
    expect(partirNombreCabana(undefined)).toEqual([undefined])
    expect(partirNombreCabana('')).toEqual([''])
  })
})

// ── Integración: la lista real usa esa altura de forma uniforme ──
vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../src/context/ComplejoContext', () => ({ useComplejo: vi.fn() }))

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'

function mockMimmo() {
  useComplejo.mockReturnValue({
    complejoActivo: { id: 'c1', slug: 'mimmo', nombre: 'Mimmo' },
    cabanasNombres: NOMBRES_MIMMO,
    getCabanaColor: () => '#123456',
    cabanasPorGrupo: [
      { grupo: 'MIMMO I', cabanas: NOMBRES_MIMMO.slice(0, 9) },
      { grupo: 'MIMMO II', cabanas: NOMBRES_MIMMO.slice(9) },
    ],
  })
}

function mockVip() {
  useComplejo.mockReturnValue({
    complejoActivo: { id: 'c2', slug: 'cabanas-vip', nombre: 'Cabañas VIP' },
    cabanasNombres: NOMBRES_VIP,
    getCabanaColor: () => '#123456',
    cabanasPorGrupo: [{ grupo: null, cabanas: NOMBRES_VIP }],
  })
}

async function renderPorCabana() {
  supabase.from.mockReturnValue({
    select: () => ({ eq: () => ({ neq: () => Promise.resolve({ data: [], error: null }) }) }),
  })
  render(<MemoryRouter><Disponibilidad /></MemoryRouter>)
  // "Ver por cabaña" es la vista por defecto (showAll=false) — no hace
  // falta tocar el toggle.
  await waitFor(() => expect(screen.queryByText('Cargando disponibilidad...')).not.toBeInTheDocument())
  await waitFor(() => expect(screen.getByText('Cabañas')).toBeInTheDocument())
}

// Botones de fila del sidebar DESKTOP — jsdom no aplica media queries,
// así que el pill mobile (md:hidden, mismo nombre de cabaña COMPLETO
// como texto de botón, sin cortar — el corte deliberado es sólo de
// este sidebar) y el botón del sidebar desktop conviven en el DOM.
//
// Para un nombre que partirNombreCabana corta en 2 líneas, el string
// completo ("2 Ambientes Planta Baja 4") ya NO existe como un único
// nodo de texto en el sidebar desktop (son 2 <div> separados) — sólo
// existe así en el pill mobile. Por eso se busca por la SEGUNDA línea
// (el resto, ej. "Planta Baja 4") cuando corresponde: ese substring es
// único por cabaña y sólo aparece en el <div> del sidebar desktop. Para
// un nombre sin corte, se sigue buscando por el nombre completo, con el
// mismo criterio de tomar el ÚLTIMO nodo (el pill mobile aparece
// primero en el JSX) ya usado en disponibilidad-cabana-renombrada.test.jsx.
function botonesDeFila(nombres) {
  return nombres.map((n) => {
    const lineas = partirNombreCabana(n)
    const textoBuscado = lineas.length === 2 ? lineas[1] : n
    const nodosNombre = screen.getAllByText(textoBuscado, { exact: true })
    const nodo = nodosNombre[nodosNombre.length - 1]
    return nodo.closest('button')
  })
}

describe('Disponibilidad "Ver por cabaña" (desktop) — altura uniforme de fila en la lista de cabañas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('Mimmo: las 12 filas tienen EXACTAMENTE la misma minHeight (incluidas las que no necesitan 2 líneas)', async () => {
    mockMimmo()
    await renderPorCabana()

    const botones = botonesDeFila(NOMBRES_MIMMO)
    const alturas = botones.map((b) => b.style.minHeight)
    expect(new Set(alturas).size).toBe(1) // todas iguales
    expect(parseFloat(alturas[0])).toBe(calcularAlturaFilaSidebarDesktop(NOMBRES_MIMMO))
  })

  it('"2 Ambientes Planta Baja 4" se corta DELIBERADAMENTE en "2 Ambientes" / "Planta Baja 4" (no en "...Baja" / "4")', async () => {
    mockMimmo()
    await renderPorCabana()

    const boton = botonesDeFila(['2 Ambientes Planta Baja 4'])[0]
    // Las 2 líneas existen como nodos de texto SEPARADOS DENTRO DE ESTE
    // botón (el sidebar desktop) — acotado a él porque "2 Ambientes"
    // sola se repite en las 4 cabañas con este patrón, y porque el
    // pill mobile (md:hidden, sin tocar por este cambio) sigue
    // mostrando el string completo sin cortar a propósito, en otro
    // botón — buscar sin acotar sería ambiguo/un falso negativo.
    expect(within(boton).getByText('2 Ambientes', { exact: true })).toBeInTheDocument()
    expect(within(boton).getByText('Planta Baja 4', { exact: true })).toBeInTheDocument()
    expect(within(boton).queryByText('2 Ambientes Planta Baja 4', { exact: true })).not.toBeInTheDocument()
    // Ningún corte feo a mitad de "Planta Baja" dentro de este botón.
    expect(within(boton).queryByText('2 Ambientes Planta Baja', { exact: true })).not.toBeInTheDocument()
  })

  it('las 4 cabañas "2 Ambientes..." de Mimmo cortan cada una en su propia "2 Ambientes" / resto correcto', async () => {
    mockMimmo()
    await renderPorCabana()

    const pares = [
      ['2 Ambientes Planta Baja 4', 'Planta Baja 4'],
      ['2 Ambientes Planta Baja 5', 'Planta Baja 5'],
      ['2 Ambientes Planta Alta 6', 'Planta Alta 6'],
      ['2 Ambientes Planta Alta 7', 'Planta Alta 7'],
    ]
    pares.forEach(([, resto]) => {
      expect(screen.getByText(resto, { exact: true })).toBeInTheDocument()
    })
    // "2 Ambientes" aparece 4 veces (una por cabaña) — no una sola
    // compartida entre todas.
    expect(screen.getAllByText('2 Ambientes', { exact: true })).toHaveLength(4)
  })

  it('"Chalet 3 Ambientes" (listado explícitamente como caso de prueba, NO matchea el patrón) se ve completo, sin cortar', async () => {
    mockMimmo()
    await renderPorCabana()

    expect(screen.queryByText('Chalet 3', { exact: true })).not.toBeInTheDocument()
    const botonesChalet = botonesDeFila(['Chalet 3 Ambientes'])
    expect(botonesChalet[0]).toBeTruthy()
  })

  it('"Confort 2"/"Clásica 8" (otros casos ya aprobados) tampoco se cortan — sin cambios', async () => {
    mockMimmo()
    await renderPorCabana()

    expect(screen.queryByText('Confort', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText('Clásica', { exact: true })).not.toBeInTheDocument()
  })

  it('otro complejo (Cabañas VIP, nombres cortos): también uniforme, pero con una altura MENOR que la de Mimmo', async () => {
    mockVip()
    await renderPorCabana()

    const botones = botonesDeFila(NOMBRES_VIP)
    const alturas = botones.map((b) => b.style.minHeight)
    expect(new Set(alturas).size).toBe(1)

    const alturaVip = parseFloat(alturas[0])
    const alturaMimmo = calcularAlturaFilaSidebarDesktop(NOMBRES_MIMMO)
    expect(alturaVip).toBeLessThan(alturaMimmo)
  })

  it('clickear una fila sigue seleccionando esa cabaña y mostrando su calendario (interacción sin cambios)', async () => {
    mockMimmo()
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    await renderPorCabana()

    const [boton] = botonesDeFila(['Confort 2'])
    await user.click(boton)

    await waitFor(() => expect(screen.getByText('Libre hoy')).toBeInTheDocument())
    // El estilo de "seleccionada" sigue siendo el borde de color (2px
    // solid) — mismo criterio que antes de este cambio.
    expect(boton.style.border).toMatch(/2px solid/)
  })
})

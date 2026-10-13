// Bug real (Etapa 2 de reservas multi-cabaña): toda la pantalla de
// Disponibilidad.jsx comparaba `reserva.cabana === cabana` (igualdad
// exacta de string) para decidir en qué fila/estado/lista aparecía
// cada reserva. Una reserva multi-cabaña guarda `cabana` como varios
// nombres separados por "\n" (ver CabinMultiPicker en ReservaForm.jsx)
// — ese string nunca es igual a un nombre de cabaña suelto, así que
// hoy estas reservas son directamente INVISIBLES acá (no aparece en
// ninguna fila, ni cuenta como "ocupada hoy", ni aparece en "Próx" ni
// en "Reservas en el período"), aunque existan y se vean bien en
// Reservas.jsx/ReservaDetalle.jsx (Etapa 1).
//
// Decisión de diseño aprobada (mockup): una reserva multi-cabaña se ve
// EXACTAMENTE igual que una de una sola cabaña — misma barra, mismo
// color, sin ningún ícono/badge extra — simplemente repetida una vez
// por cada cabaña que ocupa. La distinción sólo se ve al entrar al
// detalle de la reserva (funcionalidad ya existente).
//
// Este archivo prueba: (1) la función pura reservaIncluyeCabana en
// aislamiento (el único lugar que decide la relación reserva↔cabaña en
// todo el archivo, ya no reimplementada en cada call site), y (2) el
// componente real end-to-end con una reserva de 2 cabañas de DOS
// bloques distintos (MIMMO I + MIMMO II) — las barras de la grilla, el
// dot "ocupada hoy", el texto "Próx"/nombre en el sidebar, y la lista
// "Reservas en el período" de "Ver por cabaña".
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Disponibilidad, { reservaIncluyeCabana } from '../../src/pages/Disponibilidad'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../src/context/ComplejoContext', () => ({ useComplejo: vi.fn() }))

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'

describe('reservaIncluyeCabana (código real, función pura)', () => {
  it('reserva de UNA sola cabaña: comportamiento idéntico a la igualdad exacta de antes', () => {
    expect(reservaIncluyeCabana({ cabana: 'Mimmo I' }, 'Mimmo I')).toBe(true)
    expect(reservaIncluyeCabana({ cabana: 'Mimmo I' }, 'Mimmo II')).toBe(false)
  })

  it('reserva multi-cabaña del MISMO bloque: matchea cada una de sus cabañas', () => {
    const r = { cabana: 'Confort 2\nConfort 3' }
    expect(reservaIncluyeCabana(r, 'Confort 2')).toBe(true)
    expect(reservaIncluyeCabana(r, 'Confort 3')).toBe(true)
    expect(reservaIncluyeCabana(r, 'Confort 4')).toBe(false)
  })

  it('reserva multi-cabaña de DOS bloques distintos (MIMMO I + MIMMO II): matchea las de ambos', () => {
    const r = { cabana: 'Confort 2\nMimmo I' }
    expect(reservaIncluyeCabana(r, 'Confort 2')).toBe(true)
    expect(reservaIncluyeCabana(r, 'Mimmo I')).toBe(true)
    expect(reservaIncluyeCabana(r, 'Mimmo II')).toBe(false)
  })

  it('no explota con cabana null/undefined/vacío', () => {
    expect(reservaIncluyeCabana({ cabana: null }, 'Mimmo I')).toBe(false)
    expect(reservaIncluyeCabana({ cabana: undefined }, 'Mimmo I')).toBe(false)
    expect(reservaIncluyeCabana({ cabana: '' }, 'Mimmo I')).toBe(false)
    expect(reservaIncluyeCabana({}, 'Mimmo I')).toBe(false)
  })
})

const COMPLEJO = { id: 'c1', slug: 'mimmo', nombre: 'Mimmo' }
const CABANAS_POR_GRUPO = [
  { grupo: 'MIMMO I', cabanas: ['Chalet 3 Ambientes', 'Confort 2', 'Confort 3'] },
  { grupo: 'MIMMO II', cabanas: ['Mimmo I', 'Mimmo II', 'Mimmo III'] },
]
const CABANAS_NOMBRES = CABANAS_POR_GRUPO.flatMap((s) => s.cabanas)

// Reserva real de prueba: 2 cabañas, una de cada bloque.
const RESERVA_MULTI = {
  id: 'r-multi', codigo: 'A9001', nombre_apellido: 'Huésped Multi',
  cabana: 'Confort 2\nMimmo I',
  fecha_entrada: todayPlus(1), fecha_salida: todayPlus(3),
  estado: 'Confirmada', pax: 4, noches: 2,
  monto_total: 50000, sena1_monto: 0, sena2_monto: 0, pago_cabana_monto: 0,
}

// Fechas relativas a "hoy" (como string ISO) para poder probar
// "ocupada hoy"/"Próx" de forma estable sin depender de la fecha real
// en la que corran los tests.
function todayPlus(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function mockComplejo() {
  useComplejo.mockReturnValue({
    complejoActivo: COMPLEJO,
    cabanasNombres: CABANAS_NOMBRES,
    getCabanaColor: () => '#123456',
    cabanasPorGrupo: CABANAS_POR_GRUPO,
  })
}

function mockReservas(data) {
  supabase.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        neq: () => Promise.resolve({ data, error: null }),
      }),
    }),
  })
}

async function esperarCarga() {
  await waitFor(() => expect(screen.queryByText('Cargando disponibilidad...')).not.toBeInTheDocument())
}

describe('Disponibilidad.jsx — "Ver todas": la barra de una reserva multi-cabaña se repite en cada fila', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockComplejo()
    mockReservas([RESERVA_MULTI])
  })

  it('el código de la reserva aparece en AMBAS filas (Confort 2 y Mimmo I), sin warning de key duplicada', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<MemoryRouter><Disponibilidad /></MemoryRouter>)
    await esperarCarga()

    // La barra muestra r.codigo centrado — dos instancias, una por fila.
    await waitFor(() => expect(screen.getAllByText('A9001')).toHaveLength(2))

    // Ninguna advertencia de React sobre keys duplicadas/faltantes.
    const avisosDeKey = consoleError.mock.calls.filter(([msg]) =>
      typeof msg === 'string' && msg.includes('key')
    )
    expect(avisosDeKey).toHaveLength(0)
    consoleError.mockRestore()
  })

  it('una reserva de UNA sola cabaña sigue apareciendo exactamente una vez (sin regresión)', async () => {
    mockReservas([{ ...RESERVA_MULTI, id: 'r-una', codigo: 'A9002', cabana: 'Confort 2' }])
    render(<MemoryRouter><Disponibilidad /></MemoryRouter>)
    await esperarCarga()

    await waitFor(() => expect(screen.getAllByText('A9002')).toHaveLength(1))
  })

  it('clickear cualquiera de las 2 instancias de la barra abre el mismo popup de la reserva', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Disponibilidad /></MemoryRouter>)
    await esperarCarga()

    const [, segundaBarra] = await screen.findAllByText('A9001')
    await user.click(segundaBarra)

    // El popup (ReservaPopup) tiene su propio label "Huésped" (section
    // label, texto exacto, distinto de "Huésped Multi" el nombre) —
    // confirma que clickear la instancia de CUALQUIER fila abre el
    // popup de la reserva real. No se busca "Huésped Multi" a secas:
    // jsdom no aplica media queries, así que el bloque mobile
    // "Próximas reservas (todos)" (md:hidden) y el sidebar desktop
    // conviven en el DOM aunque sólo uno sea visible, y ambos ya
    // muestran ese nombre de por sí.
    await waitFor(() => expect(screen.getByText('Huésped')).toBeInTheDocument())
  })
})

describe('Disponibilidad.jsx — "ocupada hoy" y "Próx" reflejan reservas multi-cabaña en AMBAS cabañas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockComplejo()
  })

  it('reserva multi-cabaña que ocupa HOY: ambas cabañas cuentan como ocupadas', async () => {
    mockReservas([{ ...RESERVA_MULTI, fecha_entrada: todayPlus(0), fecha_salida: todayPlus(2) }])
    render(<MemoryRouter><Disponibilidad /></MemoryRouter>)
    await esperarCarga()

    // "N de M cabañas ocupadas hoy" — 2 cabañas ocupadas (Confort 2 y
    // Mimmo I), no sólo 1 (lo que daría si matcheara una sola cabaña o
    // ninguna si el string completo nunca matchea nada).
    await waitFor(() => expect(screen.getByText(/2 de \d+ cabañas ocupadas hoy/)).toBeInTheDocument())
  })

  it('en "Ver por cabaña": el sidebar muestra el nombre del huésped (no "Próx") para AMBAS cabañas de la reserva', async () => {
    mockReservas([{ ...RESERVA_MULTI, fecha_entrada: todayPlus(0), fecha_salida: todayPlus(2) }])
    render(<MemoryRouter><Disponibilidad /></MemoryRouter>)
    await esperarCarga()

    // Cambiar a "Ver por cabaña" (arranca en "Ver todas").
    const toggle = screen.getByRole('button', { name: /Por cabaña|Ver todas/ })
    const user = userEvent.setup()
    if (toggle.textContent.includes('Por cabaña')) await user.click(toggle)

    // El botón de la cabaña "Confort 2" muestra el apellido/nombre de
    // la reserva actual, no "Próx: ..." ni "Libre" — jsdom no aplica
    // media queries, así que el pill mobile (sin texto de estado) y el
    // botón del sidebar desktop (con "Huésped Multi") conviven en el
    // DOM: se ubica el nodo con el texto EXACTO del nombre de cabaña
    // (exact:true evita que "Mimmo I" matchee "Mimmo II"/"Mimmo III"
    // por substring) y se sube al <button> que lo contiene, quedándose
    // con el que además tiene texto de estado ("Huésped...").
    function botonSidebarCon(cabana) {
      const nodos = screen.getAllByText(cabana, { exact: true })
      const botones = nodos.map((n) => n.closest('button')).filter(Boolean)
      return botones.find((b) => within(b).queryByText(/Huésped/))
    }

    const botonConfort2 = botonSidebarCon('Confort 2')
    expect(botonConfort2).toBeTruthy()
    expect(within(botonConfort2).getByText(/Huésped/)).toBeInTheDocument()

    // Lo mismo para "Mimmo I" — la MISMA reserva, la OTRA cabaña.
    const botonMimmoI = botonSidebarCon('Mimmo I')
    expect(botonMimmoI).toBeTruthy()
    expect(within(botonMimmoI).getByText(/Huésped/)).toBeInTheDocument()
  })
})

describe('Disponibilidad.jsx — "Ver por cabaña": timeline y "Reservas en el período" para cada cabaña de una reserva multi-cabaña', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockComplejo()
    mockReservas([RESERVA_MULTI])
  })

  async function irAVerPorCabanaYSeleccionar(user, nombreCabana) {
    const toggle = screen.getByRole('button', { name: /Por cabaña|Ver todas/ })
    if (toggle.textContent.includes('Por cabaña')) await user.click(toggle)
    const boton = screen.getByRole('button', { name: new RegExp(`^${nombreCabana}$`) })
    await user.click(boton)
  }

  // Acota a la sección "Reservas en el período" en sí (jsdom no aplica
  // media queries: el panel mobile y el desktop conviven en el DOM, y
  // "A9001"/"Huésped Multi" también aparecen en la barra del timeline y
  // en la lista mobile — sin acotar, las queries quedan ambiguas).
  function seccionPeriodo() {
    return screen.getByText('Reservas en el período').closest('div')
  }

  it('seleccionar "Confort 2" muestra la reserva en el timeline y en "Reservas en el período"', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Disponibilidad /></MemoryRouter>)
    await esperarCarga()
    await irAVerPorCabanaYSeleccionar(user, 'Confort 2')

    const seccion = seccionPeriodo()
    expect(within(seccion).getByText('A9001')).toBeInTheDocument()
    expect(within(seccion).getByText('Huésped Multi')).toBeInTheDocument()
    expect(within(seccion).queryByText('Sin reservas en el período seleccionado')).not.toBeInTheDocument()
  })

  it('seleccionar "Mimmo I" (la OTRA cabaña de la MISMA reserva, otro bloque) también la muestra', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Disponibilidad /></MemoryRouter>)
    await esperarCarga()
    await irAVerPorCabanaYSeleccionar(user, 'Mimmo I')

    const seccion = seccionPeriodo()
    expect(within(seccion).getByText('A9001')).toBeInTheDocument()
    expect(within(seccion).getByText('Huésped Multi')).toBeInTheDocument()
  })

  it('seleccionar una cabaña que NO ocupa esta reserva no la muestra', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Disponibilidad /></MemoryRouter>)
    await esperarCarga()
    await irAVerPorCabanaYSeleccionar(user, 'Confort 3')

    expect(screen.queryByText('A9001')).not.toBeInTheDocument()
    expect(screen.getByText('Sin reservas en el período seleccionado')).toBeInTheDocument()
  })
})

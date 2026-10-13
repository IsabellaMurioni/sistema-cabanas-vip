// Bug real evitado por este fix: cuando se renombra una cabaña (ver
// 030_mimmo_los_amigos_rename_definitivo.sql — "Confort I" -> "Confort
// 2"), una reserva ya creada sigue guardando el nombre VIEJO en
// `reservas.cabana` para siempre (texto libre, nunca reescrito a
// propósito — el hard constraint de este cambio es no tocar ninguna
// fila de `reservas`). Sin este fix, esa reserva vieja dejaría de
// matchear la fila "Confort 2" en Disponibilidad (invisible en la
// grilla, "libre hoy" aunque esté ocupada, sin "Próx", ausente de
// "Reservas en el período") — exactamente el mismo síntoma que el bug
// de multi-cabaña arreglado antes, pero disparado por un rename en vez
// de por "\n".
//
// Fix: reservaIncluyeCabana ahora toma un tercer parámetro opcional
// (cabanasActivo, la lista real de cabañas con su nombres_anteriores)
// y matchea por nombre actual O cualquiera de los anteriores (vía
// cabinMatchesName, ComplejoContext.jsx) — sin ese parámetro, el
// comportamiento es IDÉNTICO a antes (ver el describe de abajo que lo
// confirma explícitamente, protegiendo los tests ya existentes de
// disponibilidad-multi-cabana.test.jsx).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Disponibilidad, { reservaIncluyeCabana } from '../../src/pages/Disponibilidad'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
// Mock parcial: sólo useComplejo se reemplaza (controlado por cada
// test vía mockReturnValue) — cabinMatchesName es una función pura sin
// dependencias de React/Supabase, y Disponibilidad.jsx la importa
// directo de este módulo (no a través de useComplejo()), así que debe
// seguir siendo la real o la pantalla explota al intentar llamarla.
vi.mock('../../src/context/ComplejoContext', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useComplejo: vi.fn() }
})

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'

describe('reservaIncluyeCabana (código real) — con el tercer parámetro cabanasActivo', () => {
  const cabanasActivo = [
    { nombre: 'Confort 2', nombres_anteriores: ['Confort I'] },
    { nombre: 'Mimmo I', nombres_anteriores: [] },
  ]

  it('una reserva guardada con el nombre VIEJO matchea la fila de la cabaña RENOMBRADA', () => {
    expect(reservaIncluyeCabana({ cabana: 'Confort I' }, 'Confort 2', cabanasActivo)).toBe(true)
  })

  it('una reserva guardada con el nombre NUEVO sigue matcheando (regresión, caso normal)', () => {
    expect(reservaIncluyeCabana({ cabana: 'Confort 2' }, 'Confort 2', cabanasActivo)).toBe(true)
  })

  it('una reserva multi-cabaña con una cabaña renombrada entre sus nombres matchea esa fila', () => {
    expect(reservaIncluyeCabana({ cabana: 'Confort I\nMimmo I' }, 'Confort 2', cabanasActivo)).toBe(true)
    expect(reservaIncluyeCabana({ cabana: 'Confort I\nMimmo I' }, 'Mimmo I', cabanasActivo)).toBe(true)
  })

  it('sin tercer parámetro (cabanasActivo undefined): comportamiento IDÉNTICO a antes — sólo matchea el nombre exacto, sin alias', () => {
    expect(reservaIncluyeCabana({ cabana: 'Confort I' }, 'Confort 2')).toBe(false)
    expect(reservaIncluyeCabana({ cabana: 'Confort 2' }, 'Confort 2')).toBe(true)
  })

  it('con cabanasActivo pero sin ninguna fila que matchee el nombre actual buscado: se degrada a comparación exacta (no explota)', () => {
    expect(reservaIncluyeCabana({ cabana: 'Confort I' }, 'Cabaña Sin Catálogo', cabanasActivo)).toBe(false)
  })
})

const COMPLEJO = { id: 'c1', slug: 'mimmo', nombre: 'Mimmo' }
const CABANAS_POR_GRUPO = [{ grupo: 'MIMMO I', cabanas: ['Confort 2', 'Confort 3'] }]
const CABANAS_ACTIVO = [
  { nombre: 'Confort 2', color: '#B16B25', grupo: 'MIMMO I', orden: 1, nombres_anteriores: ['Confort I'] },
  { nombre: 'Confort 3', color: '#96962C', grupo: 'MIMMO I', orden: 2, nombres_anteriores: [] },
]

function todayPlus(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Reserva "vieja" — creada ANTES del rename, guardada con el nombre
// que la cabaña tenía en ese momento ("Confort I"), ocupando hoy.
const RESERVA_VIEJA = {
  id: 'r-vieja', codigo: 'A8001', nombre_apellido: 'Huésped Histórico',
  cabana: 'Confort I',
  fecha_entrada: todayPlus(0), fecha_salida: todayPlus(2),
  estado: 'Confirmada', pax: 2, noches: 2,
  monto_total: 10000, sena1_monto: 0, sena2_monto: 0, pago_cabana_monto: 0,
}

function mockComplejo() {
  useComplejo.mockReturnValue({
    complejoActivo: COMPLEJO,
    cabanasNombres: CABANAS_ACTIVO.map((c) => c.nombre),
    cabanasActivo: CABANAS_ACTIVO,
    getCabanaColor: (nombre) => {
      const row = CABANAS_ACTIVO.find((c) => c.nombre === nombre || (c.nombres_anteriores || []).includes(nombre))
      return row?.color || '#64748b'
    },
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

describe('Disponibilidad.jsx — una reserva vieja (nombre pre-rename) sigue viéndose bien en la cabaña RENOMBRADA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockComplejo()
    mockReservas([RESERVA_VIEJA])
  })

  it('"Ver todas": la barra aparece en la fila de la cabaña con su nombre NUEVO ("Confort 2")', async () => {
    render(<MemoryRouter><Disponibilidad /></MemoryRouter>)
    await esperarCarga()

    await waitFor(() => expect(screen.getAllByText('A8001').length).toBeGreaterThan(0))
    // "ocupada hoy" cuenta a Confort 2 como ocupada (no "0 de N").
    await waitFor(() => expect(screen.getByText(/^1 de \d+ cabañas ocupadas hoy/)).toBeInTheDocument())
  })

  it('"Ver por cabaña": seleccionar "Confort 2" (nombre nuevo) muestra "Ocupada hoy" y la reserva vieja en el período', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Disponibilidad /></MemoryRouter>)
    await esperarCarga()

    // La vista por defecto (showAll=false) ya ES "Ver por cabaña" — no
    // hace falta tocar el toggle.
    const nodos = screen.getAllByText('Confort 2', { exact: true })
    await user.click(nodos[nodos.length - 1])

    await waitFor(() => expect(screen.getByText('Ocupada hoy')).toBeInTheDocument())
    const seccion = screen.getByText('Reservas en el período').closest('div')
    expect(within(seccion).getByText('A8001')).toBeInTheDocument()
    expect(within(seccion).getByText('Huésped Histórico')).toBeInTheDocument()
  })
})

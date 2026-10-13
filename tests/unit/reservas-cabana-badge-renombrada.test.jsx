// Una reserva guardada con el nombre VIEJO de una cabaña renombrada
// (ver 030_mimmo_los_amigos_rename_definitivo.sql) tiene que verse en
// Reservas.jsx EXACTAMENTE igual que una reserva nueva contra la misma
// cabaña física: badge de grupo correcto, color correcto, y el TEXTO
// del badge mostrando el nombre ACTUAL de la cabaña — no lo que esa
// reserva puntual tiene guardado. Lorena tiene que ver "Confort 2" en
// todas partes, incluso para una reserva vieja guardada como "Confort
// I" — la cabaña física es la misma, sólo cambió su nombre.
// cabanasPorGrupo sólo tiene nombres ACTUALES, así que el lookup de
// grupo necesita canonicalizar primero (nombreActualDeCabana); el
// color ya resolvía bien por su cuenta (resolverColorCabana, también
// alias-aware). Este test cubre los tres: grupo, color, y texto.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Reservas from '../../src/pages/Reservas'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
// Mock parcial: Reservas.jsx importa nombreActualDeCabana directo de
// este módulo (no a través de useComplejo()) — tiene que seguir siendo
// la función real, sólo useComplejo() se reemplaza.
vi.mock('../../src/context/ComplejoContext', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useComplejo: vi.fn() }
})

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'

const COMPLEJO = { id: 'c1', slug: 'mimmo', nombre: 'Mimmo' }
const CABANAS_POR_GRUPO = [
  { grupo: 'MIMMO I', cabanas: ['Confort 2', 'Confort 3'] },
  { grupo: 'MIMMO II', cabanas: ['Mimmo I'] },
]
const CABANAS_ACTIVO = [
  { nombre: 'Confort 2', color: '#B16B25', nombres_anteriores: ['Confort I'] },
  { nombre: 'Confort 3', color: '#96962C', nombres_anteriores: ['Confort II'] },
  { nombre: 'Mimmo I', color: '#6B25B1', nombres_anteriores: [] },
]

function getCabanaColor(nombre) {
  const row = CABANAS_ACTIVO.find((c) => c.nombre === nombre || (c.nombres_anteriores || []).includes(nombre))
  return row?.color || '#64748b'
}

const RESERVA_VIEJA = {
  id: 'r-vieja', codigo: 'A8001', nombre_apellido: 'Huésped Histórico',
  cabana: 'Confort I', // nombre PRE-rename — guardado al crear la reserva
  fecha_entrada: '2026-01-01', fecha_salida: '2026-01-03',
  noches: 2, monto_total: 100, sena1_monto: 0, sena2_monto: 0, pago_cabana_monto: 0,
  estado: 'Confirmada', mes: 'Enero',
}

const RESERVA_MULTI_VIEJA_Y_NUEVA = {
  id: 'r-multi', codigo: 'A8002', nombre_apellido: 'Huésped Dos Épocas',
  // Multi-cabaña: una con nombre viejo (Confort I), otra con el nombre
  // actual de una cabaña que nunca se renombró (Mimmo I).
  cabana: 'Confort I\nMimmo I',
  fecha_entrada: '2026-02-01', fecha_salida: '2026-02-03',
  noches: 2, monto_total: 200, sena1_monto: 0, sena2_monto: 0, pago_cabana_monto: 0,
  estado: 'Confirmada', mes: 'Febrero',
}

beforeEach(() => {
  vi.clearAllMocks()
  useComplejo.mockReturnValue({
    complejoActivo: COMPLEJO,
    getCabanaColor,
    cabanasPorGrupo: CABANAS_POR_GRUPO,
    cabanasActivo: CABANAS_ACTIVO,
  })
})

function celdaCabana(codigo) {
  const fila = screen.getByText(codigo).closest('tr')
  return fila.querySelectorAll('td')[2]
}

describe('Reservas.jsx — badge de una reserva guardada con el nombre VIEJO de una cabaña renombrada', () => {
  it('muestra el badge de GRUPO correcto ("MIMMO I"), no lo omite', async () => {
    supabase.from.mockReturnValue({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [RESERVA_VIEJA], error: null }) }) }),
    })
    render(<MemoryRouter><Reservas /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('A8001')).toBeInTheDocument())

    const celda = celdaCabana('A8001')
    expect(within(celda).getByText('MIMMO I')).toBeInTheDocument()
  })

  it('el TEXTO del badge muestra el nombre ACTUAL de la cabaña ("Confort 2"), no el nombre viejo guardado en la reserva ("Confort I")', async () => {
    supabase.from.mockReturnValue({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [RESERVA_VIEJA], error: null }) }) }),
    })
    render(<MemoryRouter><Reservas /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('A8001')).toBeInTheDocument())

    const celda = celdaCabana('A8001')
    expect(within(celda).getByText('Confort 2')).toBeInTheDocument()
    expect(within(celda).queryByText('Confort I')).not.toBeInTheDocument()
  })

  it('el color del badge es el color REAL de la cabaña (vía resolverColorCabana, ya alias-aware), no el gris de fallback', async () => {
    supabase.from.mockReturnValue({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [RESERVA_VIEJA], error: null }) }) }),
    })
    render(<MemoryRouter><Reservas /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('A8001')).toBeInTheDocument())

    const badge = within(celdaCabana('A8001')).getByText('Confort 2')
    expect(badge.style.backgroundColor).toBe('rgb(177, 107, 37)') // #B16B25
  })

  it('reserva multi-cabaña con una cabaña renombrada y otra sin renombrar: grupos y nombres ACTUALES para las dos, sin duplicar ni perder ninguno', async () => {
    supabase.from.mockReturnValue({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [RESERVA_MULTI_VIEJA_Y_NUEVA], error: null }) }) }),
    })
    render(<MemoryRouter><Reservas /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('A8002')).toBeInTheDocument())

    const celda = celdaCabana('A8002')
    expect(within(celda).getByText('MIMMO I')).toBeInTheDocument()
    expect(within(celda).getByText('MIMMO II')).toBeInTheDocument()
    // "Confort I" (guardado en la reserva) se muestra como "Confort 2"
    // (nombre actual); "Mimmo I" nunca se renombró, se muestra igual.
    expect(within(celda).getByText('Confort 2')).toBeInTheDocument()
    expect(within(celda).getByText('Mimmo I')).toBeInTheDocument()
    expect(within(celda).queryByText('Confort I')).not.toBeInTheDocument()
  })

  it('una reserva NUEVA (creada después del rename, con el nombre actual) sigue funcionando exactamente igual — sin regresión', async () => {
    const RESERVA_NUEVA = { ...RESERVA_VIEJA, id: 'r-nueva', codigo: 'A8003', cabana: 'Confort 2' }
    supabase.from.mockReturnValue({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [RESERVA_NUEVA], error: null }) }) }),
    })
    render(<MemoryRouter><Reservas /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('A8003')).toBeInTheDocument())

    const celda = celdaCabana('A8003')
    expect(within(celda).getByText('MIMMO I')).toBeInTheDocument()
    const badge = within(celda).getByText('Confort 2')
    expect(badge.style.backgroundColor).toBe('rgb(177, 107, 37)')
  })
})

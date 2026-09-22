// Bug real reportado: la tabla de Reservas.jsx mostraba "-" para una
// reserva a $0, indistinguible de una reserva sin precio cargado
// (monto_total null). Este test renderiza el componente real (no
// reimplementa el render) con una reserva a $0 y una con precio null,
// y prueba que "$0" aparece en pantalla y "-" también — para la fila
// correcta cada una.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Reservas from '../../src/pages/Reservas'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../src/context/ComplejoContext', () => ({ useComplejo: vi.fn() }))

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'

const COMPLEJO = { id: 'c1', slug: 'mimmo', nombre: 'Mimmo' }

const RESERVA_CERO = {
  id: 'r-cero', codigo: 'A-CERO', nombre_apellido: 'Reserva Gratis',
  cabana: 'Cabaña 1', fecha_entrada: '2026-01-01', fecha_salida: '2026-01-03',
  noches: 2, monto_total: 0, sena1_monto: 0, sena2_monto: 0, pago_cabana_monto: 0,
  estado: 'Confirmada', mes: 'Enero',
}

const RESERVA_SIN_PRECIO = {
  id: 'r-null', codigo: 'A-SINPRECIO', nombre_apellido: 'Sin Precio Cargado',
  cabana: 'Cabaña 2', fecha_entrada: '2026-01-05', fecha_salida: '2026-01-06',
  noches: 1, monto_total: null, sena1_monto: null, sena2_monto: null, pago_cabana_monto: null,
  estado: 'Pendiente', mes: 'Enero',
}

const RESERVA_NORMAL = {
  id: 'r-normal', codigo: 'A-NORMAL', nombre_apellido: 'Reserva Normal',
  cabana: 'Cabaña 3', fecha_entrada: '2026-01-08', fecha_salida: '2026-01-10',
  noches: 2, monto_total: 15000, sena1_monto: 5000, sena2_monto: 0, pago_cabana_monto: 0,
  estado: 'Confirmada', mes: 'Enero',
}

beforeEach(() => {
  vi.clearAllMocks()
  useComplejo.mockReturnValue({
    complejoActivo: COMPLEJO,
    getCabanaColor: () => '#123456',
    cabanasPorGrupo: [],
  })
  supabase.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve({ data: [RESERVA_CERO, RESERVA_SIN_PRECIO, RESERVA_NORMAL], error: null }),
      }),
    }),
  })
})

describe('Reservas.jsx — columna Total/Saldo distingue $0 de "sin precio" (bug real)', () => {
  it('una reserva a $0 muestra "$0" en Total y Saldo, no "-"', async () => {
    render(<MemoryRouter><Reservas /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('A-CERO')).toBeInTheDocument())

    const fila = screen.getByText('A-CERO').closest('tr')
    const celdas = fila.querySelectorAll('td')
    // Columnas: Código, Nombre, Cabaña, Entrada, Salida, Noches, Total, Saldo, Estado, Acciones
    expect(celdas[6].textContent).toBe('$0')
    expect(celdas[7].textContent).toBe('$0')
  })

  it('una reserva SIN precio cargado (monto_total null) sigue mostrando "-"', async () => {
    render(<MemoryRouter><Reservas /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('A-SINPRECIO')).toBeInTheDocument())

    const fila = screen.getByText('A-SINPRECIO').closest('tr')
    const celdas = fila.querySelectorAll('td')
    expect(celdas[6].textContent).toBe('-')
    expect(celdas[7].textContent).toBe('-')
  })

  it('una reserva normal (monto_total > 0) no cambia de comportamiento', async () => {
    render(<MemoryRouter><Reservas /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('A-NORMAL')).toBeInTheDocument())

    const fila = screen.getByText('A-NORMAL').closest('tr')
    const celdas = fila.querySelectorAll('td')
    expect(celdas[6].textContent).toBe('$15.000')
    expect(celdas[7].textContent).toBe('$10.000') // saldo = 15000 - 5000
  })
})

// Código real importado de src/pages/ReservaForm.jsx (fetchNextCode) —
// la única DB es un mock del cliente supabase, nada real se toca.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

import { supabase } from '../../src/lib/supabase'
import { fetchNextCode } from '../../src/pages/ReservaForm'

// Arma un builder encadenable .select().eq().like().order().limit()
// que resuelve al array de filas dado, imitando cómo se resuelve una
// query real de supabase-js al final de la cadena.
function mockReservasRows(rows) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    like: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  }
  return builder
}

describe('fetchNextCode (código real, DB mockeada)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('devuelve A2524 cuando el complejo no tiene ninguna reserva con código A', async () => {
    supabase.from.mockReturnValue(mockReservasRows([]))
    expect(await fetchNextCode('complejo-1')).toBe('A2524')
  })

  it('incrementa en 1 el último código numérico de ESE complejo', async () => {
    supabase.from.mockReturnValue(mockReservasRows([{ codigo: 'A2530' }]))
    expect(await fetchNextCode('complejo-1')).toBe('A2531')
  })

  it('filtra por complejo_id — dos complejos con historiales distintos no colisionan', async () => {
    supabase.from.mockReturnValueOnce(mockReservasRows([{ codigo: 'A2600' }]))
    const codigoA = await fetchNextCode('complejo-A')
    expect(codigoA).toBe('A2601')

    supabase.from.mockReturnValueOnce(mockReservasRows([]))
    const codigoB = await fetchNextCode('complejo-B')
    expect(codigoB).toBe('A2524')

    // Confirma que efectivamente se filtró por complejo_id con cada id
    // distinto — la separación no es casualidad de los datos mockeados.
    const eqCalls = supabase.from.mock.results.flatMap((r) => r.value.eq.mock.calls)
    expect(eqCalls).toContainEqual(['complejo_id', 'complejo-A'])
    expect(eqCalls).toContainEqual(['complejo_id', 'complejo-B'])
  })

  it('si el código no matchea el patrón numérico, cae a A2524 (fallback defensivo)', async () => {
    supabase.from.mockReturnValue(mockReservasRows([{ codigo: 'AXYZ' }]))
    expect(await fetchNextCode('complejo-1')).toBe('A2524')
  })
})

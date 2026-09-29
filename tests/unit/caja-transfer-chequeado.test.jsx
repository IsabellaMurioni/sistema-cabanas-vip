// Bug real: toggleChequeado (CajaTransfer, dentro de Caja.jsx) hacía un
// update optimista de la fila (setRows) y después mandaba el UPDATE a
// Supabase sin leer {error} para nada — ni siquiera lo destructuraba.
// Si el UPDATE fallaba (ej. la columna `chequeado` no existe en la
// base — pasó de verdad en producción, ver 008_chequeado.sql), el
// checkbox quedaba marcado en pantalla igual, sin ningún aviso, hasta
// el próximo reload (donde volvía a aparecer sin marcar, otra vez sin
// explicación). El fix lee {error}; si hay uno, revierte setRows al
// valor anterior y avisa con alert() — mismo patrón que ya usa el
// resto de Caja.jsx para errores (ver el submit de esta misma
// función, o SilviaCaja/JuliCaja: siempre alert(), nunca un estado de
// error inline ni una librería de toasts).
//
// Este test renderiza el componente real (CajaTransfer, exportado
// además del default) — no reimplementa toggleChequeado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CajaTransfer } from '../../src/pages/Caja'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../src/context/ComplejoContext', () => ({ useComplejo: vi.fn() }))

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'

const COMPLEJO = { id: 'complejo-1', slug: 'cabanas-vip', nombre: 'Cabañas VIP' }
const HOY = new Date().toISOString().slice(0, 10) // dentro del mes/año que el filtro por defecto muestra

const FILA_BASE = {
  id: 'mov-1',
  complejo_id: COMPLEJO.id,
  fecha: HOY,
  detalle: 'Movimiento de prueba',
  reserva_codigo: null,
  ingreso: 1000,
  egreso: 0,
  comprobante: null,
  chequeado: false,
  created_at: HOY,
}

// Mock "universal": select/eq/order encadenan y resuelven la lista
// inicial (load()); update() captura el payload y resuelve según
// `updateError` — así se puede simular tanto un UPDATE exitoso como
// uno que falla (columna inexistente, RLS, lo que sea), sin importar
// la causa real.
function makeSupabaseMock({ updateError = null } = {}) {
  let ultimoUpdate = null

  const from = vi.fn(() => {
    let esUpdate = false
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      update: (payload) => {
        esUpdate = true
        ultimoUpdate = payload
        return builder
      },
      then: (onFulfilled, onRejected) => {
        const resultado = esUpdate
          ? { data: updateError ? null : [{ ...FILA_BASE, ...ultimoUpdate }], error: updateError }
          : { data: [FILA_BASE], error: null }
        return Promise.resolve(resultado).then(onFulfilled, onRejected)
      },
    }
    return builder
  })

  return { from, getUltimoUpdate: () => ultimoUpdate }
}

describe('CajaTransfer — toggleChequeado (código real)', () => {
  let originalAlert

  beforeEach(() => {
    vi.clearAllMocks()
    useComplejo.mockReturnValue({ complejoActivo: COMPLEJO })
    originalAlert = window.alert
    window.alert = vi.fn()
  })

  afterEach(() => {
    window.alert = originalAlert
  })

  it('toggle exitoso: el checkbox queda marcado (estado optimista se mantiene), sin alert', async () => {
    const mockSupabase = makeSupabaseMock({ updateError: null })
    supabase.from.mockImplementation(mockSupabase.from)
    const user = userEvent.setup()

    render(<CajaTransfer tabla="caja_banco" titulo="Banco" reservas={[]} />)

    const checkbox = await screen.findByRole('checkbox')
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)

    await waitFor(() => expect(checkbox).toBeChecked())
    expect(mockSupabase.getUltimoUpdate()).toEqual({ chequeado: true })
    expect(window.alert).not.toHaveBeenCalled()
  })

  it('toggle fallido (UPDATE devuelve error): el checkbox vuelve al valor anterior y se avisa con alert()', async () => {
    const mockSupabase = makeSupabaseMock({
      updateError: { message: "Could not find the 'chequeado' column of 'caja_banco' in the schema cache" },
    })
    supabase.from.mockImplementation(mockSupabase.from)
    const user = userEvent.setup()

    render(<CajaTransfer tabla="caja_banco" titulo="Banco" reservas={[]} />)

    const checkbox = await screen.findByRole('checkbox')
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)

    // El update optimista y su reversión ocurren dentro de la misma
    // función async (separados sólo por un await), así que el estado
    // intermedio "marcado" no es confiablemente observable acá — lo
    // que importa es el estado final: vuelve a desmarcarse solo, sin
    // quedar pegado en "marcado" como pasaba antes del fix.
    await waitFor(() => expect(checkbox).not.toBeChecked())
    expect(window.alert).toHaveBeenCalledWith('No se pudo guardar el chequeado. Probá de nuevo.')
  })
})

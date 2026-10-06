// Bug real reportado: en "Datos de la reserva", Lorena suele
// sobreescribir a mano el monto auto-calculado (el que sugiere
// "Precios determinados" según cabaña/bloque/fechas) — por ejemplo, el
// sugerido es $10.000 pero ella tipea $8.000. Si DESPUÉS de eso tilda
// "Aplicar descuento", el monto tipeado a mano se pisaba en silencio
// con el sugerido ($10.000) en vez de mantenerse en lo que ella
// realmente tipeó ($8.000) — guardando un total equivocado.
//
// Root cause real (ReservaForm.jsx, handler de "Aplicar descuento"):
// al tildar el checkbox, la base del descuento (montoBaseDescuento) se
// capturaba como `precioBaseNeto ?? Number(form.monto_total || 0)` —
// SIEMPRE prefiriendo precioBaseNeto (el precio ya resuelto por
// período) por sobre el valor tipeado a mano, porque precioBaseNeto
// nunca se invalida cuando el usuario edita monto_total manualmente
// (sigue viviendo con el valor sugerido viejo). El efecto que resta el
// descuento a montoBaseDescuento corría inmediatamente después y
// pisaba el campo con esa base equivocada — incluso sin haber tipeado
// todavía ningún monto de descuento.
//
// Fix: la captura de montoBaseDescuento ahora respeta `montoModificado`
// (el flag "¿el usuario tipeó un monto a mano?", que YA existía —
// antes sólo se usaba para mostrar el badge "Precio personalizado", no
// para proteger este cálculo) — si está en true, usa el monto tipeado
// tal cual, sin importar si precioBaseNeto ya se resolvió.
// montoModificado se resetea a false al cambiar fecha de
// entrada/salida/pax (código pre-existente, sin cambios) — esos sí
// deben volver a confiar en el precio sugerido, a propósito.
//
// Estos tests mockean `periodos_precios`/`precios_pax` con datos REALES
// (a diferencia de reserva-form-descuento.test.jsx, que los deja vacíos
// a propósito para cubrir el escenario "sin período configurado") —
// necesario para que precioBaseNeto se resuelva de verdad a un número
// distinto del tipeado a mano, que es la única forma de reproducir este
// bug.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ReservaForm from '../../src/pages/ReservaForm'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../src/context/ComplejoContext', () => ({ useComplejo: vi.fn() }))
vi.mock('../../src/lib/email', () => ({
  sendEmailConfirmacion: vi.fn(),
  sendEmailRecibo: vi.fn(),
}))

import { supabase } from '../../src/lib/supabase'
import { useComplejo } from '../../src/context/ComplejoContext'
import { sendEmailConfirmacion } from '../../src/lib/email'

const COMPLEJO_VIP = { id: 'complejo-vip', slug: 'cabanas-vip', nombre: 'Cabañas VIP' }

// Un único período abierto, $5.000/noche para pax=2 (el default —
// form.pax arranca en 1, clamp a safePax=2) — con 2 noches
// (2026-06-01 al 2026-06-03), resuelve a precioBaseNeto = $10.000.
const PERIODO = {
  id: 'periodo-1', nombre: 'Temporada', fecha_inicio: '2026-01-01', fecha_fin: null,
  minimo_noches: 0, orden: 1,
}
const PRECIO_PAX = { periodo_id: 'periodo-1', pax: 2, precio_noche: 5000, precio_semana: null }

function makeSupabaseMock() {
  let ultimoInsertReservas = null

  const from = vi.fn((table) => {
    let esInsert = false
    const builder = {
      select: () => builder,
      eq: () => builder,
      neq: () => builder,
      like: () => builder,
      order: () => builder,
      limit: () => builder,
      lt: () => builder,
      gt: () => builder,
      in: () => builder,
      insert: (payload) => {
        esInsert = true
        if (table === 'reservas') ultimoInsertReservas = payload
        return builder
      },
      single: () => {
        if (table === 'reservas' && esInsert) {
          return Promise.resolve({
            data: ultimoInsertReservas ? { id: 'nueva-reserva-id', ...ultimoInsertReservas } : null,
            error: null,
          })
        }
        return Promise.resolve({ data: null, error: null })
      },
      then: (onFulfilled, onRejected) => {
        let data = []
        if (table === 'periodos_precios') data = [PERIODO]
        if (table === 'precios_pax') data = [PRECIO_PAX]
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected)
      },
    }
    return builder
  })

  return { from, getUltimoInsertReservas: () => ultimoInsertReservas }
}

async function completarDatosBase(user) {
  await waitFor(() => expect(screen.getByTestId('cabana-picker-trigger')).toBeInTheDocument())
  await user.type(screen.getByTestId('input-nombre-apellido'), 'Huésped Precio Manual')
  await user.type(screen.getByTestId('input-email'), 'preciomanual@example.com')
  await user.click(screen.getByTestId('cabana-picker-trigger'))
  await user.click(screen.getByTestId('cabana-picker-row-Cabaña 1'))
  await user.click(screen.getByTestId('cabana-picker-listo'))
  await user.type(screen.getByTestId('input-fecha-entrada'), '2026-06-01')
  await user.type(screen.getByTestId('input-fecha-salida'), '2026-06-03')
}

describe('ReservaForm.jsx — "Aplicar descuento" no pisa un monto_total tipeado a mano (bug real)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useComplejo.mockReturnValue({
      complejoActivo: COMPLEJO_VIP,
      cabanasPorGrupo: [{ grupo: null, cabanas: ['Cabaña 1', 'Cabaña 2'] }],
    })
    supabase.from.mockImplementation(makeSupabaseMock().from)
    sendEmailConfirmacion.mockResolvedValue(new Date().toISOString())
  })

  it('el precio sugerido auto-calcula a $10.000 (confirma que precioBaseNeto SÍ se resolvió, precondición del bug)', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user)

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(10000))
  })

  it('tipear $8.000 a mano y recién DESPUÉS tildar "Aplicar descuento" mantiene el total en $8.000, no lo resetea a $10.000', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user)

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(10000))

    await user.clear(screen.getByTestId('input-monto-total'))
    await user.type(screen.getByTestId('input-monto-total'), '8000')
    expect(screen.getByTestId('input-monto-total')).toHaveValue(8000)

    await user.click(screen.getByText('Aplicar descuento'))

    // El bug real: acá el input volvía a $10.000. Con el fix, se queda
    // en $8.000 — lo que Lorena realmente tipeó.
    expect(screen.getByTestId('input-monto-total')).toHaveValue(8000)
  })

  it('con el total ya pisado a $8.000 a mano, entrar un monto de descuento resta sobre $8.000 (no sobre los $10.000 sugeridos)', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user)

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(10000))
    await user.clear(screen.getByTestId('input-monto-total'))
    await user.type(screen.getByTestId('input-monto-total'), '8000')

    await user.click(screen.getByText('Aplicar descuento'))
    const montoInput = await screen.findByTestId('input-descuento-monto')
    await user.type(montoInput, '2000')

    // 8.000 - 2.000 = 6.000 (base correcta). Con el bug, hubiera dado
    // 10.000 - 2.000 = 8.000 (base equivocada, coincidencia con el
    // valor tipeado que hubiera ocultado el bug si no se chequeara el
    // número exacto).
    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(6000))
  })

  it('se guarda correctamente: $8.000 tipeado a mano, $2.000 de descuento → monto_total $6.000 en el insert', async () => {
    const user = userEvent.setup()
    const mockSupabase = makeSupabaseMock()
    supabase.from.mockImplementation(mockSupabase.from)
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user)

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(10000))
    await user.clear(screen.getByTestId('input-monto-total'))
    await user.type(screen.getByTestId('input-monto-total'), '8000')
    await user.click(screen.getByText('Aplicar descuento'))
    const montoInput = await screen.findByTestId('input-descuento-monto')
    await user.type(montoInput, '2000')
    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(6000))

    await user.click(screen.getByTestId('btn-submit-reserva'))

    await waitFor(() => expect(mockSupabase.getUltimoInsertReservas()).not.toBeNull())
    const inserted = mockSupabase.getUltimoInsertReservas()
    expect(Number(inserted.monto_total)).toBe(6000)
    expect(Number(inserted.descuento_monto)).toBe(2000)
  })

  it('destildar "Aplicar descuento" sin haber tipeado un monto restaura el monto tipeado a mano ($8.000), no el sugerido', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user)

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(10000))
    await user.clear(screen.getByTestId('input-monto-total'))
    await user.type(screen.getByTestId('input-monto-total'), '8000')

    await user.click(screen.getByText('Aplicar descuento'))
    expect(screen.getByTestId('input-monto-total')).toHaveValue(8000)

    await user.click(screen.getByText('Aplicar descuento')) // destilda
    expect(screen.getByTestId('input-monto-total')).toHaveValue(8000)
  })

  it('cambiar la fecha de entrada SÍ debe volver a confiar en el precio sugerido (invalida el monto tipeado a mano, a propósito)', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ReservaForm /></MemoryRouter>)
    await completarDatosBase(user)

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(10000))
    await user.clear(screen.getByTestId('input-monto-total'))
    await user.type(screen.getByTestId('input-monto-total'), '8000')

    // Cambiar fecha de salida (3 noches en vez de 2) resetea
    // montoModificado e invalida el valor tipeado — comportamiento
    // pre-existente, sin cambios, que este test confirma que sigue
    // intacto con el fix de arriba.
    await user.clear(screen.getByTestId('input-fecha-salida'))
    await user.type(screen.getByTestId('input-fecha-salida'), '2026-06-04')

    await waitFor(() => expect(screen.getByTestId('input-monto-total')).toHaveValue(15000))

    await user.click(screen.getByText('Aplicar descuento'))
    // Ahora sí es correcto que tome el sugerido recalculado ($15.000),
    // porque cambiar la fecha invalidó el monto tipeado viejo.
    expect(screen.getByTestId('input-monto-total')).toHaveValue(15000)
  })
})

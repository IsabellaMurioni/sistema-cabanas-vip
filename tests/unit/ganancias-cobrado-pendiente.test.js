// Código real importado de src/pages/Ganancias.jsx — sin mocks, sin DOM.
// "Lo cobrado" / "Lo pendiente" (nuevas SummaryCards junto a "Facturado")
// y las columnas "Cobrado"/"A cobrar" del detalle por reserva usan la
// misma función por fila, cobradoYPendienteDeReserva: cobradoRow SIEMPRE
// capea en monto_total (nunca lo supera, ni con sobrepago por error de
// carga), así que cobradoRow + pendienteRow === monto_total exacto —
// sumado sobre el mismo fReservas que ya usa "Facturado"
// (sumField(fReservas, 'monto_total')), las tres tarjetas reconcilian
// sin resto.
//
// El filtro `.neq('estado', 'Cancelada')` vive en la query real (no es
// una función standalone) — acá se mirror-ea ese único predicado, mismo
// criterio que ya usa tests/unit/ganancias-caja.test.js para la suma
// inline de Ingresos ARS.
import { describe, it, expect } from 'vitest'
import { cobradoYPendienteDeReserva, sumField } from '../../src/pages/Ganancias'

describe('cobradoYPendienteDeReserva (código real)', () => {
  it('una reserva parcialmente pagada reparte correctamente entre cobrado y pendiente', () => {
    const r = { monto_total: 10000, sena1_monto: 3000, sena2_monto: 2000, pago_cabana_monto: 0 }
    const { cobradoRow, pendienteRow } = cobradoYPendienteDeReserva(r)
    expect(cobradoRow).toBe(5000)
    expect(pendienteRow).toBe(5000)
    expect(cobradoRow + pendienteRow).toBe(r.monto_total)
  })

  it('una reserva totalmente pagada da pendiente = 0', () => {
    const r = { monto_total: 10000, sena1_monto: 6000, sena2_monto: 4000, pago_cabana_monto: 0 }
    const { cobradoRow, pendienteRow } = cobradoYPendienteDeReserva(r)
    expect(cobradoRow).toBe(10000)
    expect(pendienteRow).toBe(0)
  })

  it('una reserva Pendiente sin ningún pago cargado cuenta TODO su monto_total como pendiente (igual que "Facturado" ya la cuenta entera hoy, sin importar el estado)', () => {
    const r = { estado: 'Pendiente', monto_total: 8000, sena1_monto: 0, sena2_monto: 0, pago_cabana_monto: 0 }
    const { cobradoRow, pendienteRow } = cobradoYPendienteDeReserva(r)
    expect(cobradoRow).toBe(0)
    expect(pendienteRow).toBe(8000)
  })

  it('sobrepago (señas + pago en cabaña superan monto_total, ej. error de carga): cobradoRow se capea en monto_total, pendienteRow da 0, nunca negativo', () => {
    const r = { monto_total: 5000, sena1_monto: 4000, sena2_monto: 3000, pago_cabana_monto: 0 } // paga 7000 sobre una base de 5000
    const { cobradoRow, pendienteRow } = cobradoYPendienteDeReserva(r)
    expect(cobradoRow).toBe(5000)
    expect(pendienteRow).toBe(0)
    expect(cobradoRow + pendienteRow).toBe(r.monto_total)
  })

  it('una reserva sin monto_total cargado (null) no explota — cobrado y pendiente dan 0', () => {
    const r = { monto_total: null, sena1_monto: null, sena2_monto: null, pago_cabana_monto: null }
    const { cobradoRow, pendienteRow } = cobradoYPendienteDeReserva(r)
    expect(cobradoRow).toBe(0)
    expect(pendienteRow).toBe(0)
  })
})

describe('"Lo cobrado" / "Lo pendiente" — suma sobre fReservas, reconcilia con "Facturado" (código real)', () => {
  // Mismo fReservas que alimentaría "Facturado": ya pasado por
  // .neq('estado','Cancelada') (acá, un .filter mirror-eando ese único
  // predicado de la query real — ver comentario de arriba).
  const reservasCrudas = [
    { id: 'r1', estado: 'Pendiente',  monto_total: 10000, sena1_monto: 3000, sena2_monto: 2000, pago_cabana_monto: 0 }, // cobrado 5000, pendiente 5000
    { id: 'r2', estado: 'Confirmada', monto_total: 6000,  sena1_monto: 6000, sena2_monto: 0,    pago_cabana_monto: 0 }, // cobrado 6000, pendiente 0
    { id: 'r3', estado: 'Finalizada', monto_total: 4000,  sena1_monto: 4000, sena2_monto: 1000, pago_cabana_monto: 0 }, // sobrepago -> cobrado 4000, pendiente 0
    { id: 'r4', estado: 'Cancelada',  monto_total: 99999, sena1_monto: 0,    sena2_monto: 0,    pago_cabana_monto: 0 }, // debe quedar afuera
  ]
  const fReservas = reservasCrudas.filter((r) => r.estado !== 'Cancelada')

  it('la reserva Cancelada queda afuera de fReservas — 3 reservas, no 4', () => {
    expect(fReservas).toHaveLength(3)
    expect(fReservas.find((r) => r.id === 'r4')).toBeUndefined()
  })

  it('"Lo cobrado" y "Lo pendiente" (sumadas sobre fReservas) reconcilian exacto con "Facturado" (sumField(fReservas, "monto_total"))', () => {
    const reservasIncome    = sumField(fReservas, 'monto_total')
    const reservasCobrado   = fReservas.reduce((s, r) => s + cobradoYPendienteDeReserva(r).cobradoRow, 0)
    const reservasPendiente = fReservas.reduce((s, r) => s + cobradoYPendienteDeReserva(r).pendienteRow, 0)

    expect(reservasIncome).toBe(20000) // 10000 + 6000 + 4000, la Cancelada (99999) no suma
    expect(reservasCobrado).toBe(15000) // 5000 + 6000 + 4000
    expect(reservasPendiente).toBe(5000) // 5000 + 0 + 0
    expect(reservasCobrado + reservasPendiente).toBe(reservasIncome)
  })

  it('si la Cancelada se incluyera por error, el total NO reconciliaría — confirma que el filtro realmente importa', () => {
    const reservasIncomeConCancelada = sumField(reservasCrudas, 'monto_total')
    const reservasCobradoFiltrado    = fReservas.reduce((s, r) => s + cobradoYPendienteDeReserva(r).cobradoRow, 0)
    const reservasPendienteFiltrado  = fReservas.reduce((s, r) => s + cobradoYPendienteDeReserva(r).pendienteRow, 0)

    expect(reservasIncomeConCancelada).not.toBe(reservasCobradoFiltrado + reservasPendienteFiltrado)
  })
})

// Código real importado — sin mocks, sin DB. Ya no hay reimplementaciones
// [MIRROR]: validarMontoMovimiento/cumpleMontoMinimoVip/excedeSaldoReserva
// son las funciones que los handlers reales (submitMov en
// CajaTemporada.jsx, handleSubmit en ReservaForm.jsx/ReservaPago.jsx)
// llaman directamente — ver src/pages/CajaTemporada.jsx,
// src/pages/Caja.jsx y src/lib/pagosReserva.js.
import { describe, it, expect } from 'vitest'
import { validarMontoMovimiento } from '../../src/pages/CajaTemporada'
import { MONTO_MINIMO_VIP, cumpleMontoMinimoVip } from '../../src/pages/Caja'
import { totalPagadoReserva, excedeSaldoReserva } from '../../src/lib/pagosReserva'

describe('validarMontoMovimiento — $0/monto negativo, CajaTemporada (código real)', () => {
  it('los 3 campos en 0 → inválido', () => {
    expect(validarMontoMovimiento('ingreso', 0, 0, 0).valido).toBe(false)
  })
  it('un solo campo con algo > 0 → válido', () => {
    expect(validarMontoMovimiento('ingreso', 0, 0.01, 0).valido).toBe(true)
  })
  it('egreso no considera "otros" aunque venga cargado', () => {
    const r = validarMontoMovimiento('egreso', 0, 0, 500)
    expect(r.valido).toBe(false)
    expect(r.montoOtros).toBe(0)
  })
  it('suma de negativo y positivo que da exactamente 0 → inválido', () => {
    expect(validarMontoMovimiento('ingreso', 100, -100, 0).valido).toBe(false)
  })
  it('devuelve el total y montoOtros ya calculados, para que el caller no los recalcule', () => {
    const r = validarMontoMovimiento('ingreso', 100, 50, 25)
    expect(r).toEqual({ valido: true, total: 175, montoOtros: 25 })
  })
})

describe('cumpleMontoMinimoVip — $0/monto negativo, VIP (código real)', () => {
  it('0 → inválido', () => { expect(cumpleMontoMinimoVip(0)).toBe(false) })
  it(`${MONTO_MINIMO_VIP} (el mínimo exacto de la app) → válido`, () => {
    expect(cumpleMontoMinimoVip(MONTO_MINIMO_VIP)).toBe(true)
  })
  it('negativo → inválido', () => { expect(cumpleMontoMinimoVip(-5)).toBe(false) })
})

describe('totalPagadoReserva / excedeSaldoReserva — sobrepago (código real, compartido)', () => {
  it('totalPagadoReserva suma sena1+sena2+pago_cabana', () => {
    expect(totalPagadoReserva(3000, 2000, 500)).toBe(5500)
  })
  it('totalPagadoReserva ignora campos vacíos/undefined', () => {
    expect(totalPagadoReserva('', undefined, 100)).toBe(100)
  })

  it('total pagado por debajo del precio → permitido', () => {
    expect(excedeSaldoReserva(10000, totalPagadoReserva(3000, 2000, 0))).toBe(false)
  })
  it('total pagado excede el precio → bloqueado', () => {
    expect(excedeSaldoReserva(10000, totalPagadoReserva(6000, 5000, 0))).toBe(true)
  })
  it('total pagado exactamente igual al precio → permitido (no excede)', () => {
    expect(excedeSaldoReserva(10000, totalPagadoReserva(5000, 5000, 0))).toBe(false)
  })
  it('precio en $0/sin cargar → nunca bloquea (nada contra qué comparar)', () => {
    expect(excedeSaldoReserva(0, 999999)).toBe(false)
  })
  it('pago_cabana solo también cuenta para el total combinado (ReservaForm)', () => {
    expect(excedeSaldoReserva(1000, totalPagadoReserva(0, 0, 1500))).toBe(true)
  })

  it('ReservaPago: nuevo pago que no excede el saldo → permitido', () => {
    expect(excedeSaldoReserva(10000, 4000 + 5000)).toBe(false)
  })
  it('ReservaPago: nuevo pago que excede el saldo restante → bloqueado', () => {
    expect(excedeSaldoReserva(10000, 8000 + 3000)).toBe(true)
  })
  it('ReservaPago: nuevo pago que completa el saldo exacto → permitido', () => {
    expect(excedeSaldoReserva(10000, 6000 + 4000)).toBe(false)
  })
})

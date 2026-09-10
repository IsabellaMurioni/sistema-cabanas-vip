// Código real importado de src/pages/CajaTemporada.jsx — sin mocks, sin
// DB. resumenMovimientos ES la función real (compartida por el resumen
// en vivo y por recapPorRango, que sólo le agrega el filtro de fechas)
// que calcula Préstamos/Ventas/Ingreso Total/Devoluciones/Gastos/
// Retiros/Ganancia para complejos NO-VIP.
import { describe, it, expect } from 'vitest'
import { num, pesos, rowTotal, resumenMovimientos, recapPorRango, addDaysISO, monthRange } from '../../src/pages/CajaTemporada'

describe('recapPorRango — Préstamos/Ventas/Ingreso Total/Devoluciones/Gastos/Retiros/Ganancia (código real)', () => {
  const movimientos = [
    { fecha: '2026-08-01', tipo: 'ingreso',    monto_depositos: 1000, monto_efectivo: 0,   monto_otros: 0 },
    { fecha: '2026-08-05', tipo: 'ingreso',    monto_depositos: 0,    monto_efectivo: 500, monto_otros: 0 },
    { fecha: '2026-08-10', tipo: 'prestamo',   monto_depositos: 200,  monto_efectivo: 0,   monto_otros: 0 },
    { fecha: '2026-08-15', tipo: 'devolucion', monto_depositos: 0,    monto_efectivo: 100, monto_otros: 0 },
    { fecha: '2026-08-18', tipo: 'retiro',     monto_depositos: 0,    monto_efectivo: 250, monto_otros: 0 },
    { fecha: '2026-08-20', tipo: 'egreso',     monto_depositos: 0,    monto_efectivo: 300, monto_otros: 0 },
    { fecha: '2026-09-01', tipo: 'ingreso',    monto_depositos: 9999, monto_efectivo: 0,   monto_otros: 0 }, // fuera de rango
  ]

  it('calcula los 7 totales correctamente para un rango que cubre agosto', () => {
    const r = recapPorRango(movimientos, '2026-08-01', '2026-08-31')
    expect(r.ventas).toBe(1500)        // 1000 + 500
    expect(r.prestamos).toBe(200)
    expect(r.ingresoTotal).toBe(1700)  // ventas + préstamos
    expect(r.devoluciones).toBe(100)
    expect(r.gastos).toBe(300)
    expect(r.retiros).toBe(250)
    expect(r.ganancia).toBe(1200)      // ventas - gastos, nada más (préstamo/devolución/retiro afuera — ver comentario en resumenMovimientos)
  })

  it('BUG REAL corregido: préstamo/devolución/retiro NO afectan la ganancia — antes sí (la fórmula vieja daba 1300, contaminada por -devoluciones y +préstamos)', () => {
    const r = recapPorRango(movimientos, '2026-08-01', '2026-08-31')
    expect(r.ganancia).toBe(r.ventas - r.gastos)
    expect(r.ganancia).not.toBe(r.ingresoTotal - r.devoluciones - r.gastos) // la cuenta vieja, ya no vive en ningún lado
  })

  it('excluye movimientos fuera del rango de fechas', () => {
    const r = recapPorRango(movimientos, '2026-08-01', '2026-08-31')
    expect(r.ventas).not.toBe(1500 + 9999)
  })

  it('rango sin movimientos → los 7 totales en 0', () => {
    const r = recapPorRango(movimientos, '2020-01-01', '2020-01-31')
    expect(r).toEqual({ prestamos: 0, ventas: 0, ingresoTotal: 0, devoluciones: 0, gastos: 0, retiros: 0, ganancia: 0 })
  })

  it('sólo gastos en el rango → ganancia negativa', () => {
    const soloGastos = [{ fecha: '2026-08-01', tipo: 'egreso', monto_depositos: 0, monto_efectivo: 400, monto_otros: 0 }]
    expect(recapPorRango(soloGastos, '2026-08-01', '2026-08-31').ganancia).toBe(-400)
  })

  it('sólo ingresos en el rango → ganancia = ingreso total', () => {
    const soloIngresos = [{ fecha: '2026-08-01', tipo: 'ingreso', monto_depositos: 800, monto_efectivo: 0, monto_otros: 0 }]
    expect(recapPorRango(soloIngresos, '2026-08-01', '2026-08-31').ganancia).toBe(800)
  })

  it('fecha_desde/fecha_hasta faltantes → null (no explota)', () => {
    expect(recapPorRango(movimientos, '', '2026-08-31')).toBeNull()
    expect(recapPorRango(movimientos, '2026-08-01', '')).toBeNull()
  })

  it('los límites del rango son inclusivos', () => {
    const bordes = [
      { fecha: '2026-08-01', tipo: 'ingreso', monto_depositos: 10, monto_efectivo: 0, monto_otros: 0 },
      { fecha: '2026-08-31', tipo: 'ingreso', monto_depositos: 20, monto_efectivo: 0, monto_otros: 0 },
    ]
    expect(recapPorRango(bordes, '2026-08-01', '2026-08-31').ventas).toBe(30)
  })
})

describe('resumenMovimientos (código real) — la función compartida detrás de recapPorRango y del resumen en vivo', () => {
  it('no filtra nada — agrega exactamente lo que se le pasa, sin importar la fecha', () => {
    const mixto = [
      { fecha: '2020-01-01', tipo: 'ingreso',    monto_depositos: 100, monto_efectivo: 0, monto_otros: 0 },
      { fecha: '2099-12-31', tipo: 'egreso',     monto_depositos: 0,   monto_efectivo: 40, monto_otros: 0 },
      { fecha: '2026-08-10', tipo: 'prestamo',   monto_depositos: 500, monto_efectivo: 0,  monto_otros: 0 },
      { fecha: '2026-08-10', tipo: 'devolucion', monto_depositos: 0,   monto_efectivo: 30, monto_otros: 0 },
      { fecha: '2026-08-10', tipo: 'retiro',     monto_depositos: 0,   monto_efectivo: 60, monto_otros: 0 },
    ]
    const r = resumenMovimientos(mixto)
    expect(r.ventas).toBe(100)
    expect(r.gastos).toBe(40)
    expect(r.prestamos).toBe(500)
    expect(r.devoluciones).toBe(30)
    expect(r.retiros).toBe(60)
    expect(r.ingresoTotal).toBe(600)  // ventas + préstamos
    expect(r.ganancia).toBe(60)       // ventas - gastos, ninguno de los otros 3 tipos entra
  })

  it('lista vacía → los 7 totales en 0, no explota', () => {
    expect(resumenMovimientos([])).toEqual({
      prestamos: 0, ventas: 0, ingresoTotal: 0, devoluciones: 0, gastos: 0, retiros: 0, ganancia: 0,
    })
  })
})

describe('rowTotal / num / pesos (código real)', () => {
  it('rowTotal suma los 3 buckets', () => {
    expect(rowTotal({ monto_depositos: 10, monto_efectivo: 20, monto_otros: 30 })).toBe(60)
  })
  it('num convierte vacío/NaN a 0', () => {
    expect(num('')).toBe(0)
    expect(num(undefined)).toBe(0)
    expect(num('abc')).toBe(0)
    expect(num('42')).toBe(42)
  })
  it('pesos formatea con separador de miles', () => {
    expect(pesos(1234567)).toContain('1.234.567')
    expect(pesos(0)).toBe('$0')
  })
})

describe('addDaysISO / monthRange (código real)', () => {
  it('addDaysISO suma días respetando fin de mes', () => {
    expect(addDaysISO('2026-08-31', 1)).toBe('2026-09-01')
  })
  it('addDaysISO respeta fin de año', () => {
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('monthRange devuelve el primer y último día del mes (0-indexado)', () => {
    expect(monthRange(7, 2026)).toEqual({ fecha_desde: '2026-08-01', fecha_hasta: '2026-08-31' })
  })
  it('monthRange respeta años bisiestos', () => {
    expect(monthRange(1, 2026)).toEqual({ fecha_desde: '2026-02-01', fecha_hasta: '2026-02-28' }) // no bisiesto
    expect(monthRange(1, 2028)).toEqual({ fecha_desde: '2028-02-01', fecha_hasta: '2028-02-29' }) // bisiesto
  })
})

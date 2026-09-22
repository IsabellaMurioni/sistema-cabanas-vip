// Código real importado de src/pages/Reservas.jsx. Antes, la tarjeta
// "[Mes] — facturado" filtraba por `r.mes` (un nombre de mes guardado
// como string en cada reserva, SIN año) contra el mes calendario actual
// — sin selector, y mezclando reservas de años distintos que caen en el
// mismo nombre de mes. facturadoEnRango la reemplaza con un filtro real
// sobre `fecha_entrada` (fecha ISO) contra un rango desde/hasta
// arbitrario. Estos tests prueban específicamente los dos bugs que tenía
// el cálculo viejo: (1) no distinguía años, (2) no podía cruzar meses.
import { describe, it, expect } from 'vitest'
import { facturadoEnRango, montoOGuion } from '../../src/pages/Reservas'

describe('facturadoEnRango (código real) — reemplaza el filtro por r.mes de la tarjeta "facturado"', () => {
  it('suma sólo las reservas cuya fecha_entrada cae dentro del rango', () => {
    const reservas = [
      { fecha_entrada: '2026-03-01', monto_total: 1000 },
      { fecha_entrada: '2026-03-15', monto_total: 500 },
      { fecha_entrada: '2026-04-01', monto_total: 9999 }, // fuera de rango
    ]
    expect(facturadoEnRango(reservas, '2026-03-01', '2026-03-31')).toBe(1500)
  })

  it('bug viejo #1 — dos años distintos con el mismo mes NO se mezclan (el viejo r.mes === mesAct sí lo hacía)', () => {
    const reservas = [
      { fecha_entrada: '2025-09-10', monto_total: 5000 }, // septiembre 2025
      { fecha_entrada: '2026-09-10', monto_total: 700 },  // septiembre 2026
    ]
    // Rango acotado a septiembre 2026 → sólo debe contar la de 2026
    expect(facturadoEnRango(reservas, '2026-09-01', '2026-09-30')).toBe(700)
    // Rango acotado a septiembre 2025 → sólo debe contar la de 2025
    expect(facturadoEnRango(reservas, '2025-09-01', '2025-09-30')).toBe(5000)
  })

  it('bug viejo #2 — un rango puede cruzar varios meses (el viejo filtro estaba fijo a "el mes actual")', () => {
    const reservas = [
      { fecha_entrada: '2026-03-05', monto_total: 100 },
      { fecha_entrada: '2026-06-20', monto_total: 200 },
      { fecha_entrada: '2026-09-21', monto_total: 300 },
      { fecha_entrada: '2026-10-01', monto_total: 9999 }, // fuera de rango
    ]
    expect(facturadoEnRango(reservas, '2026-03-01', '2026-09-21')).toBe(600)
  })

  it('incluye los bordes del rango (inclusive)', () => {
    const reservas = [
      { fecha_entrada: '2026-03-01', monto_total: 10 },
      { fecha_entrada: '2026-09-21', monto_total: 20 },
    ]
    expect(facturadoEnRango(reservas, '2026-03-01', '2026-09-21')).toBe(30)
  })

  it('sin reservas en el rango → 0, no explota', () => {
    expect(facturadoEnRango([], '2026-01-01', '2026-12-31')).toBe(0)
  })

  it('reserva sin fecha_entrada → se ignora, no rompe la suma', () => {
    const reservas = [
      { fecha_entrada: null, monto_total: 500 },
      { fecha_entrada: '2026-03-10', monto_total: 100 },
    ]
    expect(facturadoEnRango(reservas, '2026-01-01', '2026-12-31')).toBe(100)
  })

  it('monto_total null/undefined cuenta como 0, no como NaN', () => {
    const reservas = [
      { fecha_entrada: '2026-03-10', monto_total: null },
      { fecha_entrada: '2026-03-11', monto_total: undefined },
      { fecha_entrada: '2026-03-12', monto_total: 50 },
    ]
    expect(facturadoEnRango(reservas, '2026-01-01', '2026-12-31')).toBe(50)
  })
})

// La tabla de Reservas.jsx (columnas Total/Saldo) usaba un chequeo
// "truthy" (`r.monto_total ? ... : '-'`), que trataba 0 igual que
// null/undefined/'' — una reserva a $0 mostraba "-", indistinguible de
// una sin precio cargado. montoOGuion la reemplaza distinguiendo
// explícitamente "sin precio" (null/undefined/'') de "precio $0" —
// mismo criterio que ars() en Ganancias.jsx y money() en
// ReservaDetalle.jsx.
describe('montoOGuion (código real) — Total/Saldo de la tabla de Reservas', () => {
  it('0 se muestra como "$0", no como "-" (el bug real reportado)', () => {
    expect(montoOGuion(0)).toBe('$0')
  })
  it('un monto positivo se formatea con separador de miles es-AR', () => {
    expect(montoOGuion(1234567)).toBe('$1.234.567')
  })
  it('null/undefined/\'\' (sin precio cargado) se muestran como "-"', () => {
    expect(montoOGuion(null)).toBe('-')
    expect(montoOGuion(undefined)).toBe('-')
    expect(montoOGuion('')).toBe('-')
  })
})

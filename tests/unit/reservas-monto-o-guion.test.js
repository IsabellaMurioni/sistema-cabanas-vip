// Código real importado de src/pages/Reservas.jsx.
//
// La tabla de Reservas.jsx (columnas Total/Saldo) usaba un chequeo
// "truthy" (`r.monto_total ? ... : '-'`), que trataba 0 igual que
// null/undefined/'' — una reserva a $0 mostraba "-", indistinguible de
// una sin precio cargado. montoOGuion la reemplaza distinguiendo
// explícitamente "sin precio" (null/undefined/'') de "precio $0" —
// mismo criterio que ars() en Ganancias.jsx y money() en
// ReservaDetalle.jsx.
import { describe, it, expect } from 'vitest'
import { montoOGuion } from '../../src/pages/Reservas'

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

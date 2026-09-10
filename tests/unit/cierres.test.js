// Código real importado de src/lib/cierres.js — sin mocks, sin DB.
import { describe, it, expect } from 'vitest'
import { rangosSolapan, cierreQueContiene, labelCierre } from '../../src/lib/cierres'

describe('rangosSolapan — detección de superposición de rangos de fecha (código real)', () => {
  it('rangos idénticos se superponen', () => {
    expect(rangosSolapan('2026-01-01', '2026-01-31', '2026-01-01', '2026-01-31')).toBe(true)
  })

  it('superposición parcial (el nuevo empieza adentro del viejo)', () => {
    expect(rangosSolapan('2026-01-15', '2026-02-15', '2026-01-01', '2026-01-31')).toBe(true)
  })

  it('uno contiene completamente al otro', () => {
    expect(rangosSolapan('2026-01-10', '2026-01-20', '2026-01-01', '2026-01-31')).toBe(true)
    expect(rangosSolapan('2026-01-01', '2026-01-31', '2026-01-10', '2026-01-20')).toBe(true)
  })

  it('un día entero de diferencia entre el fin de uno y el inicio del otro → no superponen', () => {
    expect(rangosSolapan('2026-01-01', '2026-01-31', '2026-02-01', '2026-02-28')).toBe(false)
  })

  it('comparten exactamente un día de borde → sí superponen (fecha_hasta inclusiva)', () => {
    expect(rangosSolapan('2026-01-01', '2026-01-31', '2026-01-31', '2026-02-28')).toBe(true)
  })

  it('completamente disjuntos, lejos uno del otro', () => {
    expect(rangosSolapan('2026-01-01', '2026-01-31', '2027-01-01', '2027-01-31')).toBe(false)
  })

  it('es simétrico: da lo mismo el orden de los argumentos', () => {
    expect(rangosSolapan('2026-01-15', '2026-02-15', '2026-01-01', '2026-01-31'))
      .toBe(rangosSolapan('2026-01-01', '2026-01-31', '2026-01-15', '2026-02-15'))
  })
})

describe('cierreQueContiene — candado de fecha ya cerrada (código real)', () => {
  const cierres = [
    { fecha_desde: '2026-01-01', fecha_hasta: '2026-01-31', nombre: 'Enero 2026' },
    { fecha_desde: '2026-03-01', fecha_hasta: '2026-03-31', nombre: null },
  ]

  it('fecha adentro de un cierre → lo devuelve', () => {
    expect(cierreQueContiene(cierres, '2026-01-15')).toEqual(cierres[0])
  })

  it('fecha en el borde exacto (fecha_desde o fecha_hasta) → inclusivo', () => {
    expect(cierreQueContiene(cierres, '2026-01-01')).toEqual(cierres[0])
    expect(cierreQueContiene(cierres, '2026-01-31')).toEqual(cierres[0])
  })

  it('fecha entre dos cierres, sin caer en ninguno → null', () => {
    expect(cierreQueContiene(cierres, '2026-02-15')).toBeNull()
  })

  it('sin fecha → null, no explota', () => {
    expect(cierreQueContiene(cierres, '')).toBeNull()
    expect(cierreQueContiene(cierres, null)).toBeNull()
  })

  it('lista de cierres vacía → siempre null', () => {
    expect(cierreQueContiene([], '2026-01-15')).toBeNull()
  })
})

describe('labelCierre (código real)', () => {
  it('usa el nombre si está cargado', () => {
    expect(labelCierre({ nombre: 'Temporada 2026-27', fecha_desde: '2026-01-01', fecha_hasta: '2026-12-31' }))
      .toBe('Temporada 2026-27')
  })

  it('cae al rango de fechas si no hay nombre', () => {
    expect(labelCierre({ nombre: null, fecha_desde: '2026-01-01', fecha_hasta: '2026-01-31' }))
      .toBe('2026-01-01 – 2026-01-31')
  })

  it('cierre null/undefined → string vacío', () => {
    expect(labelCierre(null)).toBe('')
  })
})

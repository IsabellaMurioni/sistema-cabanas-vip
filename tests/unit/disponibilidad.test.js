// Código real importado de src/pages/Disponibilidad.jsx — sin mocks,
// sin DOM. La banda de meses (MonthHeaders) y el color por celda de
// día (DayHeaders/TimelineRow) son sólo JSX fino sobre estas dos
// funciones puras — lo que hay que probar es la lógica real de
// agrupación/color, no re-renderizar el componente.
import { describe, it, expect } from 'vitest'
import { MESES_COLOR, colorDelMes, agruparDiasPorMes } from '../../src/pages/Disponibilidad'

describe('MESES_COLOR / colorDelMes (código real)', () => {
  it('tiene exactamente 12 colores, uno por mes', () => {
    expect(MESES_COLOR).toHaveLength(12)
  })

  it('cada color es un hex válido y distinto de los demás (12 colores únicos)', () => {
    MESES_COLOR.forEach((c) => expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/))
    expect(new Set(MESES_COLOR).size).toBe(12)
  })

  it('el mismo índice de mes siempre devuelve el mismo color (no aleatorio)', () => {
    expect(colorDelMes(8)).toBe(colorDelMes(8))
    expect(colorDelMes(8)).toBe(MESES_COLOR[8])
  })

  it('meses distintos tienen colores distintos', () => {
    expect(colorDelMes(0)).not.toBe(colorDelMes(1))
  })

  it('se normaliza si el índice viene fuera de [0,11] (no debería pasar en la práctica, pero no explota)', () => {
    expect(colorDelMes(12)).toBe(MESES_COLOR[0])
    expect(colorDelMes(-1)).toBe(MESES_COLOR[11])
  })
})

describe('agruparDiasPorMes (código real)', () => {
  it('un rango dentro de un solo mes da un único tramo con todos los días', () => {
    const tramos = agruparDiasPorMes(new Date(2026, 8, 5), 10) // 5 al 14 de septiembre 2026
    expect(tramos).toHaveLength(1)
    expect(tramos[0]).toMatchObject({ mes: 8, anio: 2026, dias: 10 })
    expect(tramos[0].label).toBe('septiembre 2026')
  })

  it('un rango que cruza un mes se parte en dos tramos, con la cantidad de días correcta en cada uno', () => {
    // 28/09 al 03/10/2026 → 3 días en septiembre + 3 en octubre
    const tramos = agruparDiasPorMes(new Date(2026, 8, 28), 6)
    expect(tramos).toHaveLength(2)
    expect(tramos[0]).toMatchObject({ mes: 8, anio: 2026, dias: 3, label: 'septiembre 2026' })
    expect(tramos[1]).toMatchObject({ mes: 9, anio: 2026, dias: 3, label: 'octubre 2026' })
  })

  it('un rango que cruza un año (diciembre → enero) queda en tramos separados por año, no sólo por mes', () => {
    const tramos = agruparDiasPorMes(new Date(2026, 11, 30), 4) // 30/12/2026 al 02/01/2027
    expect(tramos).toHaveLength(2)
    expect(tramos[0]).toMatchObject({ mes: 11, anio: 2026, dias: 2, label: 'diciembre 2026' })
    expect(tramos[1]).toMatchObject({ mes: 0, anio: 2027, dias: 2, label: 'enero 2027' })
  })

  it('un rango que cruza varios meses genera un tramo por cada uno, en orden', () => {
    // 30/01 al 02/04/2026 → fin de enero, todo febrero, todo marzo, principio de abril
    const tramos = agruparDiasPorMes(new Date(2026, 0, 30), 63)
    const meses = tramos.map((t) => t.mes)
    expect(meses).toEqual([0, 1, 2, 3])
    const totalDias = tramos.reduce((s, t) => s + t.dias, 0)
    expect(totalDias).toBe(63)
  })

  it('numDays=1 da un único tramo de 1 día', () => {
    const tramos = agruparDiasPorMes(new Date(2026, 5, 15), 1)
    expect(tramos).toEqual([{ mes: 5, anio: 2026, dias: 1, label: 'junio 2026' }])
  })

  it('numDays=0 no da ningún tramo, no explota', () => {
    expect(agruparDiasPorMes(new Date(2026, 5, 15), 0)).toEqual([])
  })
})

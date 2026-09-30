// Option A del diseño aprobado: letra inicial de mes arriba del número
// de día en los encabezados de columna del calendario, para distinguir
// a qué mes pertenece cada columna sin mirar la banda de mes. DayHeaders
// es el único lugar donde se renderiza esto — lo comparten "Ver todas"
// y "Ver por cabaña" (mismo componente, dos <DayHeaders> en
// Disponibilidad.jsx) — así que probarlo acá cubre ambas vistas.
//
// Este test renderiza el componente real (exportado además del
// default) — no reimplementa el JSX ni la lógica de color.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DayHeaders, MonthBoundaryLines } from '../../src/pages/Disponibilidad'

describe('DayHeaders — letra inicial de mes (código real, compartido por "Ver todas" y "Ver por cabaña")', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('un rango que cruza septiembre→octubre muestra "S" en las columnas de septiembre y "O" en las de octubre', () => {
    // 28/09 al 03/10/2026 → 3 días en septiembre + 3 en octubre (mismo
    // rango que ya usa el test real de agruparDiasPorMes para el
    // mismo cruce de mes).
    render(<DayHeaders startDate={new Date(2026, 8, 28)} numDays={6} />)

    const letras = screen.getAllByTestId('dia-inicial-mes').map((el) => el.textContent)
    expect(letras).toEqual(['S', 'S', 'S', 'O', 'O', 'O'])
  })

  it('un rango dentro de un único mes muestra la misma letra en todas las columnas', () => {
    render(<DayHeaders startDate={new Date(2026, 5, 10)} numDays={5} />) // 10-14 de junio

    const letras = screen.getAllByTestId('dia-inicial-mes').map((el) => el.textContent)
    expect(letras).toEqual(['J', 'J', 'J', 'J', 'J']) // junio
  })

  it('la columna de "hoy" usa el color de acento (#fb923c), el resto el tono apagado (#888) — mismo criterio que ya usa la etiqueta de día de semana', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 25)) // 25 de septiembre 2026 = "hoy"

    render(<DayHeaders startDate={new Date(2026, 8, 23)} numDays={5} />) // 23-27 sep, "hoy" es la 3ra columna (índice 2)

    const celdas = screen.getAllByTestId('dia-inicial-mes')
    celdas.forEach((celda, i) => {
      expect(celda.style.color).toBe(i === 2 ? 'rgb(251, 146, 60)' : 'rgb(136, 136, 136)')
    })
  })
})

describe('MonthBoundaryLines — línea violeta en el límite entre meses (código real, compartido por "Ver todas" y "Ver por cabaña")', () => {
  it('un rango que cruza septiembre→octubre dibuja una sola línea, justo en el primer día de octubre', () => {
    // 28/09 al 03/10/2026 → 3 días en septiembre + 3 en octubre, mismo
    // rango que ya usan los tests de agruparDiasPorMes/inicialDeMes para
    // este cruce de mes. El límite cae en el día de índice 3 (el 1° de
    // octubre, 4ta columna).
    render(<MonthBoundaryLines startDate={new Date(2026, 8, 28)} numDays={6} />)

    const lineas = screen.getAllByTestId('linea-limite-mes')
    expect(lineas).toHaveLength(1)
    expect(lineas[0].style.left).toBe(`${3 * 38}px`)
  })

  it('un rango que cruza varios meses dibuja una línea por cada límite real, en las columnas correctas', () => {
    // 30/01 al 02/04/2026 → fin de enero (2 días) + febrero completo (28) +
    // marzo completo (31) + principio de abril (2) = 4 tramos, 3 límites.
    render(<MonthBoundaryLines startDate={new Date(2026, 0, 30)} numDays={63} />)

    const lineas = screen.getAllByTestId('linea-limite-mes')
    expect(lineas).toHaveLength(3)
    const izquierdas = lineas.map((l) => l.style.left)
    expect(izquierdas).toEqual([`${2 * 38}px`, `${30 * 38}px`, `${61 * 38}px`])
  })

  it('un rango dentro de un único mes no dibuja ninguna línea', () => {
    render(<MonthBoundaryLines startDate={new Date(2026, 5, 10)} numDays={5} />) // 10-14 de junio

    expect(screen.queryAllByTestId('linea-limite-mes')).toHaveLength(0)
  })

  it('no dibuja una línea en la primera columna del rango, aunque esa columna sea el día 1 de un mes', () => {
    // El rango empieza el 1° de octubre (día 1 de un mes) y cruza a
    // noviembre — sólo debe haber línea en el límite real (1° de
    // noviembre, columna 31), no también en la columna 0 sólo porque
    // también es día 1 de mes.
    render(<MonthBoundaryLines startDate={new Date(2026, 9, 1)} numDays={36} />) // oct completo (31) + 5 de nov

    const lineas = screen.getAllByTestId('linea-limite-mes')
    expect(lineas).toHaveLength(1)
    expect(lineas[0].style.left).toBe(`${31 * 38}px`)
  })
})

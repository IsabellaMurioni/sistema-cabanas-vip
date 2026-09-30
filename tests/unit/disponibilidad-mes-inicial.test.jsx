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
import { DayHeaders } from '../../src/pages/Disponibilidad'

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

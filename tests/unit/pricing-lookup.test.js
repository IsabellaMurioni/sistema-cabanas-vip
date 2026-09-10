// Código real importado de src/pages/ReservaForm.jsx — sin mocks, sin
// DB. resolverPeriodoEntrada/resolverPrecioReserva son las funciones
// que el useEffect de auto-cálculo de precio llama directamente, una
// vez que ya tiene periodos_precios/precios_pax cargados.
//
// IMPORTANTE (ver el comentario real en ReservaForm.jsx): resolverPrecioReserva
// espera que `preciosPax` venga YA filtrado al pax buscado — igual que
// la query real (`.eq('pax', safePax)`). Por eso `preciosParaPax(...)`
// más abajo simula exactamente ese filtro antes de cada llamada, en
// vez de pasar un catálogo con varios pax mezclados.
import { describe, it, expect } from 'vitest'
import { resolverPeriodoEntrada, resolverPrecioReserva } from '../../src/pages/ReservaForm'

const periodoBaja = { id: 'baja', nombre: 'Baja', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-01', minimo_noches: 1 }
const periodoAlta = { id: 'alta', nombre: 'Alta', fecha_inicio: '2026-12-01', fecha_fin: null, minimo_noches: 3 } // abierto ("en adelante")

// "Catálogo" completo, como si fuera toda la tabla precios_pax — cada
// test filtra por el pax que corresponde antes de llamar a la función,
// tal como hace la query real.
const catalogo = [
  { periodo_id: 'baja', pax: 2, precio_noche: 10000, precio_semana: 60000 },
  { periodo_id: 'baja', pax: 4, precio_noche: 15000, precio_semana: 90000 },
  { periodo_id: 'baja', pax: 7, precio_noche: 30000, precio_semana: 0 },
  { periodo_id: 'alta', pax: 2, precio_noche: 20000, precio_semana: 0 }, // sin precio semana cargado
  { periodo_id: 'alta', pax: 4, precio_noche: 25000, precio_semana: 150000 },
]
const preciosParaPax = (pax) => catalogo.filter((r) => r.pax === pax)

describe('resolverPeriodoEntrada — matching por rango de fecha (código real)', () => {
  it('fecha_inicio inclusivo', () => {
    expect(resolverPeriodoEntrada([periodoBaja], '2026-01-01')?.id).toBe('baja')
  })
  it('fecha_fin exclusivo — el día del fin ya pertenece al período siguiente', () => {
    expect(resolverPeriodoEntrada([periodoBaja, periodoAlta], '2026-12-01')?.id).toBe('alta')
  })
  it('fecha_fin = null → período abierto ("en adelante"), cualquier fecha futura matchea', () => {
    expect(resolverPeriodoEntrada([periodoAlta], '2030-01-01')?.id).toBe('alta')
  })
  it('sin período que cubra la fecha → null', () => {
    expect(resolverPeriodoEntrada([periodoBaja], '2020-01-01')).toBeNull()
  })
  it('lista de períodos vacía/null → null, no explota', () => {
    expect(resolverPeriodoEntrada([], '2026-01-01')).toBeNull()
    expect(resolverPeriodoEntrada(null, '2026-01-01')).toBeNull()
  })
})

describe('resolverPrecioReserva — resolución de precio completa (código real)', () => {
  it('proporcional noche a noche, todo dentro de un mismo período', () => {
    // 3 noches en baja, pax 2 → 3 × 10000
    expect(resolverPrecioReserva([periodoBaja, periodoAlta], preciosParaPax(2), '2026-06-01', 3, 2).total).toBe(30000)
  })

  it('exactamente 7 noches usa el precio semana si está cargado', () => {
    const r = resolverPrecioReserva([periodoBaja, periodoAlta], preciosParaPax(2), '2026-06-01', 7, 2)
    expect(r.total).toBe(60000)
    expect(r.precioNombrePeriodo).toBe('Baja · precio semana · 2 PAX')
  })

  it('7 noches pero sin precio_semana cargado (0) → cae al cálculo proporcional', () => {
    // temporada alta, pax 2, precio_semana=0 → 7 × 20000
    expect(resolverPrecioReserva([periodoBaja, periodoAlta], preciosParaPax(2), '2026-12-05', 7, 2).total).toBe(140000)
  })

  it('reserva que cruza el borde entre dos períodos sin precio_semana', () => {
    // 29/11 baja (10000) + 30/11 baja (10000) + 1/12 alta (20000, ya
    // empezó porque fecha_fin de baja es exclusivo)
    const r = resolverPrecioReserva([periodoBaja, periodoAlta], preciosParaPax(2), '2026-11-29', 3, 2)
    expect(r.total).toBe(40000)
  })

  it('desglose con más de un período muestra "Nn × $precio (Nombre)" por tramo', () => {
    const r = resolverPrecioReserva([periodoBaja, periodoAlta], preciosParaPax(2), '2026-11-29', 3, 2)
    expect(r.precioNombrePeriodo).toBe('2n × $10.000 (Baja) + 1n × $20.000 (Alta)')
  })

  it('pax fuera de rango se clampea a [2,7] (el llamador real filtra precios_pax con ese pax ya clampeado)', () => {
    // safePax(12) = 7 → la query real pediría .eq('pax', 7)
    expect(resolverPrecioReserva([periodoBaja], preciosParaPax(7), '2026-06-01', 1, 12).total).toBe(30000)
  })

  it('sin período para la fecha de entrada → sinPeriodo=true, total=null', () => {
    const r = resolverPrecioReserva([periodoBaja], preciosParaPax(2), '2020-01-01', 3, 2)
    expect(r.sinPeriodo).toBe(true)
    expect(r.total).toBeNull()
  })

  it('hay período pero no hay precio cargado para ese pax → muestra el nombre pelado, total null', () => {
    const r = resolverPrecioReserva([periodoBaja], preciosParaPax(6), '2026-06-01', 3, 6) // sin fila pax=6 en el catálogo
    expect(r.sinPeriodo).toBe(false)
    expect(r.precioNombrePeriodo).toBe('Baja')
    expect(r.total).toBeNull()
  })

  it('noche que cae en un hueco sin ningún período → esa noche no suma nada', () => {
    const conHueco = [
      { id: 'a', nombre: 'A', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-05' },
      { id: 'b', nombre: 'B', fecha_inicio: '2026-01-10', fecha_fin: '2026-02-01' },
    ]
    const preciosHueco = [
      { periodo_id: 'a', pax: 2, precio_noche: 1000, precio_semana: 0 },
      { periodo_id: 'b', pax: 2, precio_noche: 2000, precio_semana: 0 },
    ]
    // Entrada 3/1, 4 noches: 3/1 (a, 1000), 4/1 (a, 1000), 5/1 (hueco, 0), 6/1 (hueco, 0)
    expect(resolverPrecioReserva(conHueco, preciosHueco, '2026-01-03', 4, 2).total).toBe(2000)
  })

  it('fecha de entrada ya después de que el único período terminó → sinPeriodo, total null', () => {
    const soloA = [{ id: 'a', nombre: 'A', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-05' }]
    const preciosA = [{ periodo_id: 'a', pax: 2, precio_noche: 1000, precio_semana: 0 }]
    const r = resolverPrecioReserva(soloA, preciosA, '2026-01-10', 3, 2)
    expect(r.sinPeriodo).toBe(true)
    expect(r.total).toBeNull()
  })
})

// Prioridad 3 — tarifa por tramos (023_precios_pax_noche_adicional.sql):
// weeks = Math.floor(noches/7), remainder = noches%7. weeks===0 sigue
// exactamente la fórmula vieja (ver arriba, sin cambios); weeks>=1 usa
// weeks*precio_semana + remainder*precio_noche_adicional SI ese período
// ya lo tiene cargado, si no cae a la fórmula vieja verbatim (mismo
// catálogo de arriba, sin precio_noche_adicional en ninguna fila —
// simula cualquier período todavía no configurado, VIP incluido).
describe('resolverPrecioReserva — Prioridad 3: tarifa por tramos (código real)', () => {
  const periodoConAdicional = { id: 'baja', nombre: 'Baja', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-01' }
  // precio_noche 10000 · precio_semana 60000 · precio_noche_adicional 8000
  const conAdicional = [{ periodo_id: 'baja', pax: 2, precio_noche: 10000, precio_semana: 60000, precio_noche_adicional: 8000 }]

  it('2 noches (individual, sin cambios frente a la fórmula vieja)', () => {
    expect(resolverPrecioReserva([periodoConAdicional], conAdicional, '2026-06-01', 2, 2).total).toBe(20000)
  })

  it('6 noches (individual, borde justo debajo de una semana)', () => {
    expect(resolverPrecioReserva([periodoConAdicional], conAdicional, '2026-06-01', 6, 2).total).toBe(60000)
  })

  it('7 noches exacto (1 semana, remainder 0) → sin cargo de noche adicional aunque esté cargada', () => {
    const r = resolverPrecioReserva([periodoConAdicional], conAdicional, '2026-06-01', 7, 2)
    expect(r.total).toBe(60000) // 1×60000 + 0×8000
  })

  it('9 noches (1 semana + 2 noches adicionales)', () => {
    const r = resolverPrecioReserva([periodoConAdicional], conAdicional, '2026-06-01', 9, 2)
    expect(r.total).toBe(76000) // 1×60000 + 2×8000
  })

  it('14 noches (2 semanas exacto, remainder 0)', () => {
    const r = resolverPrecioReserva([periodoConAdicional], conAdicional, '2026-06-01', 14, 2)
    expect(r.total).toBe(120000) // 2×60000 + 0×8000
  })

  it('8 noches (1 semana + 1 noche adicional)', () => {
    const r = resolverPrecioReserva([periodoConAdicional], conAdicional, '2026-06-01', 8, 2)
    expect(r.total).toBe(68000) // 1×60000 + 1×8000
  })

  it('fallback: precio_noche_adicional null/ausente (cualquier período todavía no configurado, VIP incluido) — 9 noches usa la fórmula vieja verbatim', () => {
    // Mismo catálogo que el resto del archivo (periodoBaja/catalogo), sin
    // ninguna fila con precio_noche_adicional — 9 noches, todas dentro
    // de "Baja" (pax 2, precio_noche 10000): 9 × 10000, prorrateado
    // noche a noche exactamente como antes de esta feature.
    const r = resolverPrecioReserva([periodoBaja, periodoAlta], preciosParaPax(2), '2026-06-01', 9, 2)
    expect(r.total).toBe(90000)
  })
})

// Código real importado de src/pages/Ganancias.jsx (ars/usd/pct/inPeriod/
// sumField/movRowTotal) — sin mocks, sin DB. La fórmula de "sumar estos
// 3 resultados" (ingSilviaARS + ingBanco + ingMp) es la única parte
// mirror-eada acá (una línea de suma, tomada literalmente de
// Ganancias.jsx), porque esa combinación vive inline en el componente,
// no como función standalone — pero el trabajo real (filtrar por
// período, sumar columnas) corre con las funciones reales importadas,
// así que un bug ahí SÍ se detecta.
import { describe, it, expect } from 'vitest'
import { sumField, inPeriod, movRowTotal, ars, pct } from '../../src/pages/Ganancias'

describe('Ganancias VIP — Ingresos ARS / Gastos totales (bug de caja_banco/caja_mercado_pago)', () => {
  const mes = 7 // Agosto (0-indexado)
  const anio = 2026

  // Mismo escenario que destapó el bug real: $2.000 en caja_silvia +
  // $8.000 repartidos en 4 filas de caja_banco = $10.000 reales.
  const silviaAgosto = [
    { fecha: '2026-08-05', ingreso_pesos: 2000, ingreso_juli: 0, ingreso_dolares: 0, gasto: 0 },
  ]
  const bancoAgosto = [
    { fecha: '2026-08-02', ingreso: 2000, egreso: 0 },
    { fecha: '2026-08-10', ingreso: 3000, egreso: 0 },
    { fecha: '2026-08-18', ingreso: 1500, egreso: 500 },
    { fecha: '2026-08-27', ingreso: 1500, egreso: 0 },
  ]
  const mpAgosto = [{ fecha: '2026-08-15', ingreso: 0, egreso: 0 }]
  const bancoJulio = { fecha: '2026-07-30', ingreso: 9999, egreso: 0 } // debe quedar afuera

  it('Ingresos ARS = caja_silvia + caja_banco + caja_mercado_pago, filtrado al período', () => {
    const fSilvia = silviaAgosto.filter((r) => inPeriod(r.fecha, mes, anio, false))
    const fBanco  = [...bancoAgosto, bancoJulio].filter((r) => inPeriod(r.fecha, mes, anio, false))
    const fMp     = mpAgosto.filter((r) => inPeriod(r.fecha, mes, anio, false))

    expect(fBanco).toHaveLength(4) // julio quedó afuera del filtro real

    const ingSilviaARS = sumField(fSilvia, 'ingreso_pesos') + sumField(fSilvia, 'ingreso_juli')
    const ingBanco = sumField(fBanco, 'ingreso')
    const ingMp = sumField(fMp, 'ingreso')
    const ingARS = ingSilviaARS + ingBanco + ingMp

    expect(ingARS).toBe(10000) // el número real confirmado a mano en el bug reportado
  })

  it('Gastos totales = caja_silvia.gasto + caja_banco.egreso + caja_mercado_pago.egreso', () => {
    const fSilvia = silviaAgosto.filter((r) => inPeriod(r.fecha, mes, anio, false))
    const fBanco  = bancoAgosto.filter((r) => inPeriod(r.fecha, mes, anio, false))
    const fMp     = mpAgosto.filter((r) => inPeriod(r.fecha, mes, anio, false))
    const gastoTotal = sumField(fSilvia, 'gasto') + sumField(fBanco, 'egreso') + sumField(fMp, 'egreso')
    expect(gastoTotal).toBe(500)
  })

  it('sin movimientos en el período → todo en $0, no explota', () => {
    const f = [].filter((r) => inPeriod(r.fecha, mes, anio, false))
    expect(sumField(f, 'ingreso_pesos')).toBe(0)
  })

  it('sólo gastos, sin ingresos, en el período', () => {
    const f = [{ fecha: '2026-08-01', ingreso: 0, egreso: 700 }].filter((r) => inPeriod(r.fecha, mes, anio, false))
    expect(sumField(f, 'ingreso')).toBe(0)
    expect(sumField(f, 'egreso')).toBe(700)
  })

  it('sólo ingresos, sin gastos, en el período', () => {
    const f = [{ fecha: '2026-08-01', ingreso: 900, egreso: 0 }].filter((r) => inPeriod(r.fecha, mes, anio, false))
    expect(sumField(f, 'ingreso')).toBe(900)
    expect(sumField(f, 'egreso')).toBe(0)
  })

  it('ingreso_dolares (USD) se computa aparte — no se mezcla con el total ARS', () => {
    const f = [{ fecha: '2026-08-01', ingreso_pesos: 1000, ingreso_dolares: 50, ingreso_juli: 0 }]
      .filter((r) => inPeriod(r.fecha, mes, anio, false))
    expect(sumField(f, 'ingreso_pesos') + sumField(f, 'ingreso_juli')).toBe(1000)
    expect(sumField(f, 'ingreso_dolares')).toBe(50)
  })
})

describe('Ganancias NO-VIP — movimientos_caja (código real: movRowTotal + inPeriod)', () => {
  const mes = 7
  const anio = 2026
  const movs = [
    { fecha: '2026-08-01', tipo: 'ingreso', monto_depositos: 1000, monto_efectivo: 0,   monto_otros: 0 },
    { fecha: '2026-08-05', tipo: 'egreso',  monto_depositos: 0,    monto_efectivo: 300, monto_otros: 0 },
    { fecha: '2026-07-31', tipo: 'ingreso', monto_depositos: 5000, monto_efectivo: 0,   monto_otros: 0 }, // fuera de rango
  ]

  it('suma ingresos del período con movRowTotal, excluyendo julio', () => {
    const fIngreso = movs.filter((m) => m.tipo === 'ingreso' && inPeriod(m.fecha, mes, anio, false))
    expect(fIngreso).toHaveLength(1)
    expect(fIngreso.reduce((s, m) => s + movRowTotal(m), 0)).toBe(1000)
  })

  it('suma egresos del período con movRowTotal', () => {
    const fEgreso = movs.filter((m) => m.tipo === 'egreso' && inPeriod(m.fecha, mes, anio, false))
    expect(fEgreso.reduce((s, m) => s + movRowTotal(m), 0)).toBe(300)
  })

  it('movRowTotal suma los 3 buckets de un mismo movimiento', () => {
    expect(movRowTotal({ monto_depositos: 100, monto_efectivo: 50, monto_otros: 25 })).toBe(175)
  })

  it('movRowTotal con campos faltantes/null trata cada uno como 0', () => {
    expect(movRowTotal({})).toBe(0)
    expect(movRowTotal({ monto_depositos: null, monto_efectivo: undefined, monto_otros: 10 })).toBe(10)
  })
})

// Prioridad 1+2 — Ganancia Neta corregida. Investigado en staging real:
// caja_silvia/caja_juli/caja_banco/caja_mercado_pago (VIP) NO tienen
// ningún concepto de "categoría" que pueda esconder una devolución o un
// préstamo dentro de un ingreso/gasto normal (caja_silvia/banco/mp no
// tienen columna categoria/tipo en absoluto; caja_juli sí tiene una
// columna `devolucion`, pero esa tabla ni siquiera entra en ingARS/
// gastoTotal/ganancia hoy — son cifras propias, sin equivalente
// "afectan la ganancia"). El único concepto estructuralmente análogo
// que SÍ existe en VIP es `retiro_pesos`/`retiro_dolares` de
// caja_silvia — y ya está correctamente afuera de ingARS/gastoTotal
// (su propia tarjeta aparte, nunca sumado ahí). Conclusión: la fórmula
// de Ganancia Neta de VIP (ingARS - gastoTotal) ya era correcta antes
// de este cambio — no se tocó nada de VIP. Para NO-VIP, en cambio,
// Ganancias.jsx (acá abajo) YA sumaba únicamente tipo==='ingreso'/
// 'egreso' — el bug real estaba en CajaTemporada.jsx (ver
// tests/unit/caja-temporada.test.js), no acá.
describe('Ganancia Neta — mezcla de ingreso/egreso/préstamo/devolución/retiro en el mismo período', () => {
  it('VIP: retiro_pesos/retiro_dolares (concepto real en caja_silvia) quedan afuera de Ingresos ARS y Gastos totales', () => {
    const silviaConRetiro = [
      { fecha: '2026-08-05', ingreso_pesos: 2000, ingreso_juli: 0, ingreso_dolares: 0, gasto: 300, retiro_pesos: 5000, retiro_dolares: 20 },
    ].filter((r) => inPeriod(r.fecha, 7, 2026, false))

    const ingARS     = sumField(silviaConRetiro, 'ingreso_pesos') + sumField(silviaConRetiro, 'ingreso_juli')
    const gastoTotal = sumField(silviaConRetiro, 'gasto')
    const ganancia   = ingARS - gastoTotal

    expect(ingARS).toBe(2000)      // el retiro de $5.000 no se suma acá
    expect(gastoTotal).toBe(300)   // ídem
    expect(ganancia).toBe(1700)    // 2000 - 300, sin que el retiro lo toque en ningún sentido
  })

  it('NO-VIP: préstamo/devolución/retiro en movimientos_caja no afectan Ganancia Neta (ya era correcto, se reconfirma)', () => {
    const mes = 7, anio = 2026
    const movsMixtos = [
      { fecha: '2026-08-01', tipo: 'ingreso',    monto_depositos: 1000, monto_efectivo: 0,   monto_otros: 0 },
      { fecha: '2026-08-05', tipo: 'egreso',     monto_depositos: 0,    monto_efectivo: 300, monto_otros: 0 },
      { fecha: '2026-08-10', tipo: 'prestamo',   monto_depositos: 9000, monto_efectivo: 0,   monto_otros: 0 },
      { fecha: '2026-08-15', tipo: 'devolucion', monto_depositos: 0,    monto_efectivo: 400, monto_otros: 0 },
      { fecha: '2026-08-18', tipo: 'retiro',     monto_depositos: 0,    monto_efectivo: 700, monto_otros: 0 },
    ]
    // Misma expresión que usa Ganancias.jsx para NO-VIP (fMovIngreso/
    // fMovEgreso + reduce con movRowTotal, ver src/pages/Ganancias.jsx).
    const fIngreso = movsMixtos.filter((m) => m.tipo === 'ingreso' && inPeriod(m.fecha, mes, anio, false))
    const fEgreso  = movsMixtos.filter((m) => m.tipo === 'egreso'  && inPeriod(m.fecha, mes, anio, false))
    const ingresosMovCaja = fIngreso.reduce((s, m) => s + movRowTotal(m), 0)
    const gastosMovCaja   = fEgreso.reduce((s, m) => s + movRowTotal(m), 0)
    const gananciaMovCaja = ingresosMovCaja - gastosMovCaja

    expect(ingresosMovCaja).toBe(1000) // el préstamo de $9.000 no entra
    expect(gastosMovCaja).toBe(300)    // la devolución de $400 y el retiro de $700 no entran
    expect(gananciaMovCaja).toBe(700)  // 1000 - 300, nada más
  })
})

describe('inPeriod — filtro de fecha (código real)', () => {
  it('mes/año exactos → true', () => {
    expect(inPeriod('2026-08-15', 7, 2026, false)).toBe(true)
  })
  it('mismo mes, año distinto → false', () => {
    expect(inPeriod('2025-08-15', 7, 2026, false)).toBe(false)
  })
  it('allYear=true ignora el mes, sólo mira el año', () => {
    expect(inPeriod('2026-01-01', 7, 2026, true)).toBe(true)
    expect(inPeriod('2026-12-31', 7, 2026, true)).toBe(true)
    expect(inPeriod('2025-12-31', 7, 2026, true)).toBe(false)
  })
  it('fecha vacía/null → false, no explota', () => {
    expect(inPeriod(null, 7, 2026, false)).toBe(false)
    expect(inPeriod('', 7, 2026, false)).toBe(false)
  })
})

describe('sumField / ars / pct — helpers de suma y formato (código real)', () => {
  it('sumField ignora valores no numéricos/null como 0', () => {
    expect(sumField([{ x: 5 }, { x: null }, { x: 'abc' }, { x: 3 }], 'x')).toBe(8)
  })
  it('ars formatea con separador de miles es-AR', () => {
    expect(ars(1234567)).toContain('1.234.567')
  })
  it('ars(0) muestra $0, no "-"', () => {
    expect(ars(0)).toBe('$0')
  })
  it('ars(null/undefined) muestra "-"', () => {
    expect(ars(null)).toBe('-')
    expect(ars(undefined)).toBe('-')
  })
  it('pct calcula el porcentaje con 1 decimal', () => {
    expect(pct(25, 200)).toBe('12.5%')
  })
  it('pct con total 0 devuelve "0%" sin dividir por cero', () => {
    expect(pct(10, 0)).toBe('0%')
  })
})

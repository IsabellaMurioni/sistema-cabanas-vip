import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseISO, getMonth, getYear, format, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts'
import { useComplejo } from '../context/ComplejoContext'
import { validarMontoMovimiento } from './CajaTemporada'
import { fechaEstaCerrada, labelCierre } from '../lib/cierres'

// Este archivo exporta algunas funciones puras (ars/usd/pct/inPeriod/
// sumField/movRowTotal) además del componente default, para que los
// tests unitarios (tests/unit/) puedan importar y ejercitar la lógica
// real en vez de reimplementarla. Eso rompe el supuesto de Fast Refresh
// de "un archivo de componente sólo exporta componentes" — sin impacto
// en runtime/producción, sólo hace que Vite recargue toda la página en
// vez de hacer hot-swap cuando se edita este archivo en desarrollo.
/* eslint-disable react-refresh/only-export-components */

// ─── Constants ───────────────────────────────────────────────────────────────

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MESES_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const currentYear = new Date().getFullYear()
const YEARS = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]

const EXPENSE_CATEGORIES = [
  'El Barba / Ferretería', 'Extragas', 'EDEA', 'Tavo Destapador', 'Scyco Agua',
  'Cootelser', 'Sueldos', 'Jardinero', 'Limpieza de pileta', 'Bazar',
  'Publicidad en Internet', 'Marea TV Cable', 'Gastos extras', 'Mantenimiento',
  'Bomberos Voluntarios', 'Forrajería', 'Casa Triju', 'Varios',
]

const PIE_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4',
  '#f97316','#84cc16','#ec4899','#14b8a6','#6366f1','#e11d48',
  '#0ea5e9','#a3e635','#fb923c','#d946ef','#22c55e','#64748b',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function ars(v) {
  if (!v && v !== 0) return '-'
  return `$${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}
export function usd(v) {
  if (!v && v !== 0) return '-'
  return `U$D ${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
}
export function pct(part, total) {
  if (!total) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

export function inPeriod(dateStr, mes, anio, allYear) {
  if (!dateStr) return false
  const d = parseISO(dateStr)
  if (allYear) return getYear(d) === anio
  return getMonth(d) === mes && getYear(d) === anio
}

export function sumField(arr, field) {
  return arr.reduce((s, r) => s + (Number(r[field]) || 0), 0)
}

// ─── Complejos NO-VIP: equivalentes desde movimientos_caja ──────────────────
// Cabañas VIP sigue leyendo de caja_silvia/caja_juli (arriba, sin tocar). El
// resto de los complejos escriben su ingreso/egreso de "Caja temporada" en
// movimientos_caja — acá se replica, lo más fielmente posible, cada métrica
// de más arriba a partir de esa tabla. movimientos_caja no tiene concepto de
// USD ni de "retiro", así que esas dos métricas no tienen equivalente y se
// omiten para NO-VIP (ver el tab de Retiros y las tarjetas de Ingresos USD /
// Retiro pesos / Retiro USD).
const MOV_CATEGORIA_LABEL = {
  alquiler:             'Alquiler',
  arreglos_ferreteria:  'Arreglos y Ferretería',
  impuestos_servicios:  'Impuestos y Servicios',
  empleados:            'Empleados',
  limpieza_perfumeria:  'Limpieza y Perfumería',
  lavadero:             'Lavadero',
  publicidad:           'Publicidad',
  desayunos:            'Desayunos',
  blanco:               'Blanco',
  bazar:                'Bazar',
  variables:             'Variables',
  libreria:              'Librería',
}

export function movRowTotal(m) {
  return (Number(m.monto_depositos) || 0) + (Number(m.monto_efectivo) || 0) + (Number(m.monto_otros) || 0)
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DeltaBadge({ current, previous }) {
  if (!previous || previous === 0) return null
  const diff = current - previous
  const p = ((diff / Math.abs(previous)) * 100).toFixed(1)
  const up = diff >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {up ? '↑' : '↓'} {Math.abs(p)}%
    </span>
  )
}

function SummaryCard({ label, value, sub, prevValue, color = 'gray', large }) {
  const colors = {
    green:  { bg: 'bg-[var(--color-secundario)] border border-[#f0e6d8]', label: 'text-green-600', val: 'text-green-700' },
    red:    { bg: 'bg-[var(--color-secundario)] border border-[#f0e6d8]', label: 'text-red-600',   val: 'text-red-700' },
    blue:   { bg: 'bg-[var(--color-secundario)] border border-[#f0e6d8]', label: 'text-[var(--color-primario)]', val: 'text-[var(--color-primario-hover)]' },
    gray:   { bg: 'bg-[var(--color-secundario)] border border-[#f0e6d8]', label: 'text-[#888]',    val: 'text-[#111111]' },
    dark:   { bg: 'bg-[#111111]',                          label: 'text-[var(--color-primario)]', val: 'text-white' },
  }
  const c = colors[color]
  // testid derivado del label ("Ingresos ARS" -> "tile-ingresos-ars") para
  // que los tests E2E (tests/e2e/) puedan targetear un tile puntual sin
  // depender del texto exacto/formato del valor. Ningún label real de
  // este archivo lleva tildes, así que alcanza con minúsculas + guiones.
  const testId = 'tile-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return (
    <div data-testid={testId} className={`${c.bg} rounded-[16px] p-5`}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${c.label}`}>{label}</p>
      <p data-testid={`${testId}-value`} className={`font-bold ${c.val} ${large ? 'text-3xl' : 'text-2xl'}`}>{value}</p>
      {sub && <p className="text-xs text-[#888] mt-1">{sub}</p>}
      {prevValue !== undefined && (
        <div className="mt-2">
          <DeltaBadge current={parseFloat(String(value).replace(/[^0-9.-]/g, ''))} previous={prevValue} />
        </div>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="card">
      <h3 className="text-[16px] font-semibold text-[#111111] mb-4">{title}</h3>
      {children}
    </div>
  )
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportCSV(rows, filename) {
  if (!rows.length) return
  const headers = Object.keys(rows[0]).join(',')
  const body = rows.map(r => Object.values(r).map(v => `"${v}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + headers + '\n' + body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// Query real de movimientos_caja de un complejo (rama NO-VIP) — usada
// por el useEffect de carga de datos. Exportada para que los tests de
// integración (tests/integration/) puedan ejercitarla directamente en
// vez de reimplementarla. Sin ordenamiento (a diferencia de
// CajaTemporada.jsx, que sí lo necesita para su tabla) porque acá todo
// se agrega/filtra client-side y las tablas que sí muestran filas
// crudas ya hacen su propio sort antes de renderizar.
export async function fetchMovimientosPorComplejo(supabase, complejoId) {
  return supabase.from('movimientos_caja').select('*').eq('complejo_id', complejoId)
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Ganancias() {
  const { getCabanaColor, complejoActivo } = useComplejo()
  const isVip = complejoActivo?.slug === 'cabanas-vip'
  const [reservas, setReservas]       = useState([])
  const [silvia, setSilvia]           = useState([])
  const [juli, setJuli]               = useState([])
  const [banco, setBanco]             = useState([]) // VIP: señas/pagos por transferencia bancaria
  const [mp, setMp]                   = useState([]) // VIP: señas/pagos por Mercado Pago
  const [movimientosCaja, setMovimientosCaja] = useState([]) // NO-VIP: fuente de ingresos/gastos
  const [loading, setLoading]         = useState(true)
  const [mes, setMes]                 = useState(new Date().getMonth())
  const [anio, setAnio]               = useState(currentYear)
  const [allYear, setAllYear]         = useState(false)
  const [activeTab, setActiveTab]     = useState('resumen')
  const [expandedRows, setExpandedRows] = useState(new Set())

  // NO-VIP: form de "Nuevo retiro" (tab Retiros, más abajo).
  const [retiroMonto, setRetiroMonto]   = useState('')
  const [retiroMotivo, setRetiroMotivo] = useState('')
  const [retiroError, setRetiroError]   = useState('')
  const [retiroSaving, setRetiroSaving] = useState(false)

  useEffect(() => {
    if (!complejoActivo) {
      setReservas([])
      setSilvia([])
      setJuli([])
      setBanco([])
      setMp([])
      setMovimientosCaja([])
      return
    }
    // Guard contra respuesta obsoleta (mismo patrón que ComplejoContext.jsx,
    // líneas 62/69/85-87): complejoActivo pasa brevemente por un valor
    // "default" (el primer complejo con membresía, ver ComplejoContext.jsx
    // línea 76-81) antes de que Layout.jsx lo corrija al slug real de la URL
    // (Layout.jsx línea 80-90) — este efecto se dispara dos veces seguidas
    // en la carga de cualquier complejo NO-VIP. La rama VIP hace 5 queries
    // (más lenta) contra las 2 de la rama NO-VIP: si esa carrera termina en
    // orden inverso, el .then() más viejo (VIP) podía resolver DESPUÉS del
    // más nuevo (NO-VIP) y pisarle el estado ya correcto con setMovimientosCaja([])
    // — bug real confirmado en vivo contra datos de staging de Mimmo (Ingresos
    // ARS/Gastos totales quedaban en $0 pese a haber movimientos_caja reales).
    // Simétrico en las dos ramas: la misma carrera al revés (NO-VIP más lenta
    // que una VIP más nueva) pisaría banco/mp/silvia/juli de la misma forma.
    let cancelado = false
    setLoading(true)
    if (complejoActivo.slug === 'cabanas-vip') {
      // Las 4 tablas de caja de VIP: caja_silvia y caja_juli ya se leían acá;
      // caja_banco y caja_mercado_pago se suman ahora porque también son
      // ingreso/egreso ARS real de señas y pagos (bug: "Ingresos ARS" y
      // "Gastos totales" sólo miraban caja_silvia y se perdían todo lo
      // pagado por transferencia o Mercado Pago).
      Promise.all([
        supabase.from('reservas').select('*').eq('complejo_id', complejoActivo.id).neq('estado', 'Cancelada'),
        supabase.from('caja_silvia').select('*').eq('complejo_id', complejoActivo.id),
        supabase.from('caja_juli').select('*').eq('complejo_id', complejoActivo.id),
        supabase.from('caja_banco').select('*').eq('complejo_id', complejoActivo.id),
        supabase.from('caja_mercado_pago').select('*').eq('complejo_id', complejoActivo.id),
      ]).then(([r, s, j, b, m]) => {
        if (cancelado) return
        setReservas(r.data || [])
        setSilvia(s.data || [])
        setJuli(j.data || [])
        setBanco(b.data || [])
        setMp(m.data || [])
        setMovimientosCaja([])
        setLoading(false)
      })
    } else {
      // Complejos NO-VIP: sin caja_silvia/caja_juli — el ingreso/egreso vive
      // en movimientos_caja, filtrado explícitamente por complejo_id (nunca
      // sólo por RLS) igual que el resto de las queries de esta pantalla.
      Promise.all([
        supabase.from('reservas').select('*').eq('complejo_id', complejoActivo.id).neq('estado', 'Cancelada'),
        fetchMovimientosPorComplejo(supabase, complejoActivo.id),
      ]).then(([r, m]) => {
        if (cancelado) return
        setReservas(r.data || [])
        setSilvia([])
        setJuli([])
        setMovimientosCaja(m.data || [])
        setLoading(false)
      })
    }
    return () => {
      cancelado = true
    }
  }, [complejoActivo?.id])

  // ── Filtered data for selected period ──────────────────────────────────────
  const fReservas = useMemo(() =>
    reservas.filter(r => inPeriod(r.fecha_entrada, mes, anio, allYear)),
    [reservas, mes, anio, allYear]
  )
  const fSilvia = useMemo(() =>
    silvia.filter(r => inPeriod(r.fecha, mes, anio, allYear)),
    [silvia, mes, anio, allYear]
  )
  const fJuliMain = useMemo(() =>
    juli.filter(r => r.seccion === 'main' && inPeriod(r.fecha, mes, anio, allYear)),
    [juli, mes, anio, allYear]
  )
  const fJuliGastos = useMemo(() =>
    juli.filter(r => r.seccion === 'gastos' && inPeriod(r.fecha, mes, anio, allYear)),
    [juli, mes, anio, allYear]
  )
  const fBanco = useMemo(() =>
    banco.filter(r => inPeriod(r.fecha, mes, anio, allYear)),
    [banco, mes, anio, allYear]
  )
  const fMp = useMemo(() =>
    mp.filter(r => inPeriod(r.fecha, mes, anio, allYear)),
    [mp, mes, anio, allYear]
  )

  // ── NO-VIP: movimientos_caja filtrados al período seleccionado ─────────────
  const fMovIngreso = useMemo(() =>
    movimientosCaja.filter(m => m.tipo === 'ingreso' && inPeriod(m.fecha, mes, anio, allYear)),
    [movimientosCaja, mes, anio, allYear]
  )
  const fMovEgreso = useMemo(() =>
    movimientosCaja.filter(m => m.tipo === 'egreso' && inPeriod(m.fecha, mes, anio, allYear)),
    [movimientosCaja, mes, anio, allYear]
  )
  // Retiros NO-VIP (tab Retiros, más abajo) — plata ya ganada que se
  // saca de la caja, tipo='retiro' propio (022_movimientos_caja_tipo_
  // retiro.sql). A propósito NUNCA entra en fMovIngreso/fMovEgreso de
  // arriba (tipo exacto distinto), así que Ventas/Gastos/Ganancia Neta/
  // Ingreso Total/Devoluciones/Préstamos ya quedan afuera de esto sin
  // ningún cambio adicional.
  const fMovRetiro = useMemo(() =>
    movimientosCaja.filter(m => m.tipo === 'retiro' && inPeriod(m.fecha, mes, anio, allYear)),
    [movimientosCaja, mes, anio, allYear]
  )

  // ── Previous period (for delta comparison) ─────────────────────────────────
  const prevDate  = subMonths(new Date(anio, mes, 1), 1)
  const prevMes   = getMonth(prevDate)
  const prevAnio  = getYear(prevDate)

  const pSilvia = useMemo(() =>
    silvia.filter(r => inPeriod(r.fecha, prevMes, prevAnio, false)),
    [silvia, prevMes, prevAnio]
  )
  const pBanco = useMemo(() =>
    banco.filter(r => inPeriod(r.fecha, prevMes, prevAnio, false)),
    [banco, prevMes, prevAnio]
  )
  const pMp = useMemo(() =>
    mp.filter(r => inPeriod(r.fecha, prevMes, prevAnio, false)),
    [mp, prevMes, prevAnio]
  )
  // Mismo fix que el total del período actual: el período anterior de la
  // delta badge también tiene que sumar Banco + Mercado Pago, si no la
  // comparación queda mal calibrada contra el total ya corregido.
  const prevIngARS = sumField(pSilvia, 'ingreso_pesos') + sumField(pSilvia, 'ingreso_juli') +
    sumField(pBanco, 'ingreso') + sumField(pMp, 'ingreso')
  const prevGastos = sumField(pSilvia, 'gasto') + sumField(pBanco, 'egreso') + sumField(pMp, 'egreso')
  const prevGanancia = prevIngARS - prevGastos

  // NO-VIP: mismo período anterior, contra movimientos_caja
  const pMovIngreso = useMemo(() =>
    movimientosCaja.filter(m => m.tipo === 'ingreso' && inPeriod(m.fecha, prevMes, prevAnio, false)),
    [movimientosCaja, prevMes, prevAnio]
  )
  const pMovEgreso = useMemo(() =>
    movimientosCaja.filter(m => m.tipo === 'egreso' && inPeriod(m.fecha, prevMes, prevAnio, false)),
    [movimientosCaja, prevMes, prevAnio]
  )
  const prevIngMovCaja      = pMovIngreso.reduce((s, m) => s + movRowTotal(m), 0)
  const prevGastosMovCaja   = pMovEgreso.reduce((s, m) => s + movRowTotal(m), 0)
  const prevGananciaMovCaja = prevIngMovCaja - prevGastosMovCaja

  // ── Income totals ──────────────────────────────────────────────────────────
  // "Ingresos ARS" / "Gastos totales" tienen que ser el ARS real de las 3
  // cajas de plata (Silvia + Banco + Mercado Pago) — antes sólo miraban
  // caja_silvia y se perdía toda seña/pago hecho por transferencia o MP
  // (el bug reportado). ingSilviaARS/gastoSilvia quedan también expuestos
  // sueltos porque la tarjeta "(Caja Silvia)" del tab Ingresos y la tabla
  // de categorías (que sólo Silvia puede categorizar, vía `cuenta`) siguen
  // mostrando ESE subtotal específico, no el combinado.
  const ingSilviaARS = sumField(fSilvia, 'ingreso_pesos') + sumField(fSilvia, 'ingreso_juli')
  const ingBanco      = sumField(fBanco, 'ingreso')
  const ingMp         = sumField(fMp, 'ingreso')
  const ingARS        = ingSilviaARS + ingBanco + ingMp

  const ingUSD     = sumField(fSilvia, 'ingreso_dolares') // sin cambios: ninguna otra tabla trackea USD

  const gastoSilvia = sumField(fSilvia, 'gasto')
  const egresoBanco = sumField(fBanco, 'egreso')
  const egresoMp    = sumField(fMp, 'egreso')
  const gastoTotal  = gastoSilvia + egresoBanco + egresoMp

  const retiroPesos  = sumField(fSilvia, 'retiro_pesos')  // sin cambios: "retiro" sólo existe en caja_silvia
  const retiroUSD    = sumField(fSilvia, 'retiro_dolares') // ídem
  const ganancia   = ingARS - gastoTotal

  // NO-VIP: mismos totales, desde movimientos_caja. Sin equivalente a
  // ingUSD/retiroPesos/retiroUSD — movimientos_caja no distingue moneda ni
  // tiene un tipo "retiro" (ver TIPO_LABELS en CajaTemporada.jsx: sólo
  // ingreso/egreso/prestamo/devolucion) — se omiten para NO-VIP.
  const ingresosMovCaja = fMovIngreso.reduce((s, m) => s + movRowTotal(m), 0)
  const gastosMovCaja   = fMovEgreso.reduce((s, m) => s + movRowTotal(m), 0)
  const gananciaMovCaja = ingresosMovCaja - gastosMovCaja

  // Valores a mostrar según el complejo — para VIP son exactamente los
  // mismos ingARS/gastoTotal/ganancia/prevIngARS/prevGastos/prevGanancia de
  // arriba (sin ningún cambio de comportamiento); para NO-VIP, los
  // equivalentes de movimientos_caja recién calculados.
  const dIngresos     = isVip ? ingARS     : ingresosMovCaja
  const dPrevIngresos = isVip ? prevIngARS : prevIngMovCaja
  const dGastos       = isVip ? gastoTotal : gastosMovCaja
  const dPrevGastos   = isVip ? prevGastos : prevGastosMovCaja
  const dGanancia     = isVip ? ganancia   : gananciaMovCaja
  const dPrevGanancia = isVip ? prevGanancia : prevGananciaMovCaja

  // Reservas income (contracted)
  const reservasIncome = sumField(fReservas, 'monto_total')
  const reservasCount  = fReservas.length

  // Juli ingresos/egresos
  const juliIngresos = fJuliMain.filter(r => r.tipo_main === 'ingreso').reduce((s,r) => s + (r.importe||0), 0)
  const juliEgresos  = fJuliMain.filter(r => r.tipo_main === 'egreso').reduce((s,r) => s + (r.importe||0), 0)
  const juliGastos   = fJuliGastos.reduce((s,r) => s + (r.importe||0) - (r.devolucion||0), 0)

  // ── Income by cabin ────────────────────────────────────────────────────────
  const porCabana = useMemo(() => {
    const acc = {}
    for (const r of fReservas) {
      if (!acc[r.cabana]) acc[r.cabana] = { reservas: 0, monto: 0 }
      acc[r.cabana].reservas += 1
      acc[r.cabana].monto += r.monto_total || 0
    }
    return Object.entries(acc)
      .map(([cab, d]) => ({ cabana: cab, reservas: d.reservas, monto: d.monto }))
      .sort((a, b) => b.monto - a.monto)
  }, [fReservas])

  // ── Expense by category ────────────────────────────────────────────────────
  const porCategoria = useMemo(() => {
    const acc = {}
    for (const r of fSilvia) {
      if (!r.gasto || r.gasto <= 0) continue
      const cat = r.cuenta || 'Varios'
      acc[cat] = (acc[cat] || 0) + r.gasto
    }
    // Build ordered list
    const ordered = EXPENSE_CATEGORIES.map(cat => ({
      cat,
      monto: acc[cat] || 0,
    })).filter(x => x.monto > 0)
    // Add any uncategorized
    for (const [cat, monto] of Object.entries(acc)) {
      if (!EXPENSE_CATEGORIES.includes(cat)) ordered.push({ cat, monto })
    }
    return ordered.sort((a, b) => b.monto - a.monto)
  }, [fSilvia])

  // NO-VIP: desglose de gastos por categoría, desde movimientos_caja
  // (columna `categoria`, mismo set fijo que usa CajaTemporada.jsx).
  const porCategoriaMovCaja = useMemo(() => {
    const acc = {}
    for (const m of fMovEgreso) {
      const cat = m.categoria || 'Varios'
      acc[cat] = (acc[cat] || 0) + movRowTotal(m)
    }
    return Object.entries(acc)
      .map(([cat, monto]) => ({ cat: MOV_CATEGORIA_LABEL[cat] || cat, monto }))
      .sort((a, b) => b.monto - a.monto)
  }, [fMovEgreso])

  const dPorCategoria = isVip ? porCategoria : porCategoriaMovCaja

  // El desglose por categoría de VIP sólo puede categorizar caja_silvia
  // (Banco/MP no tienen columna `cuenta`), así que su propio "TOTAL
  // GASTOS"/% tiene que quedar relativo a gastoSilvia — no al gastoTotal
  // combinado de arriba, que ahora incluye Banco/MP y haría que las
  // categorías sumen menos del 100%. Para NO-VIP no cambia nada (sigue
  // siendo dGastos, la única fuente que existe ahí).
  const dGastosCategoria = isVip ? gastoSilvia : dGastos

  // ── Monthly series (all year, for charts) ─────────────────────────────────
  const monthlySeries = useMemo(() => {
    return MESES_SHORT.map((label, m) => {
      const rs = reservas.filter(r => inPeriod(r.fecha_entrada, m, anio, false))
      const sv = silvia.filter(r => inPeriod(r.fecha, m, anio, false))
      const bc = banco.filter(r => inPeriod(r.fecha, m, anio, false))
      const mpm = mp.filter(r => inPeriod(r.fecha, m, anio, false))
      const ing = sumField(sv, 'ingreso_pesos') + sumField(sv, 'ingreso_juli') + sumField(bc, 'ingreso') + sumField(mpm, 'ingreso')
      const gas = sumField(sv, 'gasto') + sumField(bc, 'egreso') + sumField(mpm, 'egreso')
      return {
        mes: label,
        Ingresos: ing,
        Gastos: gas,
        Ganancia: ing - gas,
        Reservas: sumField(rs, 'monto_total'),
      }
    })
  }, [reservas, silvia, banco, mp, anio])

  // NO-VIP: misma serie mensual, contra movimientos_caja.
  const monthlySeriesMovCaja = useMemo(() => {
    return MESES_SHORT.map((label, m) => {
      const rs     = reservas.filter(r => inPeriod(r.fecha_entrada, m, anio, false))
      const movIng = movimientosCaja.filter(mv => mv.tipo === 'ingreso' && inPeriod(mv.fecha, m, anio, false))
      const movEg  = movimientosCaja.filter(mv => mv.tipo === 'egreso'  && inPeriod(mv.fecha, m, anio, false))
      const ing = movIng.reduce((s, mv) => s + movRowTotal(mv), 0)
      const gas = movEg.reduce((s, mv) => s + movRowTotal(mv), 0)
      return {
        mes: label,
        Ingresos: ing,
        Gastos: gas,
        Ganancia: ing - gas,
        Reservas: sumField(rs, 'monto_total'),
      }
    })
  }, [reservas, movimientosCaja, anio])

  const dMonthlySeries = isVip ? monthlySeries : monthlySeriesMovCaja

  // ── Withdrawals ────────────────────────────────────────────────────────────
  const retiros = useMemo(() =>
    fSilvia
      .filter(r => (r.retiro_pesos > 0) || (r.retiro_dolares > 0))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map(r => ({
        fecha:  r.fecha,
        detalle: r.detalle || '-',
        cuenta: r.cuenta || '-',
        retiro_pesos:   r.retiro_pesos   || 0,
        retiro_dolares: r.retiro_dolares || 0,
      })),
    [fSilvia]
  )

  const totalRetiroPesos = retiros.reduce((s,r) => s + r.retiro_pesos, 0)
  const totalRetiroUSD   = retiros.reduce((s,r) => s + r.retiro_dolares, 0)

  // NO-VIP: retiros del período (movimientos_caja, tipo='retiro').
  const retirosMovCaja = useMemo(() =>
    [...fMovRetiro].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [fMovRetiro]
  )
  const totalRetirosMovCaja = retirosMovCaja.reduce((s, m) => s + movRowTotal(m), 0)

  // NO-VIP: alta de un retiro nuevo — reusa fechaEstaCerrada (candado de
  // "Cerrar caja") y validarMontoMovimiento (mismo $0/negativo que el
  // resto de movimientos_caja), igual que ReservaPago.jsx/ReservaForm.jsx
  // ya hacen antes de escribir en esta misma tabla.
  const handleCrearRetiro = async (e) => {
    e.preventDefault()
    if (!complejoActivo) return
    setRetiroError('')

    const { valido } = validarMontoMovimiento('retiro', retiroMonto, 0, 0)
    if (!valido) {
      setRetiroError('El monto debe ser mayor a $0')
      return
    }

    const fecha = new Date().toISOString().slice(0, 10)
    setRetiroSaving(true)
    const { cierre } = await fechaEstaCerrada(supabase, complejoActivo.id, fecha)
    if (cierre) {
      setRetiroSaving(false)
      setRetiroError(`Hoy está dentro de un período ya cerrado (${labelCierre(cierre)}). Para cargar un retiro, primero borrá ese cierre.`)
      return
    }

    const { data, error } = await supabase.from('movimientos_caja').insert({
      complejo_id:     complejoActivo.id,
      tipo:            'retiro',
      categoria:       null,
      fecha,
      detalle:         retiroMotivo || null,
      monto_depositos: 0,
      monto_efectivo:  Number(retiroMonto),
      monto_otros:     0,
    }).select().single()
    setRetiroSaving(false)

    if (error) {
      setRetiroError('No se pudo guardar el retiro. Probá de nuevo.')
      return
    }
    setMovimientosCaja((prev) => [...prev, data])
    setRetiroMonto('')
    setRetiroMotivo('')
  }

  // ── Pie data ───────────────────────────────────────────────────────────────
  const pieData = porCategoria.slice(0, 12).map(x => ({ name: x.cat, value: x.monto }))
  // NO-VIP: mismo gráfico, contra el desglose de movimientos_caja.
  const pieDataMovCaja = porCategoriaMovCaja.slice(0, 12).map(x => ({ name: x.cat, value: x.monto }))
  const dPieData = isVip ? pieData : pieDataMovCaja

  // ─────────────────────────────────────────────────────────────────────────
  const periodLabel = allYear
    ? `Año ${anio}`
    : `${MESES[mes]} ${anio}`

  const TABS = [
    { id: 'resumen',  label: 'Resumen' },
    { id: 'ingresos', label: 'Ingresos' },
    { id: 'gastos',   label: 'Gastos' },
    { id: 'retiros',  label: 'Retiros' },
    { id: 'graficos', label: 'Gráficos' },
  ]

  if (loading) return <p className="text-[#888] text-center py-16">Cargando...</p>

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold text-[#111111]">Ganancias</h1>
          <p className="text-sm text-[#888]">{periodLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mes */}
          <select
            data-testid="select-ganancias-mes"
            value={mes}
            onChange={e => { setMes(Number(e.target.value)); setAllYear(false) }}
            disabled={allYear}
            className="field" style={{ width: 'auto', paddingTop: '6px', paddingBottom: '6px' }}
          >
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>

          {/* Año */}
          <select
            data-testid="select-ganancias-anio"
            value={anio}
            onChange={e => setAnio(Number(e.target.value))}
            className="field" style={{ width: 'auto', paddingTop: '6px', paddingBottom: '6px' }}
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Año completo toggle */}
          <button
            onClick={() => setAllYear(v => !v)}
            className={`px-3 py-1.5 rounded-[10px] text-sm font-medium border transition-all ${allYear ? 'bg-[#111111] text-white border-[#111111]' : 'bg-[var(--color-secundario)] text-[#333] border-[#f0e6d8] hover:border-[var(--color-primario)]'}`}
          >
            Año completo
          </button>

          {/* Export CSV */}
          <button
            onClick={() => exportCSV(
              fReservas.map(r => ({ codigo: r.codigo, cabana: r.cabana, fecha_entrada: r.fecha_entrada, monto_total: r.monto_total, estado: r.estado })),
              `ganancias_${periodLabel.replace(' ', '_')}.csv`
            )}
            className="px-3 py-1.5 rounded-[10px] text-sm font-medium border border-[#f0e6d8] bg-[var(--color-secundario)] text-[#333] hover:border-[var(--color-primario)] transition-all"
          >
            ↓ Exportar CSV
          </button>

          {/* Print PDF */}
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-[10px] text-sm font-medium border border-[#f0e6d8] bg-[var(--color-secundario)] text-[#333] hover:border-[var(--color-primario)] transition-all"
          >
            🖨 PDF
          </button>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex gap-0" style={{ borderBottom: '1px solid #f0e6d8' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === t.id
                ? 'border-[var(--color-primario)] text-[#111111]'
                : 'border-transparent text-[#888] hover:text-[#333]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*  TAB: RESUMEN                                                    */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'resumen' && (
        <div className="space-y-6">
          {/* Big cards row */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${isVip ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
            <SummaryCard
              label="Ingresos ARS"
              value={ars(dIngresos)}
              color="green"
              large
              prevValue={dPrevIngresos}
            />
            {isVip && (
              <SummaryCard
                label="Ingresos USD"
                value={usd(ingUSD)}
                color="blue"
                large
              />
            )}
            <SummaryCard
              label="Gastos totales"
              value={ars(dGastos)}
              color="red"
              large
              prevValue={dPrevGastos}
            />
            <div className="rounded-[16px] p-5 bg-[#111111]">
              <p className="text-xs font-semibold uppercase tracking-widest mb-1 text-[var(--color-secundario)]">
                Ganancia neta
              </p>
              <p className={`text-3xl font-bold ${dGanancia >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {ars(dGanancia)}
              </p>
              <div className="mt-2">
                <DeltaBadge current={dGanancia} previous={dPrevGanancia} />
              </div>
            </div>
          </div>

          {/* Secondary stats */}
          <div className={`grid grid-cols-2 sm:grid-cols-3 ${isVip ? 'lg:grid-cols-6' : 'lg:grid-cols-2'} gap-3`}>
            <SummaryCard label="Reservas" value={reservasCount} sub="del período" />
            <SummaryCard label="Facturado" value={ars(reservasIncome)} sub="monto contratado" />
            {isVip && (
              <>
                <SummaryCard label="Juli ingresos" value={ars(juliIngresos)} color="green" />
                <SummaryCard label="Juli egresos" value={ars(juliEgresos)} color="red" />
                <SummaryCard label="Retiro pesos" value={ars(retiroPesos)} />
                <SummaryCard label="Retiro USD" value={usd(retiroUSD)} />
              </>
            )}
          </div>

          {/* Quick cabin top */}
          <Section title="Top cabañas del período">
            {porCabana.length === 0 ? (
              <p className="text-[#888] text-sm">Sin reservas en este período.</p>
            ) : (
              <div className="space-y-3">
                {porCabana.slice(0, 8).map(({ cabana, reservas: cnt, monto }) => {
                  const maxMonto = porCabana[0]?.monto || 1
                  const color = getCabanaColor(cabana)
                  return (
                    <div key={cabana} className="flex items-center gap-3">
                      <div className="flex items-center gap-2 w-36 flex-shrink-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-sm font-medium text-[#333] truncate">{cabana}</span>
                      </div>
                      <div className="flex-1 bg-[#f0e6d8] rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{ width: `${(monto / maxMonto) * 100}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-[#111] w-28 text-right tabular-nums">{ars(monto)}</span>
                      <span className="text-xs text-[#888] w-20 text-right">{cnt} reserva{cnt !== 1 ? 's' : ''}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*  TAB: INGRESOS                                                   */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ingresos' && (
        <div className="space-y-6">
          <div className={isVip ? 'grid sm:grid-cols-3 lg:grid-cols-5 gap-4' : 'grid sm:grid-cols-3 gap-4'}>
            {isVip ? (
              <>
                <SummaryCard label="Ingresos ARS (Caja Silvia)" value={ars(sumField(fSilvia,'ingreso_pesos'))} color="green" />
                <SummaryCard label="Ingresos Juli (traspasados)" value={ars(sumField(fSilvia,'ingreso_juli'))} color="green" />
                <SummaryCard label="Ingresos Banco" value={ars(ingBanco)} color="green" />
                <SummaryCard label="Ingresos Mercado Pago" value={ars(ingMp)} color="green" />
                <SummaryCard label="Ingresos USD" value={usd(ingUSD)} color="blue" />
              </>
            ) : (
              <SummaryCard label="Ingresos (Caja temporada)" value={ars(ingresosMovCaja)} color="green" large />
            )}
          </div>

          <Section title="Ingresos por cabaña">
            {porCabana.length === 0 ? (
              <p className="text-gray-400 text-sm">Sin reservas en este período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#111111] text-white">
                    <th className="text-left px-4 py-2.5 rounded-tl-lg font-medium">Cabaña</th>
                    <th className="text-center px-4 py-2.5 font-medium">Reservas</th>
                    <th className="text-right px-4 py-2.5 font-medium">Monto total</th>
                    <th className="text-right px-4 py-2.5 rounded-tr-lg font-medium">% del total</th>
                  </tr>
                </thead>
                <tbody>
                  {porCabana.map(({ cabana, reservas: cnt, monto }, i) => (
                    <tr key={cabana} className={i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'}>
                      <td className="px-4 py-2.5 font-medium text-[#111]">{cabana}</td>
                      <td className="px-4 py-2.5 text-center text-[#888]">{cnt}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-green-700">{ars(monto)}</td>
                      <td className="px-4 py-2.5 text-right text-[#888]">{pct(monto, reservasIncome)}</td>
                    </tr>
                  ))}
                  <tr className="bg-[var(--color-secundario)] border-t-2 border-[#f0e6d8] font-semibold">
                    <td className="px-4 py-2.5">TOTAL</td>
                    <td className="px-4 py-2.5 text-center">{reservasCount}</td>
                    <td className="px-4 py-2.5 text-right text-green-700">{ars(reservasIncome)}</td>
                    <td className="px-4 py-2.5 text-right">100%</td>
                  </tr>
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Detalle de reservas del período">
            {fReservas.length === 0 ? (
              <p className="text-[#888] text-sm">Sin reservas en este período.</p>
            ) : (
              <div className="overflow-x-auto rounded-[12px] border border-[#f0e6d8] overflow-hidden">
                <table className="w-full text-sm" style={{ minWidth: 640 }}>
                  <thead>
                    <tr className="bg-[#111111] text-white">
                      <th className="w-8 px-3 py-2.5"></th>
                      <th className="text-left px-3 py-2.5 font-medium">Reserva</th>
                      <th className="text-left px-3 py-2.5 font-medium">Cabaña</th>
                      <th className="text-right px-3 py-2.5 font-medium">Monto total</th>
                      <th className="text-right px-3 py-2.5 font-medium">Cobrado</th>
                      <th className="text-right px-3 py-2.5 font-medium">A cobrar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fReservas.flatMap((r, i) => {
                      const cobrado = (r.sena1_monto || 0) + (r.sena2_monto || 0) + (r.pago_cabana_monto || 0)
                      const aCobrar = (r.monto_total || 0) - cobrado
                      const isExp = expandedRows.has(r.id)
                      const toggle = () => setExpandedRows(prev => {
                        const next = new Set(prev)
                        if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                        return next
                      })
                      const payments = [
                        r.sena1_monto      ? { label: '1ª Seña',         tipo: r.sena1_tipo || 'Banco',    fecha: r.sena1_fecha,       monto: r.sena1_monto      } : null,
                        r.sena2_monto      ? { label: '2ª Seña',         tipo: r.sena2_tipo || 'Banco',    fecha: r.sena2_fecha,       monto: r.sena2_monto      } : null,
                        r.pago_cabana_monto? { label: 'Pago en cabaña',  tipo: 'Efectivo',                  fecha: r.pago_cabana_fecha, monto: r.pago_cabana_monto} : null,
                      ].filter(Boolean)
                      const tipoCls = (t) => t === 'Banco' ? 'bg-green-50 text-green-700' : t === 'Mercado Pago' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'
                      const bg = i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'
                      return [
                        <tr key={r.id} className={`border-b border-[#f0e6d8] ${bg} hover:bg-[var(--color-fila-hover)] cursor-pointer select-none`} onClick={toggle}>
                          <td className="px-3 py-2.5 text-center text-[#aaa] text-xs">{isExp ? '▲' : '▼'}</td>
                          <td className="px-3 py-2.5">
                            <span className="font-mono text-xs text-[#888] mr-1.5">{r.codigo}</span>
                            <span className="text-[#333]">{r.nombre_apellido}</span>
                          </td>
                          <td className="px-3 py-2.5 text-[#888]">{r.cabana}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-[#111]">{ars(r.monto_total)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-green-700">{cobrado > 0 ? ars(cobrado) : '—'}</td>
                          <td className="px-3 py-2.5 text-right font-semibold">{aCobrar > 0 ? <span className="text-red-600">{ars(aCobrar)}</span> : <span className="text-[#aaa]">—</span>}</td>
                        </tr>,
                        isExp && payments.length > 0 ? (
                          <tr key={`${r.id}-d`} className={bg}>
                            <td colSpan={6} className="px-6 pb-3 pt-1">
                              <div className="flex flex-wrap gap-2">
                                {payments.map((p, pi) => (
                                  <span key={pi} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-xs font-medium ${tipoCls(p.tipo)}`}>
                                    <span className="font-semibold">{p.label}</span>
                                    <span className="opacity-40">·</span>
                                    <span>{p.fecha || 'sin fecha'}</span>
                                    <span className="opacity-40">·</span>
                                    <span>{p.tipo}</span>
                                    <span className="opacity-40">·</span>
                                    <span className="font-bold">{ars(p.monto)}</span>
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ) : null,
                      ].filter(Boolean)
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {isVip ? (
            <Section title="Detalle Caja Silvia — ingresos del período">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#111111] text-white">
                    <th className="text-left px-3 py-2.5 rounded-tl-lg font-medium">Fecha</th>
                    <th className="text-left px-3 py-2.5 font-medium">Detalle</th>
                    <th className="text-right px-3 py-2.5 font-medium">Ingreso $</th>
                    <th className="text-right px-3 py-2.5 font-medium">Ing. Juli</th>
                    <th className="text-right px-3 py-2.5 rounded-tr-lg font-medium">Ing. USD</th>
                  </tr>
                </thead>
                <tbody>
                  {fSilvia.filter(r => r.ingreso_pesos > 0 || r.ingreso_juli > 0 || r.ingreso_dolares > 0)
                    .sort((a,b) => a.fecha.localeCompare(b.fecha))
                    .map((r, i) => (
                      <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'}>
                        <td className="px-3 py-2 text-[#888]">{r.fecha}</td>
                        <td className="px-3 py-2 text-[#333]">{r.detalle || '-'}</td>
                        <td className="px-3 py-2 text-right text-green-700 font-medium">{r.ingreso_pesos > 0 ? ars(r.ingreso_pesos) : '-'}</td>
                        <td className="px-3 py-2 text-right text-blue-700 font-medium">{r.ingreso_juli > 0 ? ars(r.ingreso_juli) : '-'}</td>
                        <td className="px-3 py-2 text-right text-indigo-700 font-medium">{r.ingreso_dolares > 0 ? usd(r.ingreso_dolares) : '-'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Section>
          ) : null}

          {isVip && (
            <>
              <Section title="Detalle Caja Banco — ingresos del período">
                {fBanco.filter(r => r.ingreso > 0).length === 0 ? (
                  <p className="text-gray-400 text-sm">Sin ingresos por transferencia bancaria en este período.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#111111] text-white">
                        <th className="text-left px-3 py-2.5 rounded-tl-lg font-medium">Fecha</th>
                        <th className="text-left px-3 py-2.5 font-medium">Detalle</th>
                        <th className="text-right px-3 py-2.5 rounded-tr-lg font-medium">Ingreso $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fBanco.filter(r => r.ingreso > 0).sort((a,b) => a.fecha.localeCompare(b.fecha)).map((r, i) => (
                        <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'}>
                          <td className="px-3 py-2 text-[#888]">{r.fecha}</td>
                          <td className="px-3 py-2 text-[#333]">{r.detalle || '-'}</td>
                          <td className="px-3 py-2 text-right text-green-700 font-medium">{ars(r.ingreso)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>

              <Section title="Detalle Caja Mercado Pago — ingresos del período">
                {fMp.filter(r => r.ingreso > 0).length === 0 ? (
                  <p className="text-gray-400 text-sm">Sin ingresos por Mercado Pago en este período.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#111111] text-white">
                        <th className="text-left px-3 py-2.5 rounded-tl-lg font-medium">Fecha</th>
                        <th className="text-left px-3 py-2.5 font-medium">Detalle</th>
                        <th className="text-right px-3 py-2.5 rounded-tr-lg font-medium">Ingreso $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fMp.filter(r => r.ingreso > 0).sort((a,b) => a.fecha.localeCompare(b.fecha)).map((r, i) => (
                        <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'}>
                          <td className="px-3 py-2 text-[#888]">{r.fecha}</td>
                          <td className="px-3 py-2 text-[#333]">{r.detalle || '-'}</td>
                          <td className="px-3 py-2 text-right text-green-700 font-medium">{ars(r.ingreso)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>
            </>
          )}

          {!isVip && (
            <Section title="Detalle de ingresos — Caja temporada">
              {fMovIngreso.length === 0 ? (
                <p className="text-gray-400 text-sm">Sin ingresos registrados en este período.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#111111] text-white">
                      <th className="text-left px-3 py-2.5 rounded-tl-lg font-medium">Fecha</th>
                      <th className="text-left px-3 py-2.5 font-medium">Detalle</th>
                      <th className="text-right px-3 py-2.5 rounded-tr-lg font-medium">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...fMovIngreso].sort((a,b) => a.fecha.localeCompare(b.fecha)).map((m, i) => (
                      <tr key={m.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'}>
                        <td className="px-3 py-2 text-[#888]">{m.fecha}</td>
                        <td className="px-3 py-2 text-[#333]">{m.detalle || '-'}</td>
                        <td className="px-3 py-2 text-right text-green-700 font-medium">{ars(movRowTotal(m))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*  TAB: GASTOS                                                      */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'gastos' && (
        <div className="space-y-6">
          <div className={isVip ? 'grid sm:grid-cols-3 lg:grid-cols-5 gap-4' : 'grid sm:grid-cols-3 gap-4'}>
            {isVip ? (
              <>
                <SummaryCard label="Gastos Caja Silvia" value={ars(gastoSilvia)} color="red" />
                <SummaryCard label="Gastos Banco" value={ars(egresoBanco)} color="red" />
                <SummaryCard label="Gastos Mercado Pago" value={ars(egresoMp)} color="red" />
                <SummaryCard label="Gastos Juli (neto)" value={ars(juliGastos)} color="red" />
                <SummaryCard label="Total gastos combinados" value={ars(gastoTotal + juliGastos)} color="red" large />
              </>
            ) : (
              <SummaryCard label="Gastos (Caja temporada)" value={ars(gastosMovCaja)} color="red" large />
            )}
          </div>

          <Section title={isVip ? 'Desglose de gastos por categoría — Caja Silvia' : 'Desglose de gastos por categoría — Caja temporada'}>
            {dPorCategoria.length === 0 ? (
              <p className="text-gray-400 text-sm">Sin gastos registrados en este período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#111111] text-white">
                    <th className="text-left px-4 py-2.5 rounded-tl-lg font-medium">Categoría</th>
                    <th className="text-right px-4 py-2.5 font-medium">Monto</th>
                    <th className="text-right px-4 py-2.5 font-medium">% del total</th>
                    <th className="text-left px-4 py-2.5 rounded-tr-lg font-medium w-48">Proporción</th>
                  </tr>
                </thead>
                <tbody>
                  {dPorCategoria.map(({ cat, monto }, i) => (
                    <tr key={cat} className={i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'}>
                      <td className="px-4 py-2.5 text-gray-800 font-medium">{cat}</td>
                      <td className="px-4 py-2.5 text-right text-red-700 font-semibold">{ars(monto)}</td>
                      <td className="px-4 py-2.5 text-right text-[#888]">{pct(monto, dGastosCategoria)}</td>
                      <td className="px-4 py-2.5">
                        <div className="bg-[#f0e6d8] rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-red-400"
                            style={{ width: `${(monto / (dPorCategoria[0]?.monto || 1)) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[var(--color-secundario)] border-t-2 border-[#f0e6d8] font-semibold">
                    <td className="px-4 py-2.5">TOTAL GASTOS{isVip ? ' (Caja Silvia)' : ''}</td>
                    <td className="px-4 py-2.5 text-right text-red-700">{ars(dGastosCategoria)}</td>
                    <td className="px-4 py-2.5 text-right">100%</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            )}
          </Section>

          {/* Banco / Mercado Pago — sin columna de categoría (no tienen `cuenta`),
              así que se listan como detalle de egresos, no en la tabla de arriba. */}
          {isVip && (
            <>
              <Section title="Detalle Caja Banco — egresos del período">
                {fBanco.filter(r => r.egreso > 0).length === 0 ? (
                  <p className="text-gray-400 text-sm">Sin egresos por transferencia bancaria en este período.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#111111] text-white">
                        <th className="text-left px-3 py-2.5 rounded-tl-lg font-medium">Fecha</th>
                        <th className="text-left px-3 py-2.5 font-medium">Detalle</th>
                        <th className="text-right px-3 py-2.5 rounded-tr-lg font-medium">Egreso $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fBanco.filter(r => r.egreso > 0).sort((a,b) => a.fecha.localeCompare(b.fecha)).map((r, i) => (
                        <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'}>
                          <td className="px-3 py-2 text-[#888]">{r.fecha}</td>
                          <td className="px-3 py-2 text-[#333]">{r.detalle || '-'}</td>
                          <td className="px-3 py-2 text-right text-red-700 font-medium">{ars(r.egreso)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>

              <Section title="Detalle Caja Mercado Pago — egresos del período">
                {fMp.filter(r => r.egreso > 0).length === 0 ? (
                  <p className="text-gray-400 text-sm">Sin egresos por Mercado Pago en este período.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#111111] text-white">
                        <th className="text-left px-3 py-2.5 rounded-tl-lg font-medium">Fecha</th>
                        <th className="text-left px-3 py-2.5 font-medium">Detalle</th>
                        <th className="text-right px-3 py-2.5 rounded-tr-lg font-medium">Egreso $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fMp.filter(r => r.egreso > 0).sort((a,b) => a.fecha.localeCompare(b.fecha)).map((r, i) => (
                        <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'}>
                          <td className="px-3 py-2 text-[#888]">{r.fecha}</td>
                          <td className="px-3 py-2 text-[#333]">{r.detalle || '-'}</td>
                          <td className="px-3 py-2 text-right text-red-700 font-medium">{ars(r.egreso)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>
            </>
          )}

          {/* Juli gastos section — específica de Cabañas VIP, sin equivalente NO-VIP */}
          {isVip && (
            <Section title="Gastos Caja Juli — efectivo / Mercado Pago">
              {fJuliGastos.length === 0 ? (
                <p className="text-gray-400 text-sm">Sin gastos registrados.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#111111] text-white">
                      <th className="text-left px-3 py-2.5 rounded-tl-lg font-medium">Fecha</th>
                      <th className="text-left px-3 py-2.5 font-medium">Detalle</th>
                      <th className="text-left px-3 py-2.5 font-medium">Modalidad</th>
                      <th className="text-right px-3 py-2.5 font-medium">Importe</th>
                      <th className="text-right px-3 py-2.5 font-medium">Devolución</th>
                      <th className="text-right px-3 py-2.5 rounded-tr-lg font-medium">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fJuliGastos.sort((a,b) => a.fecha.localeCompare(b.fecha)).map((r, i) => (
                      <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'}>
                        <td className="px-3 py-2 text-[#888]">{r.fecha}</td>
                        <td className="px-3 py-2 text-[#333]">{r.detalle || '-'}</td>
                        <td className="px-3 py-2 text-[#888]">{r.modalidad_pago || '-'}</td>
                        <td className="px-3 py-2 text-right text-red-700">{ars(r.importe)}</td>
                        <td className="px-3 py-2 text-right text-green-700">{r.devolucion > 0 ? ars(r.devolucion) : '-'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-red-800">{ars((r.importe||0) - (r.devolucion||0))}</td>
                      </tr>
                    ))}
                    <tr className="bg-[var(--color-secundario)] border-t-2 border-[#f0e6d8] font-semibold">
                      <td colSpan={5} className="px-3 py-2.5">TOTAL neto Juli gastos</td>
                      <td className="px-3 py-2.5 text-right text-red-700">{ars(juliGastos)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </Section>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*  TAB: RETIROS                                                     */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'retiros' && (
        isVip ? (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-3 gap-4">
              <SummaryCard label="Total retiro pesos" value={ars(totalRetiroPesos)} />
              <SummaryCard label="Total retiro USD" value={usd(totalRetiroUSD)} />
              <SummaryCard label="Movimientos de retiro" value={retiros.length} />
            </div>

            <Section title="Tabla de retiros del período">
              {retiros.length === 0 ? (
                <p className="text-gray-400 text-sm">Sin retiros en este período.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#111111] text-white">
                      <th className="text-left px-4 py-2.5 rounded-tl-lg font-medium">Fecha</th>
                      <th className="text-left px-4 py-2.5 font-medium">Cuenta</th>
                      <th className="text-left px-4 py-2.5 font-medium">Detalle</th>
                      <th className="text-right px-4 py-2.5 font-medium">Retiro $</th>
                      <th className="text-right px-4 py-2.5 rounded-tr-lg font-medium">Retiro USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retiros.map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'}>
                        <td className="px-4 py-2.5 text-[#888]">{r.fecha}</td>
                        <td className="px-4 py-2.5 text-[#333]">{r.cuenta}</td>
                        <td className="px-4 py-2.5 text-[#333]">{r.detalle}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-[#111]">{r.retiro_pesos > 0 ? ars(r.retiro_pesos) : '-'}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-indigo-700">{r.retiro_dolares > 0 ? usd(r.retiro_dolares) : '-'}</td>
                      </tr>
                    ))}
                    <tr className="bg-[var(--color-secundario)] border-t-2 border-[#f0e6d8] font-semibold">
                      <td colSpan={3} className="px-4 py-2.5">TOTAL</td>
                      <td className="px-4 py-2.5 text-right text-[#111]">{ars(totalRetiroPesos)}</td>
                      <td className="px-4 py-2.5 text-right text-indigo-700">{usd(totalRetiroUSD)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </Section>
          </div>
        ) : (
          <div className="space-y-6">
            <Section title="Nuevo retiro">
              <form onSubmit={handleCrearRetiro} className="grid sm:grid-cols-[200px_1fr_auto] gap-3 items-end">
                <div>
                  <label className="text-xs font-medium text-[#888] block mb-1">Monto</label>
                  <input
                    type="number" min="0.01" step="0.01" required
                    data-testid="input-retiro-monto"
                    value={retiroMonto}
                    onChange={(e) => setRetiroMonto(e.target.value)}
                    className="field"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#888] block mb-1">Motivo</label>
                  <input
                    type="text"
                    data-testid="input-retiro-motivo"
                    value={retiroMotivo}
                    onChange={(e) => setRetiroMotivo(e.target.value)}
                    placeholder="Nombre de quien retira, o cualquier otro motivo"
                    className="field"
                  />
                </div>
                <button type="submit" disabled={retiroSaving} data-testid="btn-guardar-retiro" className="btn-primary h-fit">
                  {retiroSaving ? 'Guardando...' : 'Registrar retiro'}
                </button>
              </form>
              {retiroError && <p data-testid="retiro-error" className="text-sm text-red-600 mt-3">{retiroError}</p>}
            </Section>

            <Section title="Retiros del período">
              {retirosMovCaja.length === 0 ? (
                <p className="text-gray-400 text-sm">Sin retiros en este período.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#111111] text-white">
                      <th className="text-left px-4 py-2.5 rounded-tl-lg font-medium">Fecha</th>
                      <th className="text-left px-4 py-2.5 font-medium">Motivo</th>
                      <th className="text-right px-4 py-2.5 rounded-tr-lg font-medium">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retirosMovCaja.map((m) => (
                      <tr key={m.id} className="border-b border-[#f0e6d8]">
                        <td className="px-4 py-2.5 text-[#888]">{m.fecha}</td>
                        <td className="px-4 py-2.5 text-[#333]">{m.detalle || '-'}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-[#111]">{ars(movRowTotal(m))}</td>
                      </tr>
                    ))}
                    <tr className="bg-[var(--color-secundario)] border-t-2 border-[#f0e6d8] font-semibold">
                      <td colSpan={2} className="px-4 py-2.5">TOTAL</td>
                      <td className="px-4 py-2.5 text-right text-[#111]">{ars(totalRetirosMovCaja)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </Section>
          </div>
        )
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*  TAB: GRÁFICOS                                                    */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'graficos' && (
        <div className="space-y-6">
          {/* Bar chart: ingresos vs gastos por mes */}
          <Section title={`Ingresos vs Gastos por mes — ${anio}`}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={dMonthlySeries} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(val, name) => [ars(val), name]}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                />
                <Legend />
                <Bar dataKey="Ingresos" fill="#22c55e" radius={[3,3,0,0]} />
                <Bar dataKey="Gastos"   fill="#ef4444" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Section>

          {/* Line chart: ganancia neta */}
          <Section title={`Tendencia de ganancia neta — ${anio}`}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={dMonthlySeries} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(val) => [ars(val), 'Ganancia neta']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="Ganancia"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={{ fill: '#3b82f6', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Section>

          {/* Pie chart: distribución de gastos */}
          <div className="grid md:grid-cols-2 gap-6">
            <Section title="Distribución de gastos por categoría">
              {dPieData.length === 0 ? (
                <p className="text-gray-400 text-sm">Sin gastos en el período seleccionado.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={dPieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      dataKey="value"
                      label={({ name, percent }) => `${name.length > 12 ? name.slice(0,12)+'…' : name} ${(percent*100).toFixed(0)}%`}
                      labelLine={false}
                      fontSize={10}
                    >
                      {dPieData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => ars(val)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Section>

            {/* Pie legend */}
            <Section title="Detalle categorías">
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {dPieData.map(({ name, value }, idx) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                      />
                      <span className="text-[#333]">{name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[#888] text-xs">{pct(value, dGastosCategoria)}</span>
                      <span className="font-semibold text-red-700 w-28 text-right">{ars(value)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* Bar chart: ingresos por cabaña */}
          <Section title="Ingresos por cabaña del período">
            {porCabana.length === 0 ? (
              <p className="text-gray-400 text-sm">Sin reservas en este período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={porCabana.slice(0, 15)}
                  layout="vertical"
                  margin={{ top: 5, right: 60, left: 90, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="cabana" tick={{ fontSize: 11 }} width={85} />
                  <Tooltip formatter={(val) => [ars(val), 'Monto']} />
                  <Bar dataKey="monto" fill="#3b82f6" radius={[0,3,3,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Section>
        </div>
      )}
    </div>
  )
}

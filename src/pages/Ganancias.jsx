import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseISO, getMonth, getYear, format, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts'
import { getCabanaColor } from '../lib/cabanas'

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

function ars(v) {
  if (!v && v !== 0) return '-'
  return `$${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}
function usd(v) {
  if (!v && v !== 0) return '-'
  return `U$D ${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
}
function pct(part, total) {
  if (!total) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

function inPeriod(dateStr, mes, anio, allYear) {
  if (!dateStr) return false
  const d = parseISO(dateStr)
  if (allYear) return getYear(d) === anio
  return getMonth(d) === mes && getYear(d) === anio
}

function sumField(arr, field) {
  return arr.reduce((s, r) => s + (Number(r[field]) || 0), 0)
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
    green:  { bg: 'bg-[#fee7ef] border border-[#f0e6d8]', label: 'text-green-600', val: 'text-green-700' },
    red:    { bg: 'bg-[#fee7ef] border border-[#f0e6d8]', label: 'text-red-600',   val: 'text-red-700' },
    blue:   { bg: 'bg-[#fee7ef] border border-[#f0e6d8]', label: 'text-[#d2ab84]', val: 'text-[#c49870]' },
    gray:   { bg: 'bg-[#fee7ef] border border-[#f0e6d8]', label: 'text-[#888]',    val: 'text-[#111111]' },
    dark:   { bg: 'bg-[#111111]',                          label: 'text-[#d2ab84]', val: 'text-white' },
  }
  const c = colors[color]
  return (
    <div className={`${c.bg} rounded-[16px] p-5`}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${c.label}`}>{label}</p>
      <p className={`font-bold ${c.val} ${large ? 'text-3xl' : 'text-2xl'}`}>{value}</p>
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function Ganancias() {
  const [reservas, setReservas]       = useState([])
  const [silvia, setSilvia]           = useState([])
  const [juli, setJuli]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [mes, setMes]                 = useState(new Date().getMonth())
  const [anio, setAnio]               = useState(currentYear)
  const [allYear, setAllYear]         = useState(false)
  const [activeTab, setActiveTab]     = useState('resumen')
  const [expandedRows, setExpandedRows] = useState(new Set())

  useEffect(() => {
    Promise.all([
      supabase.from('reservas').select('*').neq('estado', 'Cancelada'),
      supabase.from('caja_silvia').select('*'),
      supabase.from('caja_juli').select('*'),
    ]).then(([r, s, j]) => {
      setReservas(r.data || [])
      setSilvia(s.data || [])
      setJuli(j.data || [])
      setLoading(false)
    })
  }, [])

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

  // ── Previous period (for delta comparison) ─────────────────────────────────
  const prevDate  = subMonths(new Date(anio, mes, 1), 1)
  const prevMes   = getMonth(prevDate)
  const prevAnio  = getYear(prevDate)

  const pSilvia = useMemo(() =>
    silvia.filter(r => inPeriod(r.fecha, prevMes, prevAnio, false)),
    [silvia, prevMes, prevAnio]
  )
  const prevIngARS = sumField(pSilvia, 'ingreso_pesos') + sumField(pSilvia, 'ingreso_juli')
  const prevGastos = sumField(pSilvia, 'gasto')
  const prevGanancia = prevIngARS - prevGastos

  // ── Income totals ──────────────────────────────────────────────────────────
  const ingARS     = sumField(fSilvia, 'ingreso_pesos') + sumField(fSilvia, 'ingreso_juli')
  const ingUSD     = sumField(fSilvia, 'ingreso_dolares')
  const gastoTotal = sumField(fSilvia, 'gasto')
  const retiroPesos  = sumField(fSilvia, 'retiro_pesos')
  const retiroUSD    = sumField(fSilvia, 'retiro_dolares')
  const ganancia   = ingARS - gastoTotal

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

  // ── Monthly series (all year, for charts) ─────────────────────────────────
  const monthlySeries = useMemo(() => {
    return MESES_SHORT.map((label, m) => {
      const rs = reservas.filter(r => inPeriod(r.fecha_entrada, m, anio, false))
      const sv = silvia.filter(r => inPeriod(r.fecha, m, anio, false))
      const ing = sumField(sv, 'ingreso_pesos') + sumField(sv, 'ingreso_juli')
      const gas = sumField(sv, 'gasto')
      return {
        mes: label,
        Ingresos: ing,
        Gastos: gas,
        Ganancia: ing - gas,
        Reservas: sumField(rs, 'monto_total'),
      }
    })
  }, [reservas, silvia, anio])

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

  // ── Pie data ───────────────────────────────────────────────────────────────
  const pieData = porCategoria.slice(0, 12).map(x => ({ name: x.cat, value: x.monto }))

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
            value={mes}
            onChange={e => { setMes(Number(e.target.value)); setAllYear(false) }}
            disabled={allYear}
            className="field" style={{ width: 'auto', paddingTop: '6px', paddingBottom: '6px' }}
          >
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>

          {/* Año */}
          <select
            value={anio}
            onChange={e => setAnio(Number(e.target.value))}
            className="field" style={{ width: 'auto', paddingTop: '6px', paddingBottom: '6px' }}
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Año completo toggle */}
          <button
            onClick={() => setAllYear(v => !v)}
            className={`px-3 py-1.5 rounded-[10px] text-sm font-medium border transition-all ${allYear ? 'bg-[#111111] text-white border-[#111111]' : 'bg-[#fee7ef] text-[#333] border-[#f0e6d8] hover:border-[#d2ab84]'}`}
          >
            Año completo
          </button>

          {/* Export CSV */}
          <button
            onClick={() => exportCSV(
              fReservas.map(r => ({ codigo: r.codigo, cabana: r.cabana, fecha_entrada: r.fecha_entrada, monto_total: r.monto_total, estado: r.estado })),
              `ganancias_${periodLabel.replace(' ', '_')}.csv`
            )}
            className="px-3 py-1.5 rounded-[10px] text-sm font-medium border border-[#f0e6d8] bg-[#fee7ef] text-[#333] hover:border-[#d2ab84] transition-all"
          >
            ↓ Exportar CSV
          </button>

          {/* Print PDF */}
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-[10px] text-sm font-medium border border-[#f0e6d8] bg-[#fee7ef] text-[#333] hover:border-[#d2ab84] transition-all"
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
                ? 'border-[#d2ab84] text-[#111111]'
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              label="Ingresos ARS"
              value={ars(ingARS)}
              color="green"
              large
              prevValue={prevIngARS}
            />
            <SummaryCard
              label="Ingresos USD"
              value={usd(ingUSD)}
              color="blue"
              large
            />
            <SummaryCard
              label="Gastos totales"
              value={ars(gastoTotal)}
              color="red"
              large
              prevValue={prevGastos}
            />
            <div className="rounded-[16px] p-5 bg-[#111111]">
              <p className="text-xs font-semibold uppercase tracking-widest mb-1 text-[#d2ab84]">
                Ganancia neta
              </p>
              <p className={`text-3xl font-bold ${ganancia >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {ars(ganancia)}
              </p>
              <div className="mt-2">
                <DeltaBadge current={ganancia} previous={prevGanancia} />
              </div>
            </div>
          </div>

          {/* Secondary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard label="Reservas" value={reservasCount} sub="del período" />
            <SummaryCard label="Facturado" value={ars(reservasIncome)} sub="monto contratado" />
            <SummaryCard label="Juli ingresos" value={ars(juliIngresos)} color="green" />
            <SummaryCard label="Juli egresos" value={ars(juliEgresos)} color="red" />
            <SummaryCard label="Retiro pesos" value={ars(retiroPesos)} />
            <SummaryCard label="Retiro USD" value={usd(retiroUSD)} />
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
          <div className="grid sm:grid-cols-3 gap-4">
            <SummaryCard label="Ingresos ARS (Caja Silvia)" value={ars(sumField(fSilvia,'ingreso_pesos'))} color="green" />
            <SummaryCard label="Ingresos Juli (traspasados)" value={ars(sumField(fSilvia,'ingreso_juli'))} color="green" />
            <SummaryCard label="Ingresos USD" value={usd(ingUSD)} color="blue" />
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
                    <tr key={cabana} className={i % 2 === 0 ? 'bg-white' : 'bg-[#fee7ef]'}>
                      <td className="px-4 py-2.5 font-medium text-[#111]">{cabana}</td>
                      <td className="px-4 py-2.5 text-center text-[#888]">{cnt}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-green-700">{ars(monto)}</td>
                      <td className="px-4 py-2.5 text-right text-[#888]">{pct(monto, reservasIncome)}</td>
                    </tr>
                  ))}
                  <tr className="bg-[#fee7ef] border-t-2 border-[#f0e6d8] font-semibold">
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
                      const bg = i % 2 === 0 ? 'bg-white' : 'bg-[#fee7ef]'
                      return [
                        <tr key={r.id} className={`border-b border-[#f0e6d8] ${bg} hover:bg-[#fff4e8] cursor-pointer select-none`} onClick={toggle}>
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
                    <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#fee7ef]'}>
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
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*  TAB: GASTOS                                                      */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'gastos' && (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-3 gap-4">
            <SummaryCard label="Gastos Caja Silvia" value={ars(gastoTotal)} color="red" />
            <SummaryCard label="Gastos Juli (neto)" value={ars(juliGastos)} color="red" />
            <SummaryCard label="Total gastos combinados" value={ars(gastoTotal + juliGastos)} color="red" large />
          </div>

          <Section title="Desglose de gastos por categoría — Caja Silvia">
            {porCategoria.length === 0 ? (
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
                  {porCategoria.map(({ cat, monto }, i) => (
                    <tr key={cat} className={i % 2 === 0 ? 'bg-white' : 'bg-[#fee7ef]'}>
                      <td className="px-4 py-2.5 text-gray-800 font-medium">{cat}</td>
                      <td className="px-4 py-2.5 text-right text-red-700 font-semibold">{ars(monto)}</td>
                      <td className="px-4 py-2.5 text-right text-[#888]">{pct(monto, gastoTotal)}</td>
                      <td className="px-4 py-2.5">
                        <div className="bg-[#f0e6d8] rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-red-400"
                            style={{ width: `${(monto / (porCategoria[0]?.monto || 1)) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[#fee7ef] border-t-2 border-[#f0e6d8] font-semibold">
                    <td className="px-4 py-2.5">TOTAL GASTOS</td>
                    <td className="px-4 py-2.5 text-right text-red-700">{ars(gastoTotal)}</td>
                    <td className="px-4 py-2.5 text-right">100%</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            )}
          </Section>

          {/* Juli gastos section */}
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
                    <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#fee7ef]'}>
                      <td className="px-3 py-2 text-[#888]">{r.fecha}</td>
                      <td className="px-3 py-2 text-[#333]">{r.detalle || '-'}</td>
                      <td className="px-3 py-2 text-[#888]">{r.modalidad_pago || '-'}</td>
                      <td className="px-3 py-2 text-right text-red-700">{ars(r.importe)}</td>
                      <td className="px-3 py-2 text-right text-green-700">{r.devolucion > 0 ? ars(r.devolucion) : '-'}</td>
                      <td className="px-3 py-2 text-right font-semibold text-red-800">{ars((r.importe||0) - (r.devolucion||0))}</td>
                    </tr>
                  ))}
                  <tr className="bg-[#fee7ef] border-t-2 border-[#f0e6d8] font-semibold">
                    <td colSpan={5} className="px-3 py-2.5">TOTAL neto Juli gastos</td>
                    <td className="px-3 py-2.5 text-right text-red-700">{ars(juliGastos)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </Section>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*  TAB: RETIROS                                                     */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'retiros' && (
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
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#fee7ef]'}>
                      <td className="px-4 py-2.5 text-[#888]">{r.fecha}</td>
                      <td className="px-4 py-2.5 text-[#333]">{r.cuenta}</td>
                      <td className="px-4 py-2.5 text-[#333]">{r.detalle}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-[#111]">{r.retiro_pesos > 0 ? ars(r.retiro_pesos) : '-'}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-indigo-700">{r.retiro_dolares > 0 ? usd(r.retiro_dolares) : '-'}</td>
                    </tr>
                  ))}
                  <tr className="bg-[#fee7ef] border-t-2 border-[#f0e6d8] font-semibold">
                    <td colSpan={3} className="px-4 py-2.5">TOTAL</td>
                    <td className="px-4 py-2.5 text-right text-[#111]">{ars(totalRetiroPesos)}</td>
                    <td className="px-4 py-2.5 text-right text-indigo-700">{usd(totalRetiroUSD)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </Section>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*  TAB: GRÁFICOS                                                    */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'graficos' && (
        <div className="space-y-6">
          {/* Bar chart: ingresos vs gastos por mes */}
          <Section title={`Ingresos vs Gastos por mes — ${anio}`}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthlySeries} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
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
              <LineChart data={monthlySeries} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
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
              {pieData.length === 0 ? (
                <p className="text-gray-400 text-sm">Sin gastos en el período seleccionado.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      dataKey="value"
                      label={({ name, percent }) => `${name.length > 12 ? name.slice(0,12)+'…' : name} ${(percent*100).toFixed(0)}%`}
                      labelLine={false}
                      fontSize={10}
                    >
                      {pieData.map((_, idx) => (
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
                {pieData.map(({ name, value }, idx) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                      />
                      <span className="text-[#333]">{name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[#888] text-xs">{pct(value, gastoTotal)}</span>
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

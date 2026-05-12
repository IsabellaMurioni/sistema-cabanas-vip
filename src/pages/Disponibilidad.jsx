import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CABANAS, getCabanaColor } from '../lib/cabanas'
import {
  addDays, addMonths, subMonths, differenceInDays,
  startOfMonth, getDaysInMonth, getDay,
  format, parseISO, isSameDay,
} from 'date-fns'
import { es } from 'date-fns/locale'

const DAY_W = 38

const ESTADO_STYLES = {
  Pendiente:  'bg-yellow-100 text-yellow-800',
  Confirmada: 'bg-green-100 text-green-800',
  Finalizada: 'bg-blue-100 text-blue-800',
  Cancelada:  'bg-red-100 text-red-800',
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function todayStr() {
  return format(startOfToday(), 'yyyy-MM-dd')
}

// ── CalendarPicker ──────────────────────────────────────────
function CalendarPicker({ value, onChange, label }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(startOfMonth(value))
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const year = view.getFullYear()
  const month = view.getMonth()
  const daysCount = getDaysInMonth(new Date(year, month))
  const firstDow = getDay(startOfMonth(new Date(year, month)))
  const today = startOfToday()

  return (
    <div className="relative" ref={ref}>
      <div>
        {label && <p className="text-xs text-gray-500 mb-1 font-medium">{label}</p>}
        <button
          type="button"
          onClick={() => { setView(startOfMonth(value)); setOpen(!open) }}
          className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white hover:border-primary-500 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="font-medium text-gray-700 capitalize">
            {format(value, "d 'de' MMMM yyyy", { locale: es })}
          </span>
          <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 z-40 p-4 w-72">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setView(subMonths(view, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 font-bold text-lg transition-colors"
            >‹</button>
            <span className="font-semibold text-sm text-gray-800 capitalize">
              {format(view, 'MMMM yyyy', { locale: es })}
            </span>
            <button
              type="button"
              onClick={() => setView(addMonths(view, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 font-bold text-lg transition-colors"
            >›</button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {['Do','Lu','Ma','Mi','Ju','Vi','Sa'].map((d) => (
              <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {Array(firstDow).fill(null).map((_, i) => <div key={`p${i}`} />)}
            {Array.from({ length: daysCount }, (_, i) => i + 1).map((day) => {
              const date = new Date(year, month, day)
              const selected = isSameDay(date, value)
              const isT = isSameDay(date, today)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => { onChange(date); setOpen(false) }}
                  className={`
                    h-8 w-full rounded-lg text-xs font-medium transition-colors
                    ${selected ? 'bg-primary-600 text-white shadow-sm' : isT ? 'bg-orange-100 text-orange-700 font-bold' : 'hover:bg-gray-100 text-gray-700'}
                  `}
                >
                  {day}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => { onChange(today); setOpen(false) }}
            className="w-full mt-3 text-xs text-primary-600 hover:underline text-center"
          >
            Ir a hoy
          </button>
        </div>
      )}
    </div>
  )
}

// ── DayHeaders ──────────────────────────────────────────────
function DayHeaders({ startDate, numDays }) {
  const today = startOfToday()
  return (
    <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
      {Array.from({ length: numDays }, (_, i) => {
        const day = addDays(startDate, i)
        const dow = getDay(day)
        const isWeekend = dow === 0 || dow === 6
        const isToday = isSameDay(day, today)
        return (
          <div
            key={i}
            style={{ width: DAY_W, minWidth: DAY_W, flexShrink: 0 }}
            className={`
              text-center py-2 border-r border-gray-100 select-none
              ${isWeekend ? 'bg-gray-100' : ''}
              ${isToday ? 'bg-orange-50' : ''}
            `}
          >
            <div className={`text-xs font-bold leading-tight ${isToday ? 'text-orange-600' : 'text-gray-700'}`}>
              {format(day, 'd')}
            </div>
            <div className={`leading-tight capitalize ${isToday ? 'text-orange-400' : 'text-gray-400'}`} style={{ fontSize: 9 }}>
              {format(day, 'EEE', { locale: es }).slice(0, 2)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── TimelineRow ─────────────────────────────────────────────
function TimelineRow({ cabana, reservas, startDate, endDate, height = 40, onReservaClick }) {
  const today = startOfToday()
  const numDays = differenceInDays(endDate, startDate) + 1
  const todayOffset = differenceInDays(today, startDate)
  const showToday = todayOffset >= 0 && todayOffset < numDays

  const relevantReservas = reservas.filter((r) => {
    if (r.cabana !== cabana) return false
    const ent = parseISO(r.fecha_entrada)
    const sal = parseISO(r.fecha_salida)
    return sal >= startDate && ent <= endDate
  })

  return (
    <div className="relative" style={{ height }}>
      {/* Background cells */}
      <div className="absolute inset-0 flex">
        {Array.from({ length: numDays }, (_, i) => {
          const day = addDays(startDate, i)
          const dow = getDay(day)
          const isWeekend = dow === 0 || dow === 6
          const isToday = isSameDay(day, today)
          return (
            <div
              key={i}
              style={{ width: DAY_W, minWidth: DAY_W, flexShrink: 0 }}
              className={`h-full border-r border-gray-100 ${isWeekend ? 'bg-gray-50' : 'bg-white'} ${isToday ? 'bg-orange-50' : ''}`}
            />
          )
        })}
      </div>

      {/* Today line */}
      {showToday && (
        <div
          className="absolute top-0 bottom-0 z-20 pointer-events-none"
          style={{ left: todayOffset * DAY_W + DAY_W / 2 - 1, width: 2, backgroundColor: '#f97316' }}
        />
      )}

      {/* Reservation blocks */}
      {relevantReservas.map((r) => {
        const ent = parseISO(r.fecha_entrada)
        const sal = parseISO(r.fecha_salida)
        const clampedStart = ent < startDate ? startDate : ent
        const clampedEnd = sal > endDate ? endDate : sal
        const dayStart = differenceInDays(clampedStart, startDate)
        const daySpan = differenceInDays(clampedEnd, clampedStart) + 1
        const left = dayStart * DAY_W
        const width = Math.max(daySpan * DAY_W - 2, DAY_W - 2)

        const startsHere = ent >= startDate
        const endsHere = sal <= endDate
        const borderRadius = `${startsHere ? 6 : 0}px ${endsHere ? 6 : 0}px ${endsHere ? 6 : 0}px ${startsHere ? 6 : 0}px`

        return (
          <div
            key={r.id}
            style={{
              position: 'absolute',
              left: left + 1,
              width,
              top: height * 0.12,
              height: height * 0.76,
              backgroundColor: getCabanaColor(cabana),
              borderRadius,
              cursor: 'pointer',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 8,
              paddingRight: 6,
              zIndex: 5,
            }}
            onClick={() => onReservaClick(r)}
          >
            <span className="text-white font-semibold truncate" style={{ fontSize: 10 }}>
              {r.codigo} · {r.nombre_apellido}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── ReservaPopup ────────────────────────────────────────────
function ReservaPopup({ reserva, onClose, onView }) {
  const saldo =
    Number(reserva.monto_total || 0) -
    Number(reserva.sena1_monto || 0) -
    Number(reserva.sena2_monto || 0) -
    Number(reserva.pago_cabana_monto || 0)

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4" style={{ backgroundColor: getCabanaColor(reserva.cabana) }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono font-bold text-lg text-white">{reserva.codigo}</p>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{reserva.cabana}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_STYLES[reserva.estado] || 'bg-gray-100 text-gray-700'}`}>
              {reserva.estado}
            </span>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Huésped</p>
            <p className="font-semibold text-gray-800">{reserva.nombre_apellido}</p>
            {reserva.celular && <p className="text-xs text-gray-500">{reserva.celular}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Entrada</p>
              <p className="font-medium text-gray-800">
                {format(parseISO(reserva.fecha_entrada), 'dd/MM/yyyy', { locale: es })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Salida</p>
              <p className="font-medium text-gray-800">
                {format(parseISO(reserva.fecha_salida), 'dd/MM/yyyy', { locale: es })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">PAX</p>
              <p className="text-gray-800">{reserva.pax ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Noches</p>
              <p className="text-gray-800">{reserva.noches ?? '-'}</p>
            </div>
          </div>

          {reserva.monto_total > 0 && (
            <div className="flex gap-2">
              <div className="flex-1 bg-gray-50 rounded-lg p-2.5 text-center">
                <p className="text-xs text-gray-500">Total</p>
                <p className="font-bold text-gray-800 text-sm">
                  ${Number(reserva.monto_total).toLocaleString('es-AR')}
                </p>
              </div>
              <div className={`flex-1 rounded-lg p-2.5 text-center ${saldo > 0 ? 'bg-orange-50' : 'bg-green-50'}`}>
                <p className={`text-xs ${saldo > 0 ? 'text-orange-500' : 'text-green-500'}`}>Saldo</p>
                <p className={`font-bold text-sm ${saldo > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                  ${saldo.toLocaleString('es-AR')}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cerrar
          </button>
          <button
            onClick={onView}
            className="flex-1 text-white rounded-lg py-2 text-sm font-medium transition-colors"
            style={{ backgroundColor: getCabanaColor(reserva.cabana) }}
          >
            Ver detalle
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────
export default function Disponibilidad() {
  const navigate = useNavigate()
  const today = startOfToday()

  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(addDays(today, 29))
  const [reservas, setReservas] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCabana, setSelectedCabana] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [popup, setPopup] = useState(null)

  const numDays = differenceInDays(endDate, startDate) + 1

  useEffect(() => {
    setLoading(true)
    supabase
      .from('reservas')
      .select('id, codigo, nombre_apellido, cabana, fecha_entrada, fecha_salida, estado, pax, noches, monto_total, sena1_monto, sena2_monto, pago_cabana_monto, celular')
      .neq('estado', 'Cancelada')
      .then(({ data }) => {
        setReservas(data || [])
        setLoading(false)
      })
  }, [])

  // Cabin status today
  const cabanaStatus = useMemo(() => {
    const tStr = todayStr()
    const map = {}
    CABANAS.forEach((cab) => {
      const current = reservas.find(
        (r) => r.cabana === cab && r.fecha_entrada <= tStr && tStr <= r.fecha_salida
      )
      const upcoming = reservas
        .filter((r) => r.cabana === cab && r.fecha_entrada > tStr)
        .sort((a, b) => a.fecha_entrada.localeCompare(b.fecha_entrada))[0]
      map[cab] = { current, upcoming, occupied: Boolean(current) }
    })
    return map
  }, [reservas])

  const handleStartDate = (d) => {
    setStartDate(d)
    if (d > endDate) setEndDate(addDays(d, 29))
  }

  const handleEndDate = (d) => {
    if (d < startDate) return
    setEndDate(d)
  }

  const occupiedCount = CABANAS.filter((c) => cabanaStatus[c]?.occupied).length

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end gap-4 mb-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Disponibilidad</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {occupiedCount} de {CABANAS.length} cabañas ocupadas hoy
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3 ml-auto">
          <CalendarPicker label="Desde" value={startDate} onChange={handleStartDate} />
          <CalendarPicker label="Hasta" value={endDate} onChange={handleEndDate} />
          <div>
            <p className="text-xs text-gray-500 mb-1 font-medium invisible">btn</p>
            <button
              onClick={() => { setShowAll(!showAll); setSelectedCabana(null) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors shadow-sm ${
                showAll
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'
              }`}
            >
              {showAll ? '← Por cabaña' : 'Ver todas'}
            </button>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1 font-medium invisible">btn</p>
            <button
              onClick={() => { setStartDate(today); setEndDate(addDays(today, 29)) }}
              className="px-3 py-2 rounded-lg text-sm text-primary-600 border border-primary-200 bg-white hover:bg-primary-50 transition-colors shadow-sm"
            >
              Hoy
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
          Cargando disponibilidad...
        </div>
      ) : showAll ? (
        /* ── Vista todas las cabañas ── */
        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            {/* Leyenda */}
            <div className="flex items-center gap-5 px-4 py-3 border-b border-gray-100 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-white border-2 border-green-400 inline-block" />
                Libre
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded inline-block" style={{ background: 'linear-gradient(135deg, #1e3a5f, #db2777, #0ea5e9)' }} />
                Ocupado (color por cabaña)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-0.5 h-3 inline-block rounded" style={{ backgroundColor: '#f97316' }} />
                Hoy
              </span>
            </div>

            {/* Headers */}
            <div className="flex" style={{ paddingLeft: 136 }}>
              <DayHeaders startDate={startDate} numDays={numDays} />
            </div>

            {/* Rows */}
            {CABANAS.map((cabana, ci) => {
              const st = cabanaStatus[cabana]
              return (
                <div
                  key={cabana}
                  className={`flex items-stretch border-b border-gray-100 last:border-0 ${ci % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                >
                  <div
                    className="flex items-center px-3 gap-2 border-r border-gray-200 flex-shrink-0 cursor-pointer hover:bg-gray-100 transition-colors"
                    style={{ width: 136, borderLeft: `3px solid ${getCabanaColor(cabana)}` }}
                    onClick={() => { setSelectedCabana(cabana); setShowAll(false) }}
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${st?.occupied ? '' : 'bg-green-400'}`}
                      style={st?.occupied ? { backgroundColor: getCabanaColor(cabana) } : {}}
                    />
                    <span className="text-xs font-semibold text-gray-700 truncate">{cabana}</span>
                  </div>
                  <div className="overflow-hidden" style={{ width: numDays * DAY_W }}>
                    <TimelineRow
                      cabana={cabana}
                      reservas={reservas}
                      startDate={startDate}
                      endDate={endDate}
                      height={36}
                      onReservaClick={setPopup}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* ── Vista dos paneles ── */
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Panel izquierdo: lista cabañas */}
          <div className="w-52 flex-shrink-0 flex flex-col gap-1.5 overflow-y-auto pr-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-1">
              Cabañas
            </p>
            {CABANAS.map((cabana) => {
              const st = cabanaStatus[cabana]
              const selected = selectedCabana === cabana
              return (
                <button
                  key={cabana}
                  onClick={() => setSelectedCabana(cabana)}
                  style={selected ? {
                    borderColor: getCabanaColor(cabana),
                    borderLeftWidth: 3,
                    backgroundColor: `${getCabanaColor(cabana)}14`,
                  } : {}}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all text-sm ${
                    selected
                      ? 'shadow-sm'
                      : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-semibold text-gray-800">{cabana}</span>
                    <span
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${st?.occupied ? '' : 'bg-green-400'}`}
                      style={st?.occupied ? { backgroundColor: getCabanaColor(cabana) } : {}}
                    />
                  </div>
                  {st?.current ? (
                    <p className="text-xs truncate" style={{ color: getCabanaColor(cabana) }}>
                      {st.current.nombre_apellido.split(' ').slice(0, 2).join(' ')}
                    </p>
                  ) : st?.upcoming ? (
                    <p className="text-xs text-gray-400 truncate">
                      Próx: {format(parseISO(st.upcoming.fecha_entrada), 'dd/MM')}
                    </p>
                  ) : (
                    <p className="text-xs text-green-500 font-medium">Libre</p>
                  )}
                </button>
              )
            })}
          </div>

          {/* Panel derecho: timeline */}
          <div className="flex-1 bg-white rounded-xl shadow border border-gray-200 overflow-hidden flex flex-col">
            {selectedCabana ? (
              <>
                {/* Header del panel */}
                <div
                  className="flex items-center justify-between px-5 py-3 border-b border-gray-200"
                  style={{ backgroundColor: `${getCabanaColor(selectedCabana)}0d` }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-1 h-8 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getCabanaColor(selectedCabana) }}
                    />
                    <div>
                      <h3 className="font-bold text-gray-800">{selectedCabana}</h3>
                      <p
                        className="text-xs font-medium"
                        style={{ color: cabanaStatus[selectedCabana]?.occupied ? getCabanaColor(selectedCabana) : '#16a34a' }}
                      >
                        {cabanaStatus[selectedCabana]?.occupied ? 'Ocupada hoy' : 'Libre hoy'}
                      </p>
                    </div>
                  </div>

                  {/* Leyenda */}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded inline-block" style={{ backgroundColor: getCabanaColor(selectedCabana) }} />
                      Reserva
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-0.5 h-3 rounded inline-block" style={{ backgroundColor: '#f97316' }} />
                      Hoy
                    </span>
                  </div>
                </div>

                {/* Timeline scrollable */}
                <div className="overflow-x-auto flex-1">
                  <div style={{ minWidth: numDays * DAY_W + 1 }}>
                    <DayHeaders startDate={startDate} numDays={numDays} />
                    <TimelineRow
                      cabana={selectedCabana}
                      reservas={reservas}
                      startDate={startDate}
                      endDate={endDate}
                      height={64}
                      onReservaClick={setPopup}
                    />
                  </div>
                </div>

                {/* Reservas del período */}
                <div className="border-t border-gray-100 px-5 py-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Reservas en el período
                  </p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {reservas
                      .filter((r) => {
                        if (r.cabana !== selectedCabana) return false
                        const ent = parseISO(r.fecha_entrada)
                        const sal = parseISO(r.fecha_salida)
                        return sal >= startDate && ent <= endDate
                      })
                      .sort((a, b) => a.fecha_entrada.localeCompare(b.fecha_entrada))
                      .map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors border border-gray-100"
                          onClick={() => setPopup(r)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold" style={{ color: getCabanaColor(selectedCabana) }}>{r.codigo}</span>
                            <span className="text-gray-700 font-medium truncate">{r.nombre_apellido}</span>
                          </div>
                          <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                            {format(parseISO(r.fecha_entrada), 'dd/MM')} – {format(parseISO(r.fecha_salida), 'dd/MM')}
                          </span>
                        </div>
                      ))}
                    {reservas.filter((r) => {
                      if (r.cabana !== selectedCabana) return false
                      const ent = parseISO(r.fecha_entrada)
                      const sal = parseISO(r.fecha_salida)
                      return sal >= startDate && ent <= endDate
                    }).length === 0 && (
                      <p className="text-xs text-gray-400 py-1">Sin reservas en el período seleccionado</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 text-gray-400">
                <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm font-medium text-gray-500">Seleccioná una cabaña</p>
                <p className="text-xs text-gray-400 mt-1">o usá "Ver todas" para el resumen completo</p>
              </div>
            )}
          </div>
        </div>
      )}

      {popup && (
        <ReservaPopup
          reserva={popup}
          onClose={() => setPopup(null)}
          onView={() => { navigate(`/reservas/${popup.id}`); setPopup(null) }}
        />
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import {
  addMonths, subMonths, startOfMonth, getDaysInMonth, getDay,
  format, isSameDay, addDays,
} from 'date-fns'
import { es } from 'date-fns/locale'

// Extraído de Disponibilidad.jsx (era un componente local ahí, sin
// cambios de comportamiento) para que Ganancias.jsx y Reservas.jsx
// puedan usar el mismo selector de fecha en vez de reimplementarlo cada
// uno por su lado — ver DateRangePicker más abajo, que compone dos de
// estos (Desde/Hasta) con la misma lógica de "clamp" que Disponibilidad
// ya usaba. Disponibilidad.jsx sigue con su propia copia intacta (no se
// tocó, para no arriesgar regresiones en una pantalla que ya tiene
// cobertura de tests y un fix de sticky-header reciente) — este archivo
// es la versión a usar en cualquier pantalla NUEVA que necesite lo mismo.
function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function CalendarPicker({ value, onChange, label }) {
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
        {label && <p className="section-label mb-1">{label}</p>}
        <button
          type="button"
          onClick={() => { setView(startOfMonth(value)); setOpen(!open) }}
          className="field flex items-center gap-2 cursor-pointer w-auto"
        >
          <svg className="w-4 h-4 text-[var(--color-primario)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="font-medium text-[#333] capitalize">
            {format(value, "d 'de' MMMM yyyy", { locale: es })}
          </span>
          <svg className="w-3 h-3 text-[#888]" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-2 bg-white rounded-[12px] border border-[#f0e6d8] z-40 p-4 w-72">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setView(subMonths(view, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-secundario)] text-[#333] font-bold text-lg transition-colors"
            >‹</button>
            <span className="font-semibold text-sm text-[#111] capitalize">
              {format(view, 'MMMM yyyy', { locale: es })}
            </span>
            <button
              type="button"
              onClick={() => setView(addMonths(view, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-secundario)] text-[#333] font-bold text-lg transition-colors"
            >›</button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {['Do','Lu','Ma','Mi','Ju','Vi','Sa'].map((d) => (
              <div key={d} className="text-center text-xs text-[#888] font-medium py-1">{d}</div>
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
                    ${selected ? 'bg-[var(--color-primario)] text-white' : isT ? 'bg-orange-100 text-orange-700 font-bold' : 'hover:bg-[var(--color-secundario)] text-[#333]'}
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
            className="w-full mt-3 text-xs text-[var(--color-primario)] hover:underline text-center"
          >
            Ir a hoy
          </button>
        </div>
      )}
    </div>
  )
}

// Desde/Hasta compuestos con la misma lógica de "clamp" que ya usaba
// Disponibilidad.jsx (handleStartDate/handleEndDate): mover "desde" más
// allá de "hasta" empuja "hasta" 29 días adelante; mover "hasta" antes de
// "desde" se ignora. `onChange` recibe el par ya resuelto — el caller no
// necesita reimplementar ninguna de las dos reglas.
export default function DateRangePicker({ startDate, endDate, onChange, labelDesde = 'Desde', labelHasta = 'Hasta' }) {
  const handleStart = (d) => {
    onChange({ startDate: d, endDate: d > endDate ? addDays(d, 29) : endDate })
  }
  const handleEnd = (d) => {
    if (d < startDate) return
    onChange({ startDate, endDate: d })
  }
  return (
    <>
      <CalendarPicker label={labelDesde} value={startDate} onChange={handleStart} />
      <CalendarPicker label={labelHasta} value={endDate} onChange={handleEnd} />
    </>
  )
}

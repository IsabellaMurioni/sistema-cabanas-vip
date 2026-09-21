import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { useComplejo } from '../context/ComplejoContext'
import DateRangePicker from '../components/DateRangePicker'

// Este archivo exporta fetchReservasPorComplejo además del componente
// default, para que los tests de integración (tests/integration/)
// puedan ejercitar la query real en vez de reimplementarla. Rompe el
// supuesto de Fast Refresh de "un archivo de componente sólo exporta
// componentes" — sin impacto en runtime/producción.
/* eslint-disable react-refresh/only-export-components */

// Query real de la lista de reservas de un complejo — usada por
// Reservas.jsx. Devuelve la respuesta cruda de supabase-js ({data,
// error}); el caller decide qué hacer con cada una (acá, ignorar el
// error y mostrar lista vacía, igual que siempre).
export async function fetchReservasPorComplejo(supabase, complejoId) {
  return supabase
    .from('reservas')
    .select('*')
    .eq('complejo_id', complejoId)
    .order('created_at', { ascending: false })
}

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

// Antes, la tarjeta "facturado" filtraba por `r.mes` (un nombre de mes
// guardado como string en cada reserva, sin año) contra el mes calendario
// ACTUAL — sin selector, sin año, y mezclando reservas de años distintos
// que caen en el mismo mes (ej. septiembre 2025 y septiembre 2026 se
// sumaban juntas). Esta función arma el mismo total pero a partir de un
// rango desde/hasta arbitrario sobre `fecha_entrada` (fecha real,
// comparación de string ISO — mismo patrón que recapPorRango en
// CajaTemporada.jsx e inRange en Ganancias.jsx, sin ambigüedad de
// timezone), así puede ir tan atrás como haya datos, no sólo "el mes
// actual, cualquier año".
export function facturadoEnRango(reservas, desdeISO, hastaISO) {
  return reservas
    .filter(r => r.fecha_entrada && r.fecha_entrada >= desdeISO && r.fecha_entrada <= hastaISO)
    .reduce((s, r) => s + (Number(r.monto_total) || 0), 0)
}

const estadoBadge = {
  Pendiente:  'badge badge-pendiente',
  Confirmada: 'badge badge-confirmada',
  Finalizada: 'badge badge-finalizada',
  Cancelada:  'badge badge-cancelada',
}

function CabanaBadge({ cabana }) {
  const { getCabanaColor, cabanasPorGrupo } = useComplejo()
  const grupo = cabanasPorGrupo.find((s) => s.cabanas.includes(cabana))?.grupo
  return (
    <div className="inline-flex flex-col items-start gap-0.5">
      {grupo && (
        <span className="text-[9px] font-bold uppercase tracking-wide text-[#888]">
          {grupo}
        </span>
      )}
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-[8px] text-xs font-semibold text-white"
        style={{ backgroundColor: getCabanaColor(cabana) }}
      >
        {cabana}
      </span>
    </div>
  )
}

function saldoRestante(r) {
  return Number(r.monto_total || 0)
    - Number(r.sena1_monto || 0)
    - Number(r.sena2_monto || 0)
    - Number(r.pago_cabana_monto || 0)
}

export default function Reservas() {
  const navigate = useNavigate()
  const { complejoActivo } = useComplejo()
  const [reservas, setReservas]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filtroMes, setFiltroMes]     = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  // Rango de la tarjeta "Facturado" — independiente del filtro de mes de
  // abajo (ese filtra qué FILAS se listan; esto sólo decide qué reservas
  // entran en el total facturado). Por defecto, lo que va del mes actual
  // (mismo arranque que antes tenía la tarjeta), pero acá se puede mover
  // a cualquier rango pasado.
  const [factDesde, setFactDesde] = useState(() => startOfMonth(new Date()))
  const [factHasta, setFactHasta] = useState(() => new Date())

  // `isStale` (opcional) sólo lo pasa el useEffect de abajo — ver el
  // comentario ahí para el motivo. Las llamadas manuales (handleFinalizar/
  // handleEliminar) no lo necesitan: son un refetch síncrono en respuesta
  // a una acción del usuario, no compiten con ningún otro fetch en vuelo.
  const fetchReservas = async (isStale = () => false) => {
    if (!complejoActivo) {
      setReservas([])
      return
    }
    setLoading(true)
    const { data } = await fetchReservasPorComplejo(supabase, complejoActivo.id)
    if (isStale()) return
    setReservas(data || [])
    setLoading(false)
  }

  // Guard contra respuesta obsoleta (mismo patrón que ComplejoContext.jsx
  // y Ganancias.jsx): complejoActivo pasa brevemente por un valor default
  // (el primer complejo con membresía) antes de que Layout.jsx lo corrija
  // al slug real de la URL — este efecto se dispara dos veces seguidas al
  // entrar directo a la URL de cualquier complejo que no sea ese default.
  // Sin este guard, si el fetch del complejo viejo (default) resuelve
  // DESPUÉS del fetch del complejo corregido, pisa la lista ya correcta
  // con las reservas de otro complejo — bug real confirmado en vivo
  // (entrar directo a /mimmo/reservas mostraba reservas de Cabañas VIP).
  useEffect(() => {
    let cancelado = false
    fetchReservas(() => cancelado)
    return () => { cancelado = true }
  }, [complejoActivo?.id])

  const handleFinalizar = async (id) => {
    if (!confirm('¿Marcar esta reserva como Finalizada?')) return
    await supabase.from('reservas').update({ estado: 'Finalizada' }).eq('id', id)
    fetchReservas()
  }

  const handleEliminar = async (r) => {
    const ok = confirm(
      `¿Estás segura que querés eliminar esta reserva?\n\n` +
      `${r.codigo} · ${r.nombre_apellido}\n\n` +
      `Esta acción no se puede deshacer y borrará todos los registros asociados.`
    )
    if (!ok) return
    const paths = [r.sena1_comprobante, r.sena2_comprobante, r.pago_cabana_comprobante].filter(Boolean)
    if (paths.length > 0) await supabase.storage.from('comprobantes').remove(paths)
    await Promise.all([
      supabase.from('caja_banco').delete().eq('reserva_codigo', r.codigo).eq('complejo_id', complejoActivo.id),
      supabase.from('caja_mercado_pago').delete().eq('reserva_codigo', r.codigo).eq('complejo_id', complejoActivo.id),
      supabase.from('caja_silvia').delete().ilike('detalle', `%${r.codigo}%`).eq('complejo_id', complejoActivo.id),
    ])
    await supabase.from('reservas').delete().eq('id', r.id)
    fetchReservas()
  }

  const filtered = reservas.filter((r) => {
    const q = search.toLowerCase()
    const matchSearch = !q || [r.codigo, r.nombre_apellido, r.cabana, r.celular, r.email]
      .some((v) => v?.toLowerCase().includes(q))
    const matchMes    = !filtroMes    || r.mes    === filtroMes
    const matchEstado = !filtroEstado || r.estado === filtroEstado
    return matchSearch && matchMes && matchEstado
  })

  // Stat cards
  const factDesdeISO = format(factDesde, 'yyyy-MM-dd')
  const factHastaISO = format(factHasta, 'yyyy-MM-dd')
  const stats = useMemo(() => ({
    total:      reservas.length,
    pendientes: reservas.filter(r => r.estado === 'Pendiente').length,
    confirmadas:reservas.filter(r => r.estado === 'Confirmada').length,
    facturado:  facturadoEnRango(reservas, factDesdeISO, factHastaISO),
  }), [reservas, factDesdeISO, factHastaISO])
  const facturadoLabel = `Facturado (${format(factDesde, 'd MMM', { locale: es })} — ${format(factHasta, 'd MMM yyyy', { locale: es })})`

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[28px] font-bold text-[#111111] leading-tight">Reservas</h1>
          <p className="text-sm text-[#888888] mt-0.5">{filtered.length} reserva{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => navigate(`/${complejoActivo.slug}/reservas/nueva`)} className="btn-primary">
          + Nueva reserva
        </button>
      </div>

      {/* Rango de la tarjeta "Facturado" — no afecta la lista de abajo */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <p className="text-xs font-medium text-[#888] mr-1">Facturado entre:</p>
        <DateRangePicker
          startDate={factDesde}
          endDate={factHasta}
          onChange={({ startDate, endDate }) => { setFactDesde(startDate); setFactHasta(endDate) }}
        />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-7">
        {[
          { label: 'Total reservas',  value: stats.total },
          { label: 'Pendientes',      value: stats.pendientes },
          { label: 'Confirmadas',     value: stats.confirmadas },
          { label: facturadoLabel, value: `$${stats.facturado.toLocaleString('es-AR')}` },
        ].map((s, i) => (
          <div key={i} className="card">
            <p className="section-label mb-2">{s.label}</p>
            <p className="text-[32px] font-bold text-[#111111] leading-none tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Buscar por nombre, código, email o cabaña..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="field flex-1 min-w-48"
        />
        <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="field" style={{ width: 'auto' }}>
          <option value="">Todos los meses</option>
          {MESES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="field" style={{ width: 'auto' }}>
          <option value="">Todos los estados</option>
          {['Pendiente', 'Confirmada', 'Finalizada', 'Cancelada'].map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        {(search || filtroMes || filtroEstado) && (
          <button
            onClick={() => { setSearch(''); setFiltroMes(''); setFiltroEstado('') }}
            className="text-sm text-[#888] hover:text-[#333] px-2 transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-[#888] text-center py-16">Cargando reservas...</p>
      ) : filtered.length === 0 ? (
        <p className="text-[#aaa] text-center py-16">No hay reservas que coincidan</p>
      ) : (
        <div className="overflow-x-auto rounded-[16px] border border-[#f0e6d8]">
          <table className="tbl" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th className="rounded-tl-[16px]">Código</th>
                <th>Nombre</th>
                <th>Cabaña</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Noches</th>
                <th>Total</th>
                <th>Saldo</th>
                <th>Estado</th>
                <th className="rounded-tr-[16px]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const saldo      = saldoRestante(r)
                const finalizada = r.estado === 'Finalizada'
                return (
                  <tr key={r.id} style={finalizada ? { opacity: 0.65 } : {}}>
                    <td className="font-mono font-semibold" style={{ color: finalizada ? '#888' : 'var(--color-primario)' }}>
                      {r.codigo}
                    </td>
                    <td className="font-medium" style={{ color: finalizada ? '#888' : '#111111' }}>
                      {r.nombre_apellido}
                    </td>
                    <td><CabanaBadge cabana={r.cabana} /></td>
                    <td className="text-[#555] whitespace-nowrap">
                      {r.fecha_entrada ? format(parseISO(r.fecha_entrada), 'dd/MM/yyyy', { locale: es }) : '-'}
                    </td>
                    <td className="text-[#555] whitespace-nowrap">
                      {r.fecha_salida ? format(parseISO(r.fecha_salida), 'dd/MM/yyyy', { locale: es }) : '-'}
                    </td>
                    <td className="text-center text-[#555]">{r.noches ?? '-'}</td>
                    <td className="text-[#333]">
                      {r.monto_total ? `$${Number(r.monto_total).toLocaleString('es-AR')}` : '-'}
                    </td>
                    <td className={`font-semibold ${saldo > 0 ? 'text-orange-600' : 'text-green-700'}`}>
                      {r.monto_total ? `$${saldo.toLocaleString('es-AR')}` : '-'}
                    </td>
                    <td>
                      <span className={estadoBadge[r.estado] || 'badge badge-finalizada'}>
                        {r.estado}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-3 items-center flex-wrap">
                        <button onClick={() => navigate(`/${complejoActivo.slug}/reservas/${r.id}`)} className="text-[var(--color-primario)] hover:text-[var(--color-primario-hover)] text-xs font-semibold transition-colors">Ver</button>
                        <button onClick={() => navigate(`/${complejoActivo.slug}/reservas/${r.id}/editar`)} className="text-[#888] hover:text-[#333] text-xs font-medium transition-colors">Editar</button>
                        <button onClick={() => navigate(`/${complejoActivo.slug}/reservas/${r.id}/pago`)} className="text-[var(--color-primario)] hover:text-[var(--color-primario-hover)] text-xs font-semibold transition-colors">Pago</button>
                        {r.estado !== 'Finalizada' && r.estado !== 'Cancelada' && (
                          <button onClick={() => handleFinalizar(r.id)} className="text-[#888] hover:text-[#333] text-xs font-medium transition-colors">Finalizar</button>
                        )}
                        <button onClick={() => handleEliminar(r)} className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

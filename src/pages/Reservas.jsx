import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { getCabanaColor } from '../lib/cabanas'

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

const estadoBadge = {
  Pendiente:  'badge badge-pendiente',
  Confirmada: 'badge badge-confirmada',
  Finalizada: 'badge badge-finalizada',
  Cancelada:  'badge badge-cancelada',
}

function CabanaBadge({ cabana }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-[8px] text-xs font-semibold text-white"
      style={{ backgroundColor: getCabanaColor(cabana) }}
    >
      {cabana}
    </span>
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
  const [reservas, setReservas]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filtroMes, setFiltroMes]     = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  const fetchReservas = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('reservas')
      .select('*')
      .order('created_at', { ascending: false })
    setReservas(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchReservas() }, [])

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
      supabase.from('caja_banco').delete().eq('reserva_codigo', r.codigo),
      supabase.from('caja_mercado_pago').delete().eq('reserva_codigo', r.codigo),
      supabase.from('caja_silvia').delete().ilike('detalle', `%${r.codigo}%`),
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
  const ahora  = new Date()
  const mesAct = MESES[ahora.getMonth()]
  const stats = useMemo(() => ({
    total:      reservas.length,
    pendientes: reservas.filter(r => r.estado === 'Pendiente').length,
    confirmadas:reservas.filter(r => r.estado === 'Confirmada').length,
    mesActual:  reservas
      .filter(r => r.mes === mesAct)
      .reduce((s, r) => s + (Number(r.monto_total) || 0), 0),
  }), [reservas, mesAct])

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[28px] font-bold text-[#111111] leading-tight">Reservas</h1>
          <p className="text-sm text-[#888888] mt-0.5">{filtered.length} reserva{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => navigate('/reservas/nueva')} className="btn-primary">
          + Nueva reserva
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-7">
        {[
          { label: 'Total reservas',  value: stats.total },
          { label: 'Pendientes',      value: stats.pendientes },
          { label: 'Confirmadas',     value: stats.confirmadas },
          { label: `${mesAct} — facturado`, value: `$${stats.mesActual.toLocaleString('es-AR')}` },
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
                    <td className="font-mono font-semibold" style={{ color: finalizada ? '#888' : '#d2ab84' }}>
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
                        <button onClick={() => navigate(`/reservas/${r.id}`)} className="text-[#d2ab84] hover:text-[#c49870] text-xs font-semibold transition-colors">Ver</button>
                        <button onClick={() => navigate(`/reservas/${r.id}/editar`)} className="text-[#888] hover:text-[#333] text-xs font-medium transition-colors">Editar</button>
                        <button onClick={() => navigate(`/reservas/${r.id}/pago`)} className="text-[#d2ab84] hover:text-[#c49870] text-xs font-semibold transition-colors">Pago</button>
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

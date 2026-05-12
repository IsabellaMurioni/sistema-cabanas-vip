import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { getCabanaColor } from '../lib/cabanas'

const ESTADO_STYLES = {
  Pendiente:  'bg-yellow-100 text-yellow-800',
  Confirmada: 'bg-green-100 text-green-800',
  Finalizada: 'bg-blue-100 text-blue-800',
  Cancelada:  'bg-red-100 text-red-800',
}

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

function CabanaBadge({ cabana }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white"
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
      `Esta acción no se puede deshacer y borrará todos los registros asociados ` +
      `(pagos, comprobantes y movimientos en Caja).`
    )
    if (!ok) return

    // 1. Borrar comprobantes del storage
    const paths = [r.sena1_comprobante, r.sena2_comprobante, r.pago_cabana_comprobante].filter(Boolean)
    if (paths.length > 0) {
      await supabase.storage.from('comprobantes').remove(paths)
    }

    // 2. Borrar movimientos de caja vinculados
    await Promise.all([
      supabase.from('caja_banco').delete().eq('reserva_codigo', r.codigo),
      supabase.from('caja_mercado_pago').delete().eq('reserva_codigo', r.codigo),
      supabase.from('caja_silvia').delete().ilike('detalle', `%${r.codigo}%`),
    ])

    // 3. Borrar la reserva
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Reservas</h2>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} reserva{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => navigate('/reservas/nueva')}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Nueva reserva
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Buscar por nombre, código, email o cabaña..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <select
          value={filtroMes}
          onChange={(e) => setFiltroMes(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Todos los meses</option>
          {MESES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Todos los estados</option>
          {['Pendiente', 'Confirmada', 'Finalizada', 'Cancelada'].map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        {(search || filtroMes || filtroEstado) && (
          <button
            onClick={() => { setSearch(''); setFiltroMes(''); setFiltroEstado('') }}
            className="text-sm text-gray-500 hover:text-gray-700 px-2"
          >
            Limpiar
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-16">Cargando reservas...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400 text-center py-16">No hay reservas que coincidan</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full bg-white rounded-xl shadow text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Cabaña</th>
                <th className="px-4 py-3 font-medium">Entrada</th>
                <th className="px-4 py-3 font-medium">Salida</th>
                <th className="px-4 py-3 font-medium">Noches</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Saldo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const saldo       = saldoRestante(r)
                const finalizada  = r.estado === 'Finalizada'
                const rowCls      = finalizada
                  ? 'border-b last:border-0 bg-gray-50 opacity-70'
                  : 'border-b last:border-0 hover:bg-gray-50'

                return (
                  <tr key={r.id} className={rowCls}>
                    <td className={`px-4 py-3 font-mono font-medium ${finalizada ? 'text-gray-400' : 'text-primary-700'}`}>
                      {r.codigo}
                    </td>
                    <td className={`px-4 py-3 font-medium ${finalizada ? 'text-gray-400' : ''}`}>
                      {r.nombre_apellido}
                    </td>
                    <td className="px-4 py-3"><CabanaBadge cabana={r.cabana} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {r.fecha_entrada ? format(parseISO(r.fecha_entrada), 'dd/MM/yyyy', { locale: es }) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {r.fecha_salida ? format(parseISO(r.fecha_salida), 'dd/MM/yyyy', { locale: es }) : '-'}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{r.noches ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {r.monto_total ? `$${Number(r.monto_total).toLocaleString('es-AR')}` : '-'}
                    </td>
                    <td className={`px-4 py-3 font-medium ${saldo > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {r.monto_total ? `$${saldo.toLocaleString('es-AR')}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${ESTADO_STYLES[r.estado] || 'bg-gray-100 text-gray-700'}`}>
                        {r.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap items-center">
                        <button
                          onClick={() => navigate(`/reservas/${r.id}`)}
                          className="text-primary-600 hover:text-primary-800 text-xs font-medium"
                        >
                          Ver
                        </button>
                        <button
                          onClick={() => navigate(`/reservas/${r.id}/editar`)}
                          className="text-gray-600 hover:text-gray-800 text-xs font-medium"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => navigate(`/reservas/${r.id}/pago`)}
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                        >
                          Nuevo pago
                        </button>
                        {r.estado !== 'Finalizada' && r.estado !== 'Cancelada' && (
                          <button
                            onClick={() => handleFinalizar(r.id)}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            Finalizar
                          </button>
                        )}
                        <button
                          onClick={() => handleEliminar(r)}
                          className="text-red-500 hover:text-red-700 text-xs font-medium"
                        >
                          Eliminar
                        </button>
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

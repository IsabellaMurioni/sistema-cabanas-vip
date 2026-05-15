import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { getPublicUrl } from '../components/FileUpload'

const estadoBadge = {
  Pendiente:  'badge badge-pendiente',
  Confirmada: 'badge badge-confirmada',
  Finalizada: 'badge badge-finalizada',
  Cancelada:  'badge badge-cancelada',
}

function fmt(date) {
  if (!date) return '-'
  return format(parseISO(date), 'dd/MM/yyyy', { locale: es })
}
function money(v) {
  if (v === null || v === undefined || v === '') return '-'
  return `$${Number(v).toLocaleString('es-AR')}`
}

function DataRow({ label, value }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-2.5" style={{ borderBottom: '1px solid #f0e6d8' }}>
      <span className="section-label sm:w-48 flex-shrink-0">{label}</span>
      <span className="text-sm text-[#333333]">{value || '-'}</span>
    </div>
  )
}

function Comprobante({ path, label }) {
  if (!path) return <span className="text-xs text-[#aaa]">Sin comprobante</span>
  const url = getPublicUrl(path)
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(path)
  return isImage ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt={label} className="h-20 rounded-[10px] object-cover cursor-pointer hover:opacity-80 transition-opacity border border-[#f0e6d8]" />
    </a>
  ) : (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-[#d2ab84] hover:underline font-medium">
      <span>📄</span> Ver PDF
    </a>
  )
}

function PagoCard({ titulo, monto, tipo, fecha, comprobante }) {
  if (!monto && !comprobante) return null
  return (
    <div className="card-sm">
      <p className="text-sm font-semibold text-[#d2ab84] mb-3">{titulo}</p>
      <DataRow label="Monto" value={money(monto)} />
      {tipo && <DataRow label="Tipo" value={tipo} />}
      <DataRow label="Fecha" value={fmt(fecha)} />
      <div className="pt-3">
        <p className="section-label mb-2">Comprobante</p>
        <Comprobante path={comprobante} label={titulo} />
      </div>
    </div>
  )
}

export default function ReservaDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [reserva, setReserva] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(location.state?.toast || '')

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    supabase.from('reservas').select('*').eq('id', id).single().then(({ data }) => {
      setReserva(data)
      setLoading(false)
    })
  }, [id])

  const handleFinalizar = async () => {
    if (!confirm('¿Marcar como Finalizada?')) return
    await supabase.from('reservas').update({ estado: 'Finalizada' }).eq('id', id)
    setReserva((r) => ({ ...r, estado: 'Finalizada' }))
  }

  if (loading) return <p className="text-[#888] text-center py-16">Cargando...</p>
  if (!reserva) return <p className="text-red-500 text-center py-16">Reserva no encontrada</p>

  const saldo =
    Number(reserva.monto_total || 0) -
    Number(reserva.sena1_monto || 0) -
    Number(reserva.sena2_monto || 0) -
    Number(reserva.pago_cabana_monto || 0)

  const hayPagos = reserva.sena1_monto || reserva.sena2_monto || reserva.pago_cabana_monto ||
    reserva.sena1_comprobante || reserva.sena2_comprobante || reserva.pago_cabana_comprobante

  return (
    <div className="max-w-3xl mx-auto fade-in">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#d2ab84] text-white px-5 py-3 rounded-[10px] text-sm font-semibold flex items-center gap-3">
          <span>{toast}</span>
          <button onClick={() => setToast('')} className="text-white/70 hover:text-white font-bold text-lg leading-none">×</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/reservas')} className="text-[#888] hover:text-[#333] text-sm transition-colors">
            ← Volver
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[28px] font-bold text-[#111111] font-mono">{reserva.codigo}</h1>
              <span className={estadoBadge[reserva.estado] || 'badge badge-finalizada'}>{reserva.estado}</span>
            </div>
            <p className="text-[#888] text-sm mt-0.5">{reserva.nombre_apellido}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/reservas/${id}/editar`)} className="btn-secondary">Editar</button>
          {reserva.estado !== 'Finalizada' && reserva.estado !== 'Cancelada' && (
            <button onClick={handleFinalizar} className="btn-primary">Finalizar</button>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {/* Huésped */}
        <div className="card">
          <h3 className="text-[18px] font-semibold text-[#111111] mb-4">Información del huésped</h3>
          <div className="last:border-0">
            <DataRow label="Nombre y apellido" value={reserva.nombre_apellido} />
            <DataRow label="Email" value={reserva.email} />
            <DataRow label="CUIT / DNI" value={reserva.cuit_dni} />
            <DataRow label="Celular" value={reserva.celular} />
            <DataRow label="Dirección" value={reserva.direccion} />
          </div>
        </div>

        {/* Reserva */}
        <div className="card">
          <h3 className="text-[18px] font-semibold text-[#111111] mb-4">Datos de la reserva</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <div>
              <DataRow label="Cabaña" value={reserva.cabana} />
              <DataRow label="PAX" value={reserva.pax} />
              <DataRow label="Mes" value={reserva.mes} />
            </div>
            <div>
              <DataRow label="Entrada (IN)" value={fmt(reserva.fecha_entrada)} />
              <DataRow label="Salida (OUT)" value={fmt(reserva.fecha_salida)} />
              <DataRow label="Noches" value={reserva.noches} />
            </div>
          </div>
        </div>

        {/* Resumen económico */}
        <div className="card">
          <h3 className="text-[18px] font-semibold text-[#111111] mb-4">Resumen económico</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card-sm text-center">
              <p className="section-label mb-1">Total</p>
              <p className="font-bold text-[#111111]">{money(reserva.monto_total)}</p>
            </div>
            <div className="card-sm text-center">
              <p className="section-label mb-1" style={{ color: '#d2ab84' }}>1ª Seña</p>
              <p className="font-bold text-[#d2ab84]">{money(reserva.sena1_monto)}</p>
            </div>
            <div className="card-sm text-center">
              <p className="section-label mb-1" style={{ color: '#d2ab84' }}>2ª Seña</p>
              <p className="font-bold text-[#d2ab84]">{money(reserva.sena2_monto)}</p>
            </div>
            <div className={`card-sm text-center ${saldo > 0 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
              <p className={`section-label mb-1 ${saldo > 0 ? 'text-orange-600' : 'text-green-600'}`}>Saldo</p>
              <p className={`font-bold ${saldo > 0 ? 'text-orange-700' : 'text-green-700'}`}>{money(saldo)}</p>
            </div>
          </div>
        </div>

        {/* Pagos */}
        {hayPagos && (
          <div className="card">
            <h3 className="text-[18px] font-semibold text-[#111111] mb-4">Historial de pagos y comprobantes</h3>
            <div className="space-y-3">
              <PagoCard titulo="1ª Seña" monto={reserva.sena1_monto} tipo={reserva.sena1_tipo} fecha={reserva.sena1_fecha} comprobante={reserva.sena1_comprobante} />
              <PagoCard titulo="2ª Seña" monto={reserva.sena2_monto} tipo={reserva.sena2_tipo} fecha={reserva.sena2_fecha} comprobante={reserva.sena2_comprobante} />
              <PagoCard titulo="Pago en cabaña" monto={reserva.pago_cabana_monto} tipo={null} fecha={reserva.pago_cabana_fecha} comprobante={reserva.pago_cabana_comprobante} />
            </div>
          </div>
        )}

        {reserva.observaciones && (
          <div className="card">
            <h3 className="text-[18px] font-semibold text-[#111111] mb-3">Observaciones</h3>
            <p className="text-sm text-[#333] whitespace-pre-line">{reserva.observaciones}</p>
          </div>
        )}

        <p className="text-xs text-[#aaa] text-center pb-4">
          Creada el {reserva.created_at ? format(new Date(reserva.created_at), "dd/MM/yyyy 'a las' HH:mm", { locale: es }) : '-'}
        </p>
      </div>
    </div>
  )
}

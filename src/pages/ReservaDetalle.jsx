import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { getPublicUrl } from '../components/FileUpload'
import { sendEmailRecibo } from '../lib/email'

const ESTADO_STYLES = {
  Pendiente:  'bg-yellow-100 text-yellow-800',
  Confirmada: 'bg-green-100 text-green-800',
  Finalizada: 'bg-blue-100 text-blue-800',
  Cancelada:  'bg-red-100 text-red-800',
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
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide sm:w-48 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-800">{value || '-'}</span>
    </div>
  )
}

function Comprobante({ path, label }) {
  if (!path) return <span className="text-xs text-gray-400">Sin comprobante</span>
  const url = getPublicUrl(path)
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(path)
  return (
    <div>
      {isImage ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img
            src={url}
            alt={label}
            className="h-20 rounded border border-gray-200 object-cover cursor-pointer hover:opacity-80 transition-opacity"
          />
        </a>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:underline font-medium"
        >
          <span>📄</span> Ver PDF
        </a>
      )}
    </div>
  )
}

function PagoCard({ titulo, monto, tipo, fecha, comprobante, reserva, saldo }) {
  if (!monto && !comprobante) return null

  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [emailErr, setEmailErr] = useState('')

  const handleEmailRecibo = async () => {
    if (!reserva?.email) { setEmailErr('El cliente no tiene email registrado'); return }
    if (!monto || Number(monto) <= 0) { setEmailErr('Sin monto registrado'); return }
    setSending(true)
    setEmailErr('')
    try {
      const total_pagado = Number(reserva.monto_total || 0) - Number(saldo || 0)
      await sendEmailRecibo(reserva, { titulo, monto: Number(monto), fecha, tipo, total_pagado, saldo: Number(saldo || 0) })
      setSent(true)
      setTimeout(() => setSent(false), 4000)
    } catch (e) {
      setEmailErr(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-700">{titulo}</p>
        <div className="flex flex-col items-end gap-1">
          {sent ? (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <span>✓</span> Email enviado
            </span>
          ) : (
            <button
              type="button"
              onClick={handleEmailRecibo}
              disabled={sending}
              className="text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span>✉</span> {sending ? 'Enviando...' : 'Enviar recibo por email'}
            </button>
          )}
          {emailErr && <p className="text-xs text-red-500">{emailErr}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 mb-3">
        <DataRow label="Monto" value={money(monto)} />
        {tipo && <DataRow label="Tipo" value={tipo} />}
        <DataRow label="Fecha" value={fmt(fecha)} />
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Comprobante</p>
        <Comprobante path={comprobante} label={titulo} />
      </div>
    </div>
  )
}

export default function ReservaDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [reserva, setReserva] = useState(null)
  const [loading, setLoading] = useState(true)

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

  if (loading) return <p className="text-gray-500 text-center py-16">Cargando...</p>
  if (!reserva) return <p className="text-red-500 text-center py-16">Reserva no encontrada</p>

  const saldo =
    Number(reserva.monto_total || 0) -
    Number(reserva.sena1_monto || 0) -
    Number(reserva.sena2_monto || 0) -
    Number(reserva.pago_cabana_monto || 0)

  const hayPagos = reserva.sena1_monto || reserva.sena2_monto || reserva.pago_cabana_monto ||
    reserva.sena1_comprobante || reserva.sena2_comprobante || reserva.pago_cabana_comprobante

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/reservas')}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            ← Volver
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-800 font-mono">{reserva.codigo}</h2>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_STYLES[reserva.estado] || 'bg-gray-100 text-gray-700'}`}>
                {reserva.estado}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-0.5">{reserva.nombre_apellido}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/reservas/${id}/editar`)}
            className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            Editar
          </button>
          {reserva.estado !== 'Finalizada' && reserva.estado !== 'Cancelada' && (
            <button
              onClick={handleFinalizar}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              Finalizar
            </button>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {/* Información del huésped */}
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Información del huésped
          </h3>
          <DataRow label="Nombre y apellido" value={reserva.nombre_apellido} />
          <DataRow label="Email" value={reserva.email} />
          <DataRow label="CUIT / DNI" value={reserva.cuit_dni} />
          <DataRow label="Celular" value={reserva.celular} />
          <DataRow label="Dirección" value={reserva.direccion} />
        </div>

        {/* Datos de la reserva */}
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Datos de la reserva
          </h3>
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
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Resumen económico
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Total</p>
              <p className="font-bold text-gray-800">{money(reserva.monto_total)}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-xs text-blue-600 mb-1">1ª Seña</p>
              <p className="font-bold text-blue-700">{money(reserva.sena1_monto)}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-xs text-blue-600 mb-1">2ª Seña</p>
              <p className="font-bold text-blue-700">{money(reserva.sena2_monto)}</p>
            </div>
            <div className={`rounded-lg p-3 text-center ${saldo > 0 ? 'bg-orange-50' : 'bg-green-50'}`}>
              <p className={`text-xs mb-1 ${saldo > 0 ? 'text-orange-600' : 'text-green-600'}`}>Saldo</p>
              <p className={`font-bold ${saldo > 0 ? 'text-orange-700' : 'text-green-700'}`}>{money(saldo)}</p>
            </div>
          </div>
        </div>

        {/* Historial de pagos */}
        {hayPagos && (
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Historial de pagos y comprobantes
            </h3>
            <div className="space-y-4">
              <PagoCard
                titulo="1ª Seña"
                monto={reserva.sena1_monto}
                tipo={reserva.sena1_tipo}
                fecha={reserva.sena1_fecha}
                comprobante={reserva.sena1_comprobante}
                reserva={reserva}
                saldo={saldo}
              />
              <PagoCard
                titulo="2ª Seña"
                monto={reserva.sena2_monto}
                tipo={reserva.sena2_tipo}
                fecha={reserva.sena2_fecha}
                comprobante={reserva.sena2_comprobante}
                reserva={reserva}
                saldo={saldo}
              />
              <PagoCard
                titulo="Pago en cabaña"
                monto={reserva.pago_cabana_monto}
                tipo={null}
                fecha={reserva.pago_cabana_fecha}
                comprobante={reserva.pago_cabana_comprobante}
                reserva={reserva}
                saldo={saldo}
              />
            </div>
          </div>
        )}

        {/* Observaciones */}
        {reserva.observaciones && (
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Observaciones
            </h3>
            <p className="text-sm text-gray-700 whitespace-pre-line">{reserva.observaciones}</p>
          </div>
        )}

        <p className="text-xs text-gray-400 text-center pb-4">
          Creada el {reserva.created_at ? format(new Date(reserva.created_at), "dd/MM/yyyy 'a las' HH:mm", { locale: es }) : '-'}
        </p>
      </div>
    </div>
  )
}

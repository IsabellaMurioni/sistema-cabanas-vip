import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import FileUpload from '../components/FileUpload'
import { sendEmailRecibo } from '../lib/email'

const TIPOS_PAGO = [
  'Transferencia bancaria',
  'Mercado Pago',
  'Efectivo en cabaña',
  'Efectivo en oficina',
]

function getCajaTable(tipo) {
  if (tipo === 'Mercado Pago')          return 'caja_mercado_pago'
  if (tipo === 'Efectivo en cabaña' ||
      tipo === 'Efectivo en oficina')   return 'caja_silvia'
  return 'caja_banco'
}

const ic = 'field'

function Field({ label, children }) {
  return (
    <div>
      <label className="block section-label mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export default function ReservaPago() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [reserva, setReserva] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const [form, setForm] = useState({
    monto:          '',
    tipo:           'Transferencia bancaria',
    fecha:          new Date().toISOString().slice(0, 10),
    comprobante:    '',
    observaciones:  '',
  })

  useEffect(() => {
    supabase.from('reservas').select('*').eq('id', id).single().then(({ data }) => {
      if (data) setReserva(data)
      setLoading(false)
    })
  }, [id])

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.monto || Number(form.monto) <= 0) {
      setError('Ingresá un monto válido.')
      return
    }

    setSaving(true)
    setError('')

    // Determinar slot: sena1 o sena2
    const tieneSena1 = Number(reserva.sena1_monto || 0) > 0
    const tieneSena2 = Number(reserva.sena2_monto || 0) > 0

    let campo, titulo
    if (!tieneSena1) {
      campo = 'sena1'
      titulo = '1ª Seña'
    } else if (!tieneSena2) {
      campo = 'sena2'
      titulo = '2ª Seña'
    } else {
      setError('Esta reserva ya tiene 2 señas registradas. Editá la reserva directamente para agregar más pagos.')
      setSaving(false)
      return
    }

    // Estado: primer pago → Pendiente se convierte en Confirmada
    const esPrimerPago = !tieneSena1
    const nuevoEstado  = esPrimerPago && reserva.estado === 'Pendiente'
      ? 'Confirmada'
      : reserva.estado

    // Guardar en reserva
    const { error: errReserva } = await supabase.from('reservas').update({
      [`${campo}_monto`]:       Number(form.monto),
      [`${campo}_tipo`]:        form.tipo,
      [`${campo}_fecha`]:       form.fecha || null,
      [`${campo}_recibo`]:      form.observaciones || null,
      [`${campo}_comprobante`]: form.comprobante || null,
      estado: nuevoEstado,
    }).eq('id', id)

    if (errReserva) {
      setError('Error al guardar: ' + errReserva.message)
      setSaving(false)
      return
    }

    // Registrar en caja
    const tabla = getCajaTable(form.tipo)
    const hoy   = new Date().toISOString().slice(0, 10)
    const detalle = `${titulo} · ${reserva.codigo} - ${reserva.nombre_apellido}`

    if (tabla === 'caja_silvia') {
      await supabase.from('caja_silvia').insert({
        fecha:           form.fecha || hoy,
        cuenta:          'Alquiler',
        detalle,
        ingreso_pesos:   Number(form.monto),
        ingreso_dolares: 0,
        ingreso_juli:    0,
        gasto:           0,
        retiro_pesos:    0,
        retiro_dolares:  0,
      })
    } else {
      await supabase.from(tabla).insert({
        fecha:          form.fecha || hoy,
        detalle,
        reserva_codigo: reserva.codigo,
        reserva_nombre: reserva.nombre_apellido,
        ingreso:        Number(form.monto),
        egreso:         0,
      })
    }

    setSaving(false)

    if (nuevoEstado === 'Confirmada' && reserva.email) {
      const total_pagado = Number(form.monto)
      sendEmailRecibo(reserva, {
        titulo,
        monto: Number(form.monto),
        fecha: form.fecha,
        tipo: form.tipo,
        total_pagado,
        saldo: Number(reserva.monto_total || 0) - total_pagado,
      }).catch((e) => console.error('[ReservaPago] Email recibo ERROR:', e))
    }

    navigate(`/reservas/${id}`, nuevoEstado === 'Confirmada'
      ? { state: { toast: 'Reserva confirmada automáticamente' } }
      : {})
  }

  if (loading) return <p className="text-gray-500 text-center py-16">Cargando...</p>
  if (!reserva) return <p className="text-red-500 text-center py-16">Reserva no encontrada</p>

  const tieneSena1  = Number(reserva.sena1_monto  || 0) > 0
  const tieneSena2  = Number(reserva.sena2_monto  || 0) > 0
  const slotSiguiente = !tieneSena1 ? '1ª Seña' : !tieneSena2 ? '2ª Seña' : null
  const pagado = Number(reserva.sena1_monto || 0) + Number(reserva.sena2_monto || 0) + Number(reserva.pago_cabana_monto || 0)
  const saldo  = Number(reserva.monto_total || 0) - pagado

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/reservas/${id}`)} className="text-[#888] hover:text-[#333] text-sm transition-colors">
          ← Volver
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[28px] font-bold font-mono text-[#111111]">{reserva.codigo}</h1>
            <span className="text-[#aaa] text-sm">·</span>
            <span className="text-sm font-medium text-[#888]">Nuevo pago</span>
          </div>
          <p className="text-sm text-[#888]">{reserva.nombre_apellido} · {reserva.cabana}</p>
        </div>
      </div>

      {/* Resumen económico */}
      <div className="card grid grid-cols-3 divide-x divide-[#f0e6d8] mb-6 p-0 overflow-hidden">
        <div className="p-5 text-center">
          <p className="section-label mb-1">Total</p>
          <p className="font-bold text-[#111111]">${Number(reserva.monto_total || 0).toLocaleString('es-AR')}</p>
        </div>
        <div className="p-5 text-center">
          <p className="section-label mb-1">Pagado</p>
          <p className="font-bold text-green-700">${pagado.toLocaleString('es-AR')}</p>
        </div>
        <div className="p-5 text-center">
          <p className="section-label mb-1">Saldo</p>
          <p className={`font-bold text-lg ${saldo > 0 ? 'text-orange-600' : 'text-green-600'}`}>
            ${saldo.toLocaleString('es-AR')}
          </p>
        </div>
      </div>

      {slotSiguiente === null ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-sm text-yellow-800">
          Esta reserva ya tiene 2 señas registradas. Para agregar más pagos, editá la reserva directamente.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-[18px] font-semibold text-[#111111]">
              Registrar pago
            </h3>
            <span className="badge" style={{ background: '#fee7ef', color: '#d2ab84' }}>
              Se asignará como {slotSiguiente}
            </span>
          </div>

          <Field label="Monto ($)">
            <input
              type="number"
              min={0}
              value={form.monto}
              onChange={e => set('monto', e.target.value)}
              className={ic}
              placeholder="0"
              required
              autoFocus
            />
          </Field>

          <Field label="Tipo de pago">
            <select
              value={form.tipo}
              onChange={e => set('tipo', e.target.value)}
              className={ic}
            >
              {TIPOS_PAGO.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>

          <Field label="Fecha del pago">
            <input
              type="date"
              value={form.fecha}
              onChange={e => set('fecha', e.target.value)}
              className={ic}
            />
          </Field>

          <FileUpload
            label="Comprobante (foto o PDF)"
            path={form.comprobante}
            onUpload={path => set('comprobante', path)}
          />

          <Field label="Observaciones">
            <textarea
              value={form.observaciones}
              onChange={e => set('observaciones', e.target.value)}
              rows={3}
              className={`${ic} resize-none`}
              placeholder="Notas sobre este pago (opcional)"
            />
          </Field>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => navigate(`/reservas/${id}`)}
              className="btn-secondary flex-1 py-2.5"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1 py-2.5 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Registrar pago'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

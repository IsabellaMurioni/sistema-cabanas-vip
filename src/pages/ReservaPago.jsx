import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import FileUpload from '../components/FileUpload'
const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-500'

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

function PagoSection({ titulo, fields, set }) {
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-gray-700">{titulo}</p>
        <button
          type="button"
          disabled
          title="Próximamente disponible"
          className="text-xs text-gray-400 border border-gray-200 rounded-lg px-3 py-1.5 cursor-not-allowed opacity-60 flex items-center gap-1.5"
        >
          <span>✉</span> Enviar recibo por email
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Monto ($)">
          <input
            type="number"
            min={0}
            value={fields.monto}
            onChange={e => set('monto', e.target.value)}
            className={ic}
            placeholder="0"
          />
        </Field>
        {fields.tipo !== undefined && (
          <Field label="Tipo de pago">
            <select value={fields.tipo} onChange={e => set('tipo', e.target.value)} className={ic}>
              <option>Banco</option>
              <option>Mercado Pago</option>
            </select>
          </Field>
        )}
        <div className={fields.tipo !== undefined ? '' : 'col-span-2'}>
          <Field label="Fecha">
            <input
              type="date"
              value={fields.fecha}
              onChange={e => set('fecha', e.target.value)}
              className={ic}
            />
          </Field>
        </div>
        {fields.tipo !== undefined && <div />}
        <div className="col-span-2">
          <FileUpload
            label="Comprobante (foto o PDF)"
            path={fields.comprobante}
            onUpload={p => set('comprobante', p)}
          />
        </div>
      </div>
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

  const [sena1, setSena1] = useState({ monto: '', tipo: 'Banco', fecha: '', comprobante: '' })
  const [sena2, setSena2] = useState({ monto: '', tipo: 'Banco', fecha: '', comprobante: '' })
  const [cabana, setCabana] = useState({ monto: '', fecha: '', comprobante: '' })

  useEffect(() => {
    supabase.from('reservas').select('*').eq('id', id).single().then(({ data }) => {
      if (data) {
        setReserva(data)
        setSena1({
          monto:        data.sena1_monto?.toString()        ?? '',
          tipo:         data.sena1_tipo                     ?? 'Banco',
          fecha:        data.sena1_fecha                    ?? '',
          comprobante:  data.sena1_comprobante              ?? '',
        })
        setSena2({
          monto:        data.sena2_monto?.toString()        ?? '',
          tipo:         data.sena2_tipo                     ?? 'Banco',
          fecha:        data.sena2_fecha                    ?? '',
          comprobante:  data.sena2_comprobante              ?? '',
        })
        setCabana({
          monto:        data.pago_cabana_monto?.toString()  ?? '',
          fecha:        data.pago_cabana_fecha              ?? '',
          comprobante:  data.pago_cabana_comprobante        ?? '',
        })
      }
      setLoading(false)
    })
  }, [id])

  const setter = (setState) => (field, value) => setState(s => ({ ...s, [field]: value }))

  const pagado = Number(sena1.monto || 0) + Number(sena2.monto || 0) + Number(cabana.monto || 0)
  const saldo  = Number(reserva?.monto_total || 0) - pagado

  const handleSubmit = async e => {
    e.preventDefault()
    setSaving(true)
    setError('')

    const { error: err } = await supabase.from('reservas').update({
      sena1_monto:              sena1.monto !== '' ? Number(sena1.monto) : null,
      sena1_tipo:               sena1.tipo  || null,
      sena1_fecha:              sena1.fecha || null,
      sena1_comprobante:        sena1.comprobante || null,
      sena2_monto:              sena2.monto !== '' ? Number(sena2.monto) : null,
      sena2_tipo:               sena2.tipo  || null,
      sena2_fecha:              sena2.fecha || null,
      sena2_comprobante:        sena2.comprobante || null,
      pago_cabana_monto:        cabana.monto !== '' ? Number(cabana.monto) : null,
      pago_cabana_fecha:        cabana.fecha || null,
      pago_cabana_comprobante:  cabana.comprobante || null,
    }).eq('id', id)

    setSaving(false)
    if (err) setError('Error al guardar: ' + err.message)
    else navigate(`/reservas/${id}`)
  }

  if (loading) return <p className="text-gray-500 text-center py-16">Cargando...</p>
  if (!reserva) return <p className="text-red-500 text-center py-16">Reserva no encontrada</p>

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(`/reservas/${id}`)}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          ← Volver
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-800 font-mono">{reserva.codigo}</h2>
            <span className="text-gray-400 text-sm">·</span>
            <h2 className="text-sm font-medium text-gray-600">Editar pagos</h2>
          </div>
          <p className="text-sm text-gray-500">{reserva.nombre_apellido} · {reserva.cabana}</p>
        </div>
      </div>

      {/* Resumen económico */}
      <div className="bg-white rounded-xl shadow p-4 mb-6 grid grid-cols-3 divide-x divide-gray-100">
        <div className="px-4 text-center">
          <p className="text-xs text-gray-400 mb-0.5">Total</p>
          <p className="font-bold text-gray-800">${Number(reserva.monto_total || 0).toLocaleString('es-AR')}</p>
        </div>
        <div className="px-4 text-center">
          <p className="text-xs text-gray-400 mb-0.5">Pagado</p>
          <p className="font-bold text-green-700">${pagado.toLocaleString('es-AR')}</p>
        </div>
        <div className="px-4 text-center">
          <p className="text-xs text-gray-400 mb-0.5">Saldo</p>
          <p className={`font-bold text-lg ${saldo > 0 ? 'text-orange-600' : 'text-green-600'}`}>
            ${saldo.toLocaleString('es-AR')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <PagoSection titulo="1ª Seña"      fields={sena1}  set={setter(setSena1)} />
        <PagoSection titulo="2ª Seña"      fields={sena2}  set={setter(setSena2)} />
        <PagoSection titulo="Pago en cabaña" fields={cabana} set={setter(setCabana)} />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 pb-6">
          <button
            type="button"
            onClick={() => navigate(`/reservas/${id}`)}
            className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            {saving ? 'Guardando...' : 'Guardar pagos'}
          </button>
        </div>
      </form>
    </div>
  )
}

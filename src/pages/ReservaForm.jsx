import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CABANAS } from '../lib/cabanas'
import FileUpload from '../components/FileUpload'

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

const EMPTY_FORM = {
  codigo: '',
  nombre_apellido: '',
  cuit_dni: '',
  direccion: '',
  celular: '',
  cabana: '',
  pax: 1,
  fecha_entrada: '',
  fecha_salida: '',
  noches: 0,
  mes: '',
  monto_total: '',
  sena1_monto: '',
  sena1_tipo: 'Banco',
  sena1_fecha: '',
  sena1_recibo: '',
  sena1_comprobante: '',
  sena2_monto: '',
  sena2_tipo: 'Banco',
  sena2_fecha: '',
  sena2_recibo: '',
  sena2_comprobante: '',
  pago_cabana_monto: '',
  pago_cabana_fecha: '',
  pago_cabana_recibo: '',
  pago_cabana_comprobante: '',
  estado: 'Pendiente',
  observaciones: '',
}

function calcNoches(entrada, salida) {
  if (!entrada || !salida) return 0
  const diff = new Date(salida) - new Date(entrada)
  return Math.max(0, Math.round(diff / 86400000))
}

function getMes(fechaStr) {
  if (!fechaStr) return ''
  const d = new Date(fechaStr + 'T12:00:00')
  return MESES[d.getMonth()]
}

async function fetchNextCode() {
  const { data } = await supabase
    .from('reservas')
    .select('codigo')
    .like('codigo', 'A%')
    .order('codigo', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return 'A2524'
  const last = data[0].codigo
  const num = parseInt(last.replace(/^A/, ''), 10)
  return isNaN(num) ? 'A2524' : `A${num + 1}`
}

function Field({ label, children, required }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-500"

export default function ReservaForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [error, setError] = useState('')

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  useEffect(() => {
    if (isEdit) {
      supabase.from('reservas').select('*').eq('id', id).single().then(({ data }) => {
        if (data) {
          setForm({
            codigo: data.codigo ?? '',
            nombre_apellido: data.nombre_apellido ?? '',
            cuit_dni: data.cuit_dni ?? '',
            direccion: data.direccion ?? '',
            celular: data.celular ?? '',
            cabana: data.cabana ?? '',
            pax: data.pax ?? 1,
            fecha_entrada: data.fecha_entrada ?? '',
            fecha_salida: data.fecha_salida ?? '',
            noches: data.noches ?? 0,
            mes: data.mes ?? '',
            monto_total: data.monto_total?.toString() ?? '',
            sena1_monto: data.sena1_monto?.toString() ?? '',
            sena1_tipo: data.sena1_tipo ?? 'Banco',
            sena1_fecha: data.sena1_fecha ?? '',
            sena1_recibo: data.sena1_recibo ?? '',
            sena1_comprobante: data.sena1_comprobante ?? '',
            sena2_monto: data.sena2_monto?.toString() ?? '',
            sena2_tipo: data.sena2_tipo ?? 'Banco',
            sena2_fecha: data.sena2_fecha ?? '',
            sena2_recibo: data.sena2_recibo ?? '',
            sena2_comprobante: data.sena2_comprobante ?? '',
            pago_cabana_monto: data.pago_cabana_monto?.toString() ?? '',
            pago_cabana_fecha: data.pago_cabana_fecha ?? '',
            pago_cabana_recibo: data.pago_cabana_recibo ?? '',
            pago_cabana_comprobante: data.pago_cabana_comprobante ?? '',
            estado: data.estado ?? 'Pendiente',
            observaciones: data.observaciones ?? '',
          })
        }
        setLoading(false)
      })
    } else {
      fetchNextCode().then((codigo) => set('codigo', codigo))
    }
  }, [id, isEdit])

  const handleFechaEntrada = (value) => {
    const noches = calcNoches(value, form.fecha_salida)
    const mes = getMes(value)
    setForm((f) => ({ ...f, fecha_entrada: value, noches, mes }))
  }

  const handleFechaSalida = (value) => {
    const noches = calcNoches(form.fecha_entrada, value)
    setForm((f) => ({ ...f, fecha_salida: value, noches }))
  }

  const saldo =
    Number(form.monto_total || 0) -
    Number(form.sena1_monto || 0) -
    Number(form.sena2_monto || 0) -
    Number(form.pago_cabana_monto || 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.fecha_entrada && form.fecha_salida && form.fecha_salida <= form.fecha_entrada) {
      setError('La fecha de salida debe ser posterior a la de entrada.')
      return
    }

    setSaving(true)

    const payload = {
      codigo: form.codigo,
      nombre_apellido: form.nombre_apellido,
      cuit_dni: form.cuit_dni || null,
      direccion: form.direccion || null,
      celular: form.celular || null,
      cabana: form.cabana,
      pax: Number(form.pax) || 1,
      fecha_entrada: form.fecha_entrada,
      fecha_salida: form.fecha_salida,
      noches: calcNoches(form.fecha_entrada, form.fecha_salida),
      mes: form.mes || null,
      monto_total: form.monto_total !== '' ? Number(form.monto_total) : null,
      sena1_monto: form.sena1_monto !== '' ? Number(form.sena1_monto) : null,
      sena1_tipo: form.sena1_tipo || null,
      sena1_fecha: form.sena1_fecha || null,
      sena1_recibo: form.sena1_recibo || null,
      sena1_comprobante: form.sena1_comprobante || null,
      sena2_monto: form.sena2_monto !== '' ? Number(form.sena2_monto) : null,
      sena2_tipo: form.sena2_tipo || null,
      sena2_fecha: form.sena2_fecha || null,
      sena2_recibo: form.sena2_recibo || null,
      sena2_comprobante: form.sena2_comprobante || null,
      pago_cabana_monto: form.pago_cabana_monto !== '' ? Number(form.pago_cabana_monto) : null,
      pago_cabana_fecha: form.pago_cabana_fecha || null,
      pago_cabana_recibo: form.pago_cabana_recibo || null,
      pago_cabana_comprobante: form.pago_cabana_comprobante || null,
      estado: form.estado,
      observaciones: form.observaciones || null,
    }

    let err
    if (isEdit) {
      ({ error: err } = await supabase.from('reservas').update(payload).eq('id', id))
    } else {
      ({ error: err } = await supabase.from('reservas').insert(payload))
    }

    setSaving(false)

    if (err) {
      setError('Error al guardar: ' + err.message)
    } else {
      navigate('/reservas')
    }
  }

  if (loading) {
    return <p className="text-gray-500 text-center py-16">Cargando...</p>
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/reservas')}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          ← Volver
        </button>
        <h2 className="text-2xl font-bold text-gray-800">
          {isEdit ? `Editar ${form.codigo}` : 'Nueva reserva'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Sección 1: Huésped */}
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            Información del huésped
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Nombre y apellido" required>
                <input
                  type="text"
                  value={form.nombre_apellido}
                  onChange={(e) => set('nombre_apellido', e.target.value)}
                  required
                  className={inputClass}
                  placeholder="Ej: García, Juan"
                />
              </Field>
            </div>
            <Field label="CUIT / DNI">
              <input
                type="text"
                value={form.cuit_dni}
                onChange={(e) => set('cuit_dni', e.target.value)}
                className={inputClass}
                placeholder="20-12345678-9"
              />
            </Field>
            <Field label="Celular">
              <input
                type="text"
                value={form.celular}
                onChange={(e) => set('celular', e.target.value)}
                className={inputClass}
                placeholder="+54 9 11 1234-5678"
              />
            </Field>
            <div className="col-span-2">
              <Field label="Dirección">
                <input
                  type="text"
                  value={form.direccion}
                  onChange={(e) => set('direccion', e.target.value)}
                  className={inputClass}
                  placeholder="Calle, número, ciudad"
                />
              </Field>
            </div>
          </div>
        </div>

        {/* Sección 2: Reserva */}
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            Datos de la reserva
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Código de reserva">
              <input
                type="text"
                value={form.codigo}
                disabled
                className={inputClass}
              />
            </Field>
            <Field label="Cabaña" required>
              <select
                value={form.cabana}
                onChange={(e) => set('cabana', e.target.value)}
                required
                className={inputClass}
              >
                <option value="">Seleccionar cabaña</option>
                {CABANAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="PAX (personas)">
              <input
                type="number"
                min={1}
                value={form.pax}
                onChange={(e) => set('pax', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Estado">
              <select
                value={form.estado}
                onChange={(e) => set('estado', e.target.value)}
                className={inputClass}
              >
                <option>Pendiente</option>
                <option>Confirmada</option>
                <option>Finalizada</option>
                <option>Cancelada</option>
              </select>
            </Field>
            <Field label="Fecha de entrada (IN)" required>
              <input
                type="date"
                value={form.fecha_entrada}
                onChange={(e) => handleFechaEntrada(e.target.value)}
                required
                className={inputClass}
              />
            </Field>
            <Field label="Fecha de salida (OUT)" required>
              <input
                type="date"
                value={form.fecha_salida}
                onChange={(e) => handleFechaSalida(e.target.value)}
                required
                className={inputClass}
              />
            </Field>
            <Field label="Noches">
              <input
                type="number"
                value={form.noches}
                disabled
                className={inputClass}
              />
            </Field>
            <Field label="Mes">
              <input
                type="text"
                value={form.mes}
                disabled
                className={inputClass}
                placeholder="Se completa automático"
              />
            </Field>
            <Field label="Monto total ($)">
              <input
                type="number"
                min={0}
                value={form.monto_total}
                onChange={(e) => set('monto_total', e.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </Field>
            <Field label="Saldo restante ($)">
              <div className={`${inputClass} ${saldo > 0 ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-green-50 text-green-700 border-green-200'} font-medium`}>
                ${saldo.toLocaleString('es-AR')}
              </div>
            </Field>
          </div>
        </div>

        {/* Sección 3: Pagos */}
        <div className="bg-white rounded-xl shadow p-6 space-y-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Historial de pagos
          </h3>

          {/* 1ª Seña */}
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">1ª Seña</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Monto ($)">
                <input
                  type="number"
                  min={0}
                  value={form.sena1_monto}
                  onChange={(e) => set('sena1_monto', e.target.value)}
                  className={inputClass}
                  placeholder="0"
                />
              </Field>
              <Field label="Tipo">
                <select
                  value={form.sena1_tipo}
                  onChange={(e) => set('sena1_tipo', e.target.value)}
                  className={inputClass}
                >
                  <option>Banco</option>
                  <option>Mercado Pago</option>
                </select>
              </Field>
              <Field label="Fecha">
                <input
                  type="date"
                  value={form.sena1_fecha}
                  onChange={(e) => set('sena1_fecha', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Nº de recibo">
                <input
                  type="text"
                  value={form.sena1_recibo}
                  onChange={(e) => set('sena1_recibo', e.target.value)}
                  className={inputClass}
                  placeholder="Ej: 00123"
                />
              </Field>
              <div className="col-span-2">
                <FileUpload
                  label="Comprobante (foto o PDF)"
                  path={form.sena1_comprobante}
                  onUpload={(path) => set('sena1_comprobante', path)}
                />
              </div>
            </div>
          </div>

          {/* 2ª Seña */}
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">2ª Seña</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Monto ($)">
                <input
                  type="number"
                  min={0}
                  value={form.sena2_monto}
                  onChange={(e) => set('sena2_monto', e.target.value)}
                  className={inputClass}
                  placeholder="0"
                />
              </Field>
              <Field label="Tipo">
                <select
                  value={form.sena2_tipo}
                  onChange={(e) => set('sena2_tipo', e.target.value)}
                  className={inputClass}
                >
                  <option>Banco</option>
                  <option>Mercado Pago</option>
                </select>
              </Field>
              <Field label="Fecha">
                <input
                  type="date"
                  value={form.sena2_fecha}
                  onChange={(e) => set('sena2_fecha', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Nº de recibo">
                <input
                  type="text"
                  value={form.sena2_recibo}
                  onChange={(e) => set('sena2_recibo', e.target.value)}
                  className={inputClass}
                  placeholder="Ej: 00124"
                />
              </Field>
              <div className="col-span-2">
                <FileUpload
                  label="Comprobante (foto o PDF)"
                  path={form.sena2_comprobante}
                  onUpload={(path) => set('sena2_comprobante', path)}
                />
              </div>
            </div>
          </div>

          {/* Pago en cabaña */}
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Pago en cabaña</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Monto ($)">
                <input
                  type="number"
                  min={0}
                  value={form.pago_cabana_monto}
                  onChange={(e) => set('pago_cabana_monto', e.target.value)}
                  className={inputClass}
                  placeholder="0"
                />
              </Field>
              <Field label="Fecha">
                <input
                  type="date"
                  value={form.pago_cabana_fecha}
                  onChange={(e) => set('pago_cabana_fecha', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Nº de recibo">
                <input
                  type="text"
                  value={form.pago_cabana_recibo}
                  onChange={(e) => set('pago_cabana_recibo', e.target.value)}
                  className={inputClass}
                  placeholder="Ej: 00125"
                />
              </Field>
              <div />
              <div className="col-span-2">
                <FileUpload
                  label="Comprobante (foto o PDF)"
                  path={form.pago_cabana_comprobante}
                  onUpload={(path) => set('pago_cabana_comprobante', path)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sección 4: Observaciones */}
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            Observaciones
          </h3>
          <textarea
            value={form.observaciones}
            onChange={(e) => set('observaciones', e.target.value)}
            rows={4}
            className={`${inputClass} resize-none`}
            placeholder="Notas adicionales sobre la reserva..."
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 pb-6">
          <button
            type="button"
            onClick={() => navigate('/reservas')}
            className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear reserva'}
          </button>
        </div>
      </form>
    </div>
  )
}

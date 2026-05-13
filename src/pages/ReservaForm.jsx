import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CABANAS } from '../lib/cabanas'
import FileUpload from '../components/FileUpload'
import { sendEmailConfirmacion, sendEmailRecibo } from '../lib/email'

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

const EMPTY_FORM = {
  codigo: '',
  nombre_apellido: '',
  email: '',
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
  const [precioNoche, setPrecioNoche] = useState(null)
  const [precioNombrePeriodo, setPrecioNombrePeriodo] = useState('')
  const [montoModificado, setMontoModificado] = useState(false)

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  useEffect(() => {
    if (isEdit) {
      supabase.from('reservas').select('*').eq('id', id).single().then(({ data }) => {
        if (data) {
          setForm({
            codigo: data.codigo ?? '',
            nombre_apellido: data.nombre_apellido ?? '',
            email: data.email ?? '',
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

  // Auto-calcular monto_total al crear (no al editar)
  useEffect(() => {
    if (isEdit) return
    if (!form.fecha_entrada || !form.noches || form.noches <= 0) {
      setPrecioNoche(null)
      setPrecioNombrePeriodo('')
      set('monto_total', '')
      return
    }
    supabase
      .from('precios')
      .select('nombre, precio_noche')
      .lte('fecha_inicio', form.fecha_entrada)
      .gte('fecha_fin', form.fecha_entrada)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPrecioNoche(data.precio_noche)
          setPrecioNombrePeriodo(data.nombre)
          set('monto_total', String(Math.round(form.noches * data.precio_noche)))
        } else {
          setPrecioNoche(null)
          setPrecioNombrePeriodo('')
          set('monto_total', '')
        }
      })
  }, [form.fecha_entrada, form.noches, isEdit])

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
      email: form.email || null,
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
    let newReserva = null

    if (isEdit) {
      ({ error: err } = await supabase.from('reservas').update(payload).eq('id', id))
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('reservas')
        .insert(payload)
        .select('id, codigo, nombre_apellido, email, cabana, pax, fecha_entrada, fecha_salida, noches, monto_total, sena1_monto, sena1_tipo, sena1_fecha, estado')
        .single()
      err = insertErr
      newReserva = inserted

      if (!err && newReserva) {
        const hoy = new Date().toISOString().slice(0, 10)
        const cajaOps = []

        if (Number(form.sena1_monto) > 0) {
          const tabla = form.sena1_tipo === 'Mercado Pago' ? 'caja_mercado_pago' : 'caja_banco'
          cajaOps.push(supabase.from(tabla).insert({
            fecha:          form.sena1_fecha || hoy,
            detalle:        `1ª Seña · ${form.codigo} - ${form.nombre_apellido}`,
            reserva_codigo: form.codigo,
            reserva_nombre: form.nombre_apellido,
            ingreso:        Number(form.sena1_monto),
            egreso:         0,
          }))
        }

        if (Number(form.sena2_monto) > 0) {
          const tabla = form.sena2_tipo === 'Mercado Pago' ? 'caja_mercado_pago' : 'caja_banco'
          cajaOps.push(supabase.from(tabla).insert({
            fecha:          form.sena2_fecha || hoy,
            detalle:        `2ª Seña · ${form.codigo} - ${form.nombre_apellido}`,
            reserva_codigo: form.codigo,
            reserva_nombre: form.nombre_apellido,
            ingreso:        Number(form.sena2_monto),
            egreso:         0,
          }))
        }

        if (Number(form.pago_cabana_monto) > 0) {
          cajaOps.push(supabase.from('caja_silvia').insert({
            fecha:           form.pago_cabana_fecha || hoy,
            cuenta:          'Alquiler',
            detalle:         `Pago en cabaña · ${form.codigo} - ${form.nombre_apellido}`,
            ingreso_pesos:   Number(form.pago_cabana_monto),
            ingreso_dolares: 0,
            ingreso_juli:    0,
            gasto:           0,
            retiro_pesos:    0,
            retiro_dolares:  0,
          }))
        }

        if (cajaOps.length > 0) await Promise.all(cajaOps)
      }
    }

    setSaving(false)

    if (err) {
      setError('Error al guardar: ' + err.message)
      return
    }

    navigate('/reservas')

    if (newReserva) {
      console.log('[ReservaForm] Reserva creada, disparando email. Estado:', form.estado, '| Email:', form.email)
      if (form.estado === 'Pendiente' && form.email) {
        console.log('[ReservaForm] → Enviando email de confirmación...')
        sendEmailConfirmacion(newReserva)
          .then(async (sentAt) => {
            console.log('[ReservaForm] Email confirmación OK, sentAt:', sentAt)
            if (sentAt) {
              await supabase.from('reservas').update({
                email_confirmacion_enviado_at: sentAt,
                fecha_vencimiento: new Date(new Date(sentAt).getTime() + 48 * 60 * 60 * 1000).toISOString(),
              }).eq('id', newReserva.id)
            }
          })
          .catch((e) => console.error('[ReservaForm] Email confirmación ERROR:', e))
      } else if (form.estado === 'Confirmada' && form.email && Number(form.sena1_monto) > 0) {
        console.log('[ReservaForm] → Enviando email de recibo...')
        const total_pagado = Number(form.sena1_monto || 0) + Number(form.sena2_monto || 0)
        const saldoEmail = Number(form.monto_total || 0) - total_pagado
        sendEmailRecibo(newReserva, {
          titulo: '1ª Seña',
          monto: Number(form.sena1_monto),
          fecha: form.sena1_fecha,
          tipo: form.sena1_tipo,
          total_pagado,
          saldo: saldoEmail,
        })
          .then(() => console.log('[ReservaForm] Email recibo OK'))
          .catch((e) => console.error('[ReservaForm] Email recibo ERROR:', e))
      } else {
        console.log('[ReservaForm] No se envía email. Estado:', form.estado, '| Tiene email:', !!form.email, '| Seña1:', form.sena1_monto)
      }
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
            <Field label="Email del cliente" required>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                required
                className={inputClass}
                placeholder="ejemplo@gmail.com"
              />
            </Field>
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
              {isEdit ? (
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    value={form.monto_total}
                    onChange={(e) => { set('monto_total', e.target.value); setMontoModificado(true) }}
                    className={inputClass}
                    placeholder="0"
                  />
                  {montoModificado && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 bg-orange-100 text-orange-700 text-xs font-medium px-2 py-0.5 rounded-full pointer-events-none">
                      Precio personalizado
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <div className={`${inputClass} bg-gray-50 text-gray-700 font-medium`}>
                    {form.monto_total
                      ? `$${Number(form.monto_total).toLocaleString('es-AR')}`
                      : '—'}
                  </div>
                  {precioNoche && form.noches > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      {form.noches} noches × ${Number(precioNoche).toLocaleString('es-AR')}/noche · {precioNombrePeriodo}
                    </p>
                  )}
                  {!precioNoche && form.fecha_entrada && (
                    <p className="text-xs text-orange-500 mt-1">
                      Sin precio configurado para estas fechas. Cargá un período en Precios.
                    </p>
                  )}
                </>
              )}
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
              <div className="col-span-2">
                <Field label="Fecha">
                  <input
                    type="date"
                    value={form.sena1_fecha}
                    onChange={(e) => set('sena1_fecha', e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
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
              <div className="col-span-2">
                <Field label="Fecha">
                  <input
                    type="date"
                    value={form.sena2_fecha}
                    onChange={(e) => set('sena2_fecha', e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
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

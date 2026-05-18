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
  descuento_aplicar:      false,
  descuento_porcentaje:   '',
  descuento_motivo:       '',
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
      <label className="block section-label mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputClass = "field"

// Dado un tipo de seña, devuelve la tabla de caja correspondiente
function tablaCajaPorTipo(tipo) {
  if (tipo === 'Mercado Pago') return 'caja_mercado_pago'
  return 'caja_banco'
}

// Sincroniza una seña (1 o 2) en caja_banco / caja_mercado_pago
async function syncCajaSeña(num, codigo, nombre, origMonto, origTipo, nuevoMonto, nuevoTipo, nuevaFecha) {
  const hoy = new Date().toISOString().slice(0, 10)
  const prefijo = num === 1 ? '1ª Seña' : '2ª Seña'

  if (Number(origMonto || 0) > 0) {
    await supabase.from(tablaCajaPorTipo(origTipo)).delete()
      .eq('reserva_codigo', codigo)
      .ilike('detalle', `${prefijo}%`)
  }
  if (Number(nuevoMonto || 0) > 0) {
    await supabase.from(tablaCajaPorTipo(nuevoTipo)).insert({
      fecha:          nuevaFecha || hoy,
      detalle:        `${prefijo} · ${codigo} - ${nombre}`,
      reserva_codigo: codigo,
      reserva_nombre: nombre,
      ingreso:        Number(nuevoMonto),
      egreso:         0,
    })
  }
}

// Sincroniza pago en cabaña en caja_silvia
async function syncCajaSilvia(codigo, nombre, origMonto, nuevoMonto, nuevaFecha) {
  const hoy = new Date().toISOString().slice(0, 10)
  if (Number(origMonto || 0) > 0) {
    await supabase.from('caja_silvia').delete()
      .ilike('detalle', `Pago en cabaña · ${codigo}%`)
  }
  if (Number(nuevoMonto || 0) > 0) {
    await supabase.from('caja_silvia').insert({
      fecha:           nuevaFecha || hoy,
      cuenta:          'Alquiler',
      detalle:         `Pago en cabaña · ${codigo} - ${nombre}`,
      ingreso_pesos:   Number(nuevoMonto),
      ingreso_dolares: 0,
      ingreso_juli:    0,
      gasto:           0,
      retiro_pesos:    0,
      retiro_dolares:  0,
    })
  }
}

export default function ReservaForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [error, setError] = useState('')
  const [precioNombrePeriodo, setPrecioNombrePeriodo] = useState('')
  const [precioMinWarning, setPrecioMinWarning] = useState(null)
  const [sinPeriodo, setSinPeriodo] = useState(false)
  const [precioBaseNeto, setPrecioBaseNeto] = useState(null)
  const [montoModificado, setMontoModificado] = useState(false)
  const [originalPagos, setOriginalPagos] = useState(null)

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
            descuento_aplicar:    false,
            descuento_porcentaje: '',
            descuento_motivo:     '',
          })
          setOriginalPagos({
            sena1_monto:      data.sena1_monto,
            sena1_tipo:       data.sena1_tipo ?? 'Banco',
            sena1_fecha:      data.sena1_fecha,
            sena2_monto:      data.sena2_monto,
            sena2_tipo:       data.sena2_tipo ?? 'Banco',
            sena2_fecha:      data.sena2_fecha,
            pago_cabana_monto: data.pago_cabana_monto,
            pago_cabana_fecha: data.pago_cabana_fecha,
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
    if (!form.fecha_entrada || !form.fecha_salida || !form.noches || form.noches <= 0) {
      setPrecioNombrePeriodo('')
      setPrecioMinWarning(null)
      setSinPeriodo(false)
      setPrecioBaseNeto(null)
      return
    }

    const pax     = Number(form.pax) || 2
    const safePax = Math.min(Math.max(pax, 2), 7)

    ;(async () => {
      const { data: periodos, error: errPeriodos } = await supabase
        .from('periodos_precios')
        .select('id, nombre, fecha_inicio, fecha_fin, minimo_noches')
        .order('orden')

      console.log('[Precios] fecha_entrada:', form.fecha_entrada, '| pax:', safePax,
        '| períodos obtenidos:', periodos?.length, '| error:', errPeriodos?.message)

      if (errPeriodos || !periodos || periodos.length === 0) {
        setSinPeriodo(true); setPrecioNombrePeriodo(''); setPrecioBaseNeto(null)
        setPrecioMinWarning(null); return
      }

      // ISO date strings are directly comparable as strings (lexicographic = chronologic)
      // End boundary is EXCLUSIVE: fecha_fin is the first day of the NEXT period
      const fechaEntrada = form.fecha_entrada
      const periodoEntrada = periodos.find((p) => {
        const afterStart = fechaEntrada >= p.fecha_inicio
        const beforeEnd  = !p.fecha_fin || fechaEntrada < p.fecha_fin
        console.log(`[Precios]  → "${p.nombre}" ${p.fecha_inicio}–${p.fecha_fin ?? '∞'}: afterStart=${afterStart} beforeEnd=${beforeEnd}`)
        return afterStart && beforeEnd
      })

      if (!periodoEntrada) {
        console.log('[Precios] ✗ Sin período para:', fechaEntrada)
        setSinPeriodo(true); setPrecioNombrePeriodo(''); setPrecioBaseNeto(null)
        setPrecioMinWarning(null); return
      }

      console.log('[Precios] ✓ Período:', periodoEntrada.nombre)
      setSinPeriodo(false)

      const warn = Number(periodoEntrada.minimo_noches) > form.noches
        ? `Mínimo ${periodoEntrada.minimo_noches} noches para este período`
        : null
      setPrecioMinWarning(warn)

      // Fetch prices for all periods × safePax
      const { data: preciosPax, error: errPax } = await supabase
        .from('precios_pax')
        .select('periodo_id, pax, precio_noche, precio_semana')
        .in('periodo_id', periodos.map((p) => p.id))
        .eq('pax', safePax)

      console.log('[Precios] precios_pax:', preciosPax?.length, '| error:', errPax?.message)

      if (errPax || !preciosPax || preciosPax.length === 0) {
        // Period found but no price rows for this PAX
        setPrecioNombrePeriodo(periodoEntrada.nombre)
        setPrecioBaseNeto(null)
        return
      }

      const getPrecio = (periodoId) => preciosPax.find((r) => r.periodo_id === periodoId) || null

      // Exactly 7 nights → weekly price
      if (form.noches === 7) {
        const pp = getPrecio(periodoEntrada.id)
        if (pp && Number(pp.precio_semana) > 0) {
          const weeklyTotal = Math.round(Number(pp.precio_semana))
          setPrecioNombrePeriodo(`${periodoEntrada.nombre} · precio semana · ${safePax} PAX`)
          setPrecioBaseNeto(weeklyTotal)
          set('monto_total', String(weeklyTotal))
          console.log('[Precios] ✓ Semana completa:', weeklyTotal)
          return
        }
      }

      // Proportional: iterate night by night using string dates (no timezone risk)
      let total = 0
      let dateStr = form.fecha_entrada
      let breakdown = []

      for (let n = 0; n < form.noches; n++) {
        const periodo = periodos.find((p) =>
          dateStr >= p.fecha_inicio && (!p.fecha_fin || dateStr < p.fecha_fin)
        )
        if (periodo) {
          const pp = getPrecio(periodo.id)
          const precioNocheActual = pp ? Number(pp.precio_noche) : 0
          total += precioNocheActual
          const last = breakdown[breakdown.length - 1]
          if (last && last.id === periodo.id) {
            last.noches++
          } else {
            breakdown.push({ id: periodo.id, nombre: periodo.nombre, noches: 1, precio: precioNocheActual })
          }
        }
        // Advance by 1 day using string manipulation (avoids timezone drift)
        const d = new Date(dateStr + 'T12:00:00')
        d.setDate(d.getDate() + 1)
        dateStr = d.toISOString().slice(0, 10)
      }

      const detalleTexto = breakdown.length > 1
        ? breakdown.map((b) => `${b.noches}n × $${b.precio.toLocaleString('es-AR')} (${b.nombre})`).join(' + ')
        : `${periodoEntrada.nombre} · ${safePax} PAX`

      const computedTotal = total > 0 ? Math.round(total) : null
      setPrecioNombrePeriodo(detalleTexto)
      setPrecioBaseNeto(computedTotal)
      if (computedTotal) set('monto_total', String(computedTotal))
      console.log('[Precios] ✓ Total:', computedTotal, '|', detalleTexto)
    })()
  }, [form.fecha_entrada, form.fecha_salida, form.noches, form.pax, isEdit])

  // Aplicar descuento al monto base calculado (solo en crear)
  useEffect(() => {
    if (isEdit || precioBaseNeto === null) return
    if (!form.descuento_aplicar || !form.descuento_porcentaje) {
      set('monto_total', String(precioBaseNeto))
      return
    }
    const pct = Number(form.descuento_porcentaje)
    if (pct <= 0 || pct > 100) { set('monto_total', String(precioBaseNeto)); return }
    set('monto_total', String(Math.round(precioBaseNeto * (1 - pct / 100))))
  }, [form.descuento_aplicar, form.descuento_porcentaje, precioBaseNeto, isEdit])

  const handleFechaEntrada = (value) => {
    const noches = calcNoches(value, form.fecha_salida)
    const mes = getMes(value)
    setMontoModificado(false)
    setForm((f) => ({ ...f, fecha_entrada: value, noches, mes }))
  }

  const handleFechaSalida = (value) => {
    const noches = calcNoches(form.fecha_entrada, value)
    setMontoModificado(false)
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

    if (form.cabana && form.fecha_entrada && form.fecha_salida) {
      let q = supabase
        .from('reservas')
        .select('nombre_apellido, fecha_entrada, fecha_salida')
        .eq('cabana', form.cabana)
        .neq('estado', 'Cancelada')
        .lt('fecha_entrada', form.fecha_salida)
        .gt('fecha_salida', form.fecha_entrada)
      if (isEdit) q = q.neq('id', id)
      const { data: overlaps } = await q
      if (overlaps && overlaps.length > 0) {
        const o = overlaps[0]
        const fmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        setError(`La cabaña ${form.cabana} ya tiene una reserva del ${fmt(o.fecha_entrada)} al ${fmt(o.fecha_salida)} (${o.nombre_apellido}). Elegí otras fechas o una cabaña diferente.`)
        return
      }
    }

    setSaving(true)

    // Auto-cambiar estado Pendiente → Confirmada si hay al menos un pago
    const hasPago =
      Number(form.sena1_monto || 0) > 0 ||
      Number(form.sena2_monto || 0) > 0 ||
      Number(form.pago_cabana_monto || 0) > 0
    const estadoFinal = form.estado === 'Pendiente' && hasPago ? 'Confirmada' : form.estado

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
      estado: estadoFinal,
      observaciones: form.observaciones || null,
    }

    let err
    let newReserva = null

    if (isEdit) {
      ({ error: err } = await supabase.from('reservas').update(payload).eq('id', id))

      // Sincronizar cajas si no hubo error
      if (!err && originalPagos) {
        await Promise.all([
          syncCajaSeña(1, form.codigo, form.nombre_apellido,
            originalPagos.sena1_monto, originalPagos.sena1_tipo,
            form.sena1_monto, form.sena1_tipo, form.sena1_fecha),
          syncCajaSeña(2, form.codigo, form.nombre_apellido,
            originalPagos.sena2_monto, originalPagos.sena2_tipo,
            form.sena2_monto, form.sena2_tipo, form.sena2_fecha),
          syncCajaSilvia(form.codigo, form.nombre_apellido,
            originalPagos.pago_cabana_monto,
            form.pago_cabana_monto, form.pago_cabana_fecha),
        ])
      }
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

    const autoConfirmado = estadoFinal === 'Confirmada' && form.estado === 'Pendiente'
    const navState = autoConfirmado ? { state: { toast: 'Reserva confirmada automáticamente' } } : {}

    if (isEdit) {
      navigate(`/reservas/${id}`, navState)
    } else {
      navigate(newReserva ? `/reservas/${newReserva.id}` : '/reservas', navState)
    }

    if (!isEdit && newReserva) {
      if (estadoFinal === 'Pendiente' && form.email) {
        sendEmailConfirmacion(newReserva)
          .then(async (sentAt) => {
            if (sentAt) {
              await supabase.from('reservas').update({
                email_confirmacion_enviado_at: sentAt,
                fecha_vencimiento: new Date(new Date(sentAt).getTime() + 48 * 60 * 60 * 1000).toISOString(),
              }).eq('id', newReserva.id)
            }
          })
          .catch((e) => console.error('[ReservaForm] Email confirmación ERROR:', e))
      } else if (estadoFinal === 'Confirmada' && form.email && Number(form.sena1_monto) > 0) {
        const total_pagado = Number(form.sena1_monto || 0) + Number(form.sena2_monto || 0)
        const saldoEmail = Number(form.monto_total || 0) - total_pagado
        sendEmailRecibo(newReserva, {
          titulo: '1ª Seña',
          monto: Number(form.sena1_monto),
          fecha: form.sena1_fecha,
          tipo: form.sena1_tipo,
          total_pagado,
          saldo: saldoEmail,
        }).catch((e) => console.error('[ReservaForm] Email recibo ERROR:', e))
      }
    } else if (isEdit && autoConfirmado && form.email) {
      const origSena1 = Number(originalPagos?.sena1_monto || 0)
      if (origSena1 === 0 && Number(form.sena1_monto || 0) > 0) {
        const total_pagado =
          Number(form.sena1_monto || 0) +
          Number(form.sena2_monto || 0) +
          Number(form.pago_cabana_monto || 0)
        sendEmailRecibo({
          email:           form.email,
          nombre_apellido: form.nombre_apellido,
          codigo:          form.codigo,
          cabana:          form.cabana,
          fecha_entrada:   form.fecha_entrada,
          fecha_salida:    form.fecha_salida,
          monto_total:     form.monto_total,
        }, {
          titulo: '1ª Seña',
          monto: Number(form.sena1_monto),
          fecha: form.sena1_fecha,
          tipo: form.sena1_tipo,
          total_pagado,
          saldo: Number(form.monto_total || 0) - total_pagado,
        }).catch((e) => console.error('[ReservaForm] Email recibo edit ERROR:', e))
      }
    }
  }

  if (loading) {
    return <p className="text-gray-500 text-center py-16">Cargando...</p>
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(isEdit ? `/reservas/${id}` : '/reservas')} className="text-[#888] hover:text-[#333] text-sm transition-colors">
          ← Volver
        </button>
        <h1 className="text-[28px] font-bold text-[#111111]">
          {isEdit ? `Editar ${form.codigo}` : 'Nueva reserva'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Sección 1: Huésped */}
        <div className="card">
          <h3 className="text-[18px] font-semibold text-[#111111] mb-4">
            Información del huésped
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <div className="card">
          <h3 className="text-[18px] font-semibold text-[#111111] mb-4">
            Datos de la reserva
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                onChange={(e) => { set('pax', e.target.value); setMontoModificado(false) }}
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
              {!isEdit && (
                <>
                  {precioNombrePeriodo && !sinPeriodo && (
                    <p className="text-xs text-gray-400 mt-1">{precioNombrePeriodo}
                      {precioBaseNeto === null && ' · sin precios cargados, ingresá el monto manualmente'}
                    </p>
                  )}
                  {precioMinWarning && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{precioMinWarning}</p>
                  )}
                  {sinPeriodo && form.fecha_entrada && (
                    <p className="text-xs text-orange-500 mt-1">
                      No hay período configurado para estas fechas. Podés ingresar el monto manualmente.
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

            {/* Descuento */}
            <div className="col-span-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer w-fit mb-3">
                <input
                  type="checkbox"
                  checked={form.descuento_aplicar}
                  onChange={(e) => set('descuento_aplicar', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-700">Aplicar descuento</span>
              </label>

              {form.descuento_aplicar && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Porcentaje (%)">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={form.descuento_porcentaje}
                        onChange={(e) => set('descuento_porcentaje', e.target.value)}
                        className={inputClass}
                        placeholder="Ej: 10"
                      />
                    </Field>
                    <Field label="Motivo">
                      <input
                        type="text"
                        value={form.descuento_motivo}
                        onChange={(e) => set('descuento_motivo', e.target.value)}
                        className={inputClass}
                        placeholder="Ej: Cliente frecuente"
                      />
                    </Field>
                  </div>

                  {/* Desglose (create mode only) */}
                  {!isEdit && precioBaseNeto && Number(form.descuento_porcentaje) > 0 && (
                    <div className="space-y-1.5 text-sm border-t border-green-200 pt-3">
                      <div className="flex justify-between text-gray-600">
                        <span>Precio base</span>
                        <span>${precioBaseNeto.toLocaleString('es-AR')}</span>
                      </div>
                      <div className="flex justify-between text-red-600 font-medium">
                        <span>Descuento ({form.descuento_porcentaje}%)</span>
                        <span>− ${Math.round(precioBaseNeto * Number(form.descuento_porcentaje) / 100).toLocaleString('es-AR')}</span>
                      </div>
                      <div className="flex justify-between font-bold text-gray-800 border-t border-green-200 pt-1.5">
                        <span>Total final</span>
                        <span>${Number(form.monto_total || 0).toLocaleString('es-AR')}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sección 3: Pagos */}
        <div className="bg-white rounded-xl shadow p-6 space-y-6">
          <h3 className="text-[18px] font-semibold text-[#111111]">
            Historial de pagos
          </h3>

          {/* 1ª Seña */}
          <div className="card-sm">
            <p className="text-sm font-semibold text-[#d2ab84] mb-3">1ª Seña</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="card-sm">
            <p className="text-sm font-semibold text-[#d2ab84] mb-3">2ª Seña</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="card-sm">
            <p className="text-sm font-semibold text-[#d2ab84] mb-3">Pago en cabaña</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <div className="card">
          <h3 className="text-[18px] font-semibold text-[#111111] mb-4">
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
            onClick={() => navigate(isEdit ? `/reservas/${id}` : '/reservas')}
            className="btn-secondary flex-1 py-2.5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex-1 py-2.5 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear reserva'}
          </button>
        </div>
      </form>
    </div>
  )
}

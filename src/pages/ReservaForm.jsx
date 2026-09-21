import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import FileUpload from '../components/FileUpload'
import { sendEmailConfirmacion, sendEmailRecibo } from '../lib/email'
import { useComplejo } from '../context/ComplejoContext'
import { fechaEstaCerrada, labelCierre } from '../lib/cierres'
import { totalPagadoReserva, excedeSaldoReserva } from '../lib/pagosReserva'

// Este archivo exporta algunas funciones puras/async (calcNoches/getMes/
// fechaMasReciente/getConflicto/fetchNextCode/resolverPeriodoEntrada/
// resolverPrecioReserva) además del componente
// default, para que los tests unitarios (tests/unit/) puedan importar y
// ejercitar la lógica real en vez de reimplementarla. Eso rompe el
// supuesto de Fast Refresh de "un archivo de componente sólo exporta
// componentes" — sin impacto en runtime/producción, sólo hace que Vite
// recargue toda la página en vez de hacer hot-swap al editar este
// archivo en desarrollo.
/* eslint-disable react-refresh/only-export-components */

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

export function calcNoches(entrada, salida) {
  if (!entrada || !salida) return 0
  const diff = new Date(salida) - new Date(entrada)
  return Math.max(0, Math.round(diff / 86400000))
}

export function getMes(fechaStr) {
  if (!fechaStr) return ''
  const d = new Date(fechaStr + 'T12:00:00')
  return MESES[d.getMonth()]
}

export async function fetchNextCode(complejoId) {
  const { data } = await supabase
    .from('reservas')
    .select('codigo')
    .eq('complejo_id', complejoId)
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
async function syncCajaSeña(num, codigo, nombre, origMonto, origTipo, nuevoMonto, nuevoTipo, nuevaFecha, complejoId) {
  const hoy = new Date().toISOString().slice(0, 10)
  const prefijo = num === 1 ? '1ª Seña' : '2ª Seña'

  if (Number(origMonto || 0) > 0) {
    await supabase.from(tablaCajaPorTipo(origTipo)).delete()
      .eq('reserva_codigo', codigo)
      .ilike('detalle', `${prefijo}%`)
      .eq('complejo_id', complejoId)
  }
  if (Number(nuevoMonto || 0) > 0) {
    await supabase.from(tablaCajaPorTipo(nuevoTipo)).insert({
      complejo_id:    complejoId,
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
async function syncCajaSilvia(codigo, nombre, origMonto, nuevoMonto, nuevaFecha, complejoId) {
  const hoy = new Date().toISOString().slice(0, 10)
  if (Number(origMonto || 0) > 0) {
    await supabase.from('caja_silvia').delete()
      .ilike('detalle', `Pago en cabaña · ${codigo}%`)
      .eq('complejo_id', complejoId)
  }
  if (Number(nuevoMonto || 0) > 0) {
    await supabase.from('caja_silvia').insert({
      complejo_id:     complejoId,
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

// Entre las fechas cargadas (sena1_fecha / sena2_fecha / pago_cabana_fecha,
// cualquiera puede venir vacía), se usa la más reciente de las que sí están
// cargadas — comparables directamente como string porque son ISO (YYYY-MM-DD).
// Si ninguna está cargada, hoy.
export function fechaMasReciente(...fechas) {
  const validas = fechas.filter(Boolean)
  if (validas.length === 0) return new Date().toISOString().slice(0, 10)
  return validas.reduce((masReciente, f) => (f > masReciente ? f : masReciente))
}

// --- Complejos NO-VIP: seña + pago en cabaña combinados en UNA fila de
// movimientos_caja (origen='sena'), bucketeada por método de pago:
//   sena1_tipo/sena2_tipo 'Banco'        → monto_depositos
//   sena1_tipo/sena2_tipo 'Mercado Pago' → monto_otros
//   pago_cabana_monto (siempre efectivo) → monto_efectivo
// Upsert por (reserva_id, origen='sena'): si ya existe la fila se
// actualizan sólo los montos (incluso a 0); si no existe y hay algún
// monto > 0, recién ahí se crea. Ya no depende de ninguna temporada —
// movimientos_caja es un libro contable continuo, igual que la Caja
// de Cabañas VIP.
async function syncMovimientoSena(complejoActivo, reservaId, codigo, nombre, sena1Monto, sena1Tipo, sena1Fecha, sena2Monto, sena2Tipo, sena2Fecha, pagoCabanaMonto, pagoCabanaFecha) {
  const montoDepositos =
    (sena1Tipo === 'Banco' ? Number(sena1Monto || 0) : 0) +
    (sena2Tipo === 'Banco' ? Number(sena2Monto || 0) : 0)
  const montoOtros =
    (sena1Tipo === 'Mercado Pago' ? Number(sena1Monto || 0) : 0) +
    (sena2Tipo === 'Mercado Pago' ? Number(sena2Monto || 0) : 0)
  const montoEfectivo = Number(pagoCabanaMonto || 0)

  const { data: existentes } = await supabase
    .from('movimientos_caja')
    .select('id')
    .eq('reserva_id', reservaId)
    .eq('origen', 'sena')
    .eq('complejo_id', complejoActivo.id)
    .limit(1)
  const existente = existentes && existentes.length > 0 ? existentes[0] : null

  if (!existente && montoDepositos <= 0 && montoEfectivo <= 0 && montoOtros <= 0) {
    return
  }

  if (existente) {
    await supabase.from('movimientos_caja').update({
      monto_depositos: montoDepositos,
      monto_efectivo:  montoEfectivo,
      monto_otros:     montoOtros,
    }).eq('id', existente.id).eq('complejo_id', complejoActivo.id)
    return
  }

  await supabase.from('movimientos_caja').insert({
    complejo_id:     complejoActivo.id,
    tipo:            'ingreso',
    categoria:       'alquiler',
    reserva_id:      reservaId,
    origen:          'sena',
    fecha:           fechaMasReciente(sena1Fecha, sena2Fecha, pagoCabanaFecha),
    detalle:         `Seña — ${codigo} ${nombre}`,
    monto_depositos: montoDepositos,
    monto_efectivo:  montoEfectivo,
    monto_otros:     montoOtros,
  })
}

// Query real de las reservas (no canceladas) de una cabaña en un
// complejo — usada por el chequeo de conflicto de fechas. Exportada
// para que los tests de integración (tests/integration/) puedan
// ejercitarla directamente en vez de reimplementarla.
export async function fetchReservasOcupadasPorCabana(supabase, complejoId, cabana) {
  return supabase
    .from('reservas')
    .select('id, fecha_entrada, fecha_salida, nombre_apellido')
    .eq('cabana', cabana)
    .eq('complejo_id', complejoId)
    .neq('estado', 'Cancelada')
}

export function getConflicto(entrada, salida, ranges) {
  if (!entrada || !salida || !ranges || ranges.length === 0) return ''
  const fmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  for (const o of ranges) {
    if (entrada < o.fecha_salida && salida > o.fecha_entrada) {
      return `Fechas ocupadas: ${o.nombre_apellido} (${fmt(o.fecha_entrada)} al ${fmt(o.fecha_salida)})`
    }
  }
  return ''
}

// Busca el período (de periodos_precios, ya cargados) que cubre una
// fecha de entrada. Fechas ISO son comparables directamente como
// string (lexicográfico = cronológico). El límite fecha_fin es
// EXCLUSIVO: esa fecha ya pertenece al período siguiente.
export function resolverPeriodoEntrada(periodos, fechaEntrada) {
  if (!periodos || periodos.length === 0) return null
  return periodos.find((p) => fechaEntrada >= p.fecha_inicio && (!p.fecha_fin || fechaEntrada < p.fecha_fin)) || null
}

// Resuelve el precio de una reserva dado un catálogo de periodos_precios
// + precios_pax ya cargados, la fecha de entrada, la cantidad de noches
// y el pax — sin tocar la base ni el estado de ningún componente.
// IMPORTANTE: `preciosPax` tiene que venir YA filtrado por el pax
// buscado (como hace la query real, con `.eq('pax', safePax)`) — acá
// adentro sólo se busca por `periodo_id` (`getPrecio`, más abajo), sin
// filtrar por pax de nuevo. Eso es seguro porque `precios_pax` tiene un
// UNIQUE(periodo_id, pax) en la base, así que una vez fijado el pax no
// puede haber más de una fila por período — pero si a esta función se
// le pasa un catálogo con varios pax mezclados, va a devolver lo que
// encuentre primero para ese período, no necesariamente lo del `pax`
// recibido acá (que sólo se usa para el clamp/las etiquetas).
// Prioridad 3 — tarifa por tramos: estadías de menos de una semana usan
// noches * precio_noche del período de entrada; de una semana o más,
// weeks * precio_semana + remainder * precio_noche_adicional SI ese
// período ya tiene precio_noche_adicional cargado (columna nueva
// nullable), si no cae a la fórmula vieja (precio semana exacto a 7
// noches / prorrateo noche a noche cruzando períodos) — ver
// resolverPrecioReservaClasico, más abajo.
// Devuelve todo lo que el caller necesita para actualizar su estado:
//   - sinPeriodo: no hay ningún período que cubra la fecha de entrada
//   - precioNombrePeriodo: texto a mostrar (semanas + noches
//     adicionales / precio semana / desglose noche a noche / "nombre ·
//     N PAX"), o el nombre pelado del período si hay período pero no
//     hay precio cargado para ese pax
//   - total: precio final calculado, o null si no se pudo calcular
export function resolverPrecioReserva(periodos, preciosPax, fechaEntrada, noches, pax) {
  const safePax = Math.min(Math.max(Number(pax) || 2, 2), 7)

  const periodoEntrada = resolverPeriodoEntrada(periodos, fechaEntrada)
  if (!periodoEntrada) {
    return { sinPeriodo: true, precioNombrePeriodo: '', total: null }
  }

  if (!preciosPax || preciosPax.length === 0) {
    // Hay período pero no hay precio cargado para este pax.
    return { sinPeriodo: false, precioNombrePeriodo: periodoEntrada.nombre, total: null }
  }

  const getPrecio = (periodoId) => preciosPax.find((r) => r.periodo_id === periodoId) || null

  // Prioridad 3 — tarifa por tramos (023_precios_pax_noche_adicional.sql):
  // semanas completas a precio_semana + noches sueltas (remainder) a
  // precio_noche_adicional, PERO sólo una vez que el período de entrada
  // tenga precio_noche_adicional cargado (columna nueva, nullable — regla
  // confirmada con el cliente). weeks===0 (estadía individual, menos de
  // una semana) delega directo a la fórmula vieja (resolverPrecioReservaClasico,
  // más abajo) SIN pasar por ningún camino nuevo — para una estadía de un
  // solo período eso da exactamente noches * precio_noche (lo que pide la
  // consigna), pero además preserva, sin ningún cambio, el prorrateo
  // noche a noche cruzando períodos (o cayendo en un hueco sin período)
  // que ya estaba probado en pricing-lookup.test.js para estadías cortas
  // — no hay ningún motivo para que agregar tarifa por semana rompa ESE
  // comportamiento, que es independiente.
  const weeks = Math.floor(noches / 7)
  const remainder = noches % 7

  if (weeks === 0) {
    return resolverPrecioReservaClasico(periodos, getPrecio, periodoEntrada, fechaEntrada, noches, safePax)
  }

  const pp = getPrecio(periodoEntrada.id)
  if (pp && pp.precio_noche_adicional !== null && pp.precio_noche_adicional !== undefined) {
    const total = Math.round(weeks * Number(pp.precio_semana) + remainder * Number(pp.precio_noche_adicional))
    const detalle = remainder === 0
      ? `${periodoEntrada.nombre} · ${weeks} semana${weeks !== 1 ? 's' : ''} · ${safePax} PAX`
      : `${periodoEntrada.nombre} · ${weeks} semana${weeks !== 1 ? 's' : ''} + ${remainder} noche${remainder !== 1 ? 's' : ''} adicional${remainder !== 1 ? 'es' : ''} · ${safePax} PAX`
    return { sinPeriodo: false, precioNombrePeriodo: detalle, total: total > 0 ? total : null }
  }

  // Fallback: el período de entrada todavía no tiene precio_noche_adicional
  // cargado (o no hay fila de precios_pax para ese período) — fórmula
  // vieja, verbatim, backward-compatible genérico (no específico de VIP).
  return resolverPrecioReservaClasico(periodos, getPrecio, periodoEntrada, fechaEntrada, noches, safePax)
}

// Fórmula previa a Prioridad 3, preservada tal cual (línea por línea) —
// usada como fallback por resolverPrecioReserva mientras un período no
// tenga precio_noche_adicional cargado.
function resolverPrecioReservaClasico(periodos, getPrecio, periodoEntrada, fechaEntrada, noches, safePax) {
  // Exactamente 7 noches → precio semana, si está cargado.
  if (noches === 7) {
    const pp = getPrecio(periodoEntrada.id)
    if (pp && Number(pp.precio_semana) > 0) {
      const weeklyTotal = Math.round(Number(pp.precio_semana))
      return {
        sinPeriodo: false,
        precioNombrePeriodo: `${periodoEntrada.nombre} · precio semana · ${safePax} PAX`,
        total: weeklyTotal,
      }
    }
  }

  // Proporcional, noche a noche (con strings de fecha, sin riesgo de timezone).
  let total = 0
  let dateStr = fechaEntrada
  let breakdown = []

  for (let n = 0; n < noches; n++) {
    const periodo = resolverPeriodoEntrada(periodos, dateStr)
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
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    dateStr = d.toISOString().slice(0, 10)
  }

  const detalleTexto = breakdown.length > 1
    ? breakdown.map((b) => `${b.noches}n × $${b.precio.toLocaleString('es-AR')} (${b.nombre})`).join(' + ')
    : `${periodoEntrada.nombre} · ${safePax} PAX`

  const computedTotal = total > 0 ? Math.round(total) : null
  return { sinPeriodo: false, precioNombrePeriodo: detalleTexto, total: computedTotal }
}

export default function ReservaForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { complejoActivo, cabanasNombres: CABANAS, cabanasPorGrupo } = useComplejo()
  const isEdit = Boolean(id)

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [error, setError] = useState('')
  const [precioNombrePeriodo, setPrecioNombrePeriodo] = useState('')

  const [sinPeriodo, setSinPeriodo] = useState(false)
  const [precioBaseNeto, setPrecioBaseNeto] = useState(null)
  const [montoModificado, setMontoModificado] = useState(false)
  const [originalPagos, setOriginalPagos] = useState(null)
  const [ocupadas, setOcupadas] = useState([])
  const [fechaConflicto, setFechaConflicto] = useState('')
  const [minimoNochesError, setMinimoNochesError] = useState('')
  const [grupoForm, setGrupoForm] = useState('')
  const pagoTotalRef = useRef(null)

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }))
    if (field === 'sena1_monto' || field === 'sena2_monto' || field === 'pago_cabana_monto' || field === 'monto_total') {
      pagoTotalRef.current?.setCustomValidity('')
    }
  }

  useEffect(() => {
    if (!isEdit) return
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
  }, [id, isEdit])

  // Guard contra respuesta obsoleta — mismo patrón/motivo que
  // Ganancias.jsx (complejoActivo pasa por un default antes de que
  // Layout.jsx lo corrija al slug de la URL; sin esto, un código
  // calculado para el complejo viejo podría pisar al del correcto).
  useEffect(() => {
    if (isEdit || !complejoActivo) return
    let cancelado = false
    fetchNextCode(complejoActivo.id).then((codigo) => {
      if (cancelado) return
      set('codigo', codigo)
    })
    return () => { cancelado = true }
  }, [isEdit, complejoActivo?.id])

  useEffect(() => {
    if (!form.cabana) return
    const seccion = cabanasPorGrupo.find((s) => s.cabanas.includes(form.cabana))
    if (seccion?.grupo) setGrupoForm(seccion.grupo)
  }, [form.cabana, cabanasPorGrupo])

  // Auto-calcular monto_total al crear (no al editar)
  //
  // Guard contra respuesta obsoleta — mismo patrón/motivo que
  // Ganancias.jsx: complejoActivo pasa por un default antes de que
  // Layout.jsx lo corrija al slug de la URL, y además este efecto se
  // vuelve a disparar en cada cambio de fecha/pax mientras el usuario
  // completa el formulario — sin el guard, una respuesta más vieja
  // (complejo o combinación de fecha/pax anterior) que resuelve después
  // de la más nueva pisaría el precio ya correcto. Se chequea después de
  // CADA await, no sólo al final, porque hay setState intermedios
  // (setSinPeriodo/setPrecioNombrePeriodo) en los early-return de abajo.
  useEffect(() => {
    if (isEdit) return
    if (!form.fecha_entrada || !form.fecha_salida || !form.noches || form.noches <= 0 || !complejoActivo) {
      setPrecioNombrePeriodo('')
      setSinPeriodo(false)
      setPrecioBaseNeto(null)
      return
    }

    const pax     = Number(form.pax) || 2
    const safePax = Math.min(Math.max(pax, 2), 7)
    let cancelado = false

    ;(async () => {
      const { data: periodos, error: errPeriodos } = await supabase
        .from('periodos_precios')
        .select('id, nombre, fecha_inicio, fecha_fin, minimo_noches')
        .eq('complejo_id', complejoActivo.id)
        .order('orden')

      if (cancelado) return
      console.log('[Precios] fecha_entrada:', form.fecha_entrada, '| pax:', safePax,
        '| períodos obtenidos:', periodos?.length, '| error:', errPeriodos?.message)

      if (errPeriodos || !periodos || periodos.length === 0) {
        setSinPeriodo(true); setPrecioNombrePeriodo(''); setPrecioBaseNeto(null)
        return
      }

      // Se chequea el período ANTES de pedir precios_pax — evita una
      // query de más cuando ya se sabe que no hay nada para calcular.
      const periodoEntrada = resolverPeriodoEntrada(periodos, form.fecha_entrada)
      if (!periodoEntrada) {
        console.log('[Precios] ✗ Sin período para:', form.fecha_entrada)
        setSinPeriodo(true); setPrecioNombrePeriodo(''); setPrecioBaseNeto(null)
        return
      }

      console.log('[Precios] ✓ Período:', periodoEntrada.nombre)
      setSinPeriodo(false)

      // Fetch prices for all periods × safePax
      const { data: preciosPax, error: errPax } = await supabase
        .from('precios_pax')
        .select('periodo_id, pax, precio_noche, precio_semana')
        .in('periodo_id', periodos.map((p) => p.id))
        .eq('pax', safePax)

      if (cancelado) return
      console.log('[Precios] precios_pax:', preciosPax?.length, '| error:', errPax?.message)

      const resultado = resolverPrecioReserva(periodos, errPax ? [] : preciosPax, form.fecha_entrada, form.noches, form.pax)
      setPrecioNombrePeriodo(resultado.precioNombrePeriodo)
      setPrecioBaseNeto(resultado.total)
      if (resultado.total) set('monto_total', String(resultado.total))
      console.log('[Precios] ✓ Resultado:', resultado.total, '|', resultado.precioNombrePeriodo)
    })()

    return () => { cancelado = true }
  }, [form.fecha_entrada, form.fecha_salida, form.noches, form.pax, isEdit, complejoActivo?.id])

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

  // Guard contra respuesta obsoleta — ver comentario en el efecto de
  // auto-cálculo de monto_total arriba (mismo motivo: complejo default +
  // cambios rápidos de fecha/noches mientras se completa el formulario).
  useEffect(() => {
    if (!form.fecha_entrada || !form.noches || form.noches <= 0 || !complejoActivo) {
      setMinimoNochesError(''); return
    }
    let cancelado = false
    supabase
      .from('periodos_precios')
      .select('nombre, minimo_noches')
      .eq('complejo_id', complejoActivo.id)
      .order('orden')
      .then(({ data }) => {
        if (cancelado) return
        if (!data || data.length === 0) { setMinimoNochesError(''); return }
        const p = data.find(period =>
          form.fecha_entrada >= period.fecha_inicio &&
          (!period.fecha_fin || form.fecha_entrada < period.fecha_fin)
        )
        if (!p) { setMinimoNochesError(''); return }
        const min = Number(p.minimo_noches) || 0
        setMinimoNochesError(min > 0 && form.noches < min
          ? `El período "${p.nombre}" requiere mínimo ${min} noches (reserva tiene ${form.noches})`
          : '')
      })
    return () => { cancelado = true }
  }, [form.fecha_entrada, form.noches, complejoActivo?.id])

  // Guard contra respuesta obsoleta — ver comentario en el efecto de
  // auto-cálculo de monto_total más arriba (mismo motivo: complejo
  // default + cambio de cabaña mientras se completa el formulario).
  useEffect(() => {
    if (!form.cabana || !complejoActivo) { setOcupadas([]); setFechaConflicto(''); return }
    let cancelado = false
    fetchReservasOcupadasPorCabana(supabase, complejoActivo.id, form.cabana)
      .then(({ data }) => {
        if (cancelado) return
        const ranges = (data || []).filter(r => !isEdit || String(r.id) !== String(id))
        setOcupadas(ranges)
        setFechaConflicto(getConflicto(form.fecha_entrada, form.fecha_salida, ranges))
      })
    return () => { cancelado = true }
  }, [form.cabana, isEdit, id, complejoActivo?.id])

  const handleFechaEntrada = (value) => {
    const noches = calcNoches(value, form.fecha_salida)
    const mes = getMes(value)
    setMontoModificado(false)
    setForm((f) => ({ ...f, fecha_entrada: value, noches, mes }))
    setFechaConflicto(getConflicto(value, form.fecha_salida, ocupadas))
  }

  const handleFechaSalida = (value) => {
    const noches = calcNoches(form.fecha_entrada, value)
    setMontoModificado(false)
    setForm((f) => ({ ...f, fecha_salida: value, noches }))
    setFechaConflicto(getConflicto(form.fecha_entrada, value, ocupadas))
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

    if (minimoNochesError) {
      setError(minimoNochesError + '. Ajustá las fechas para cumplir el mínimo.')
      return
    }

    if (fechaConflicto) {
      setError(fechaConflicto + '. Elegí otras fechas o una cabaña diferente.')
      return
    }

    // El total pagado (señas + pago en cabaña) nunca puede superar el precio
    // de la reserva — aplica a todos los complejos, sea el precio el
    // calculado automáticamente o uno modificado a mano (ambos terminan en
    // form.monto_total, que es la única fuente de verdad del precio).
    pagoTotalRef.current?.setCustomValidity('')
    const precioTotal = Number(form.monto_total || 0)
    const totalPagadoForm = totalPagadoReserva(form.sena1_monto, form.sena2_monto, form.pago_cabana_monto)
    if (excedeSaldoReserva(precioTotal, totalPagadoForm)) {
      pagoTotalRef.current?.setCustomValidity(
        `El total pagado no puede superar el precio de la reserva ($${precioTotal.toLocaleString('es-AR')})`
      )
      pagoTotalRef.current?.reportValidity()
      return
    }

    if (!complejoActivo) {
      alert('No se pudo determinar el complejo activo. Recargá la página e intentá de nuevo.')
      return
    }

    // Complejos NO-VIP: si la plata de esta reserva cae en un rango de
    // fechas ya cerrado (Cerrar caja), no se guarda nada — ni la reserva
    // ni el pago — para no dejar una reserva guardada con un pago que
    // en realidad no llegó a registrarse en la caja. Se chequea la
    // fecha que syncMovimientoSena va a usar: la de la fila ya
    // sincronizada si existe (su fecha no se toca al editar), o la que
    // se calcularía al crearla si todavía no existe.
    if (complejoActivo.slug !== 'cabanas-vip') {
      const tieneAlgunPago =
        Number(form.sena1_monto || 0) > 0 ||
        Number(form.sena2_monto || 0) > 0 ||
        Number(form.pago_cabana_monto || 0) > 0

      let fechaAChequear = null
      if (isEdit) {
        const { data: existentes } = await supabase
          .from('movimientos_caja')
          .select('fecha')
          .eq('reserva_id', id)
          .eq('origen', 'sena')
          .eq('complejo_id', complejoActivo.id)
          .limit(1)
        if (existentes && existentes.length > 0) {
          fechaAChequear = existentes[0].fecha
        } else if (tieneAlgunPago) {
          fechaAChequear = fechaMasReciente(form.sena1_fecha, form.sena2_fecha, form.pago_cabana_fecha)
        }
      } else if (tieneAlgunPago) {
        fechaAChequear = fechaMasReciente(form.sena1_fecha, form.sena2_fecha, form.pago_cabana_fecha)
      }

      if (fechaAChequear) {
        const { cierre } = await fechaEstaCerrada(supabase, complejoActivo.id, fechaAChequear)
        if (cierre) {
          setError(`Esta fecha está dentro de un período ya cerrado (${labelCierre(cierre)}). Para cargar un pago ahí, primero borrá ese cierre.`)
          return
        }
      }
    }

    if (form.cabana && form.fecha_entrada && form.fecha_salida) {
      let q = supabase
        .from('reservas')
        .select('nombre_apellido, fecha_entrada, fecha_salida')
        .eq('cabana', form.cabana)
        .eq('complejo_id', complejoActivo.id)
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
        if (complejoActivo.slug === 'cabanas-vip') {
          await Promise.all([
            syncCajaSeña(1, form.codigo, form.nombre_apellido,
              originalPagos.sena1_monto, originalPagos.sena1_tipo,
              form.sena1_monto, form.sena1_tipo, form.sena1_fecha, complejoActivo.id),
            syncCajaSeña(2, form.codigo, form.nombre_apellido,
              originalPagos.sena2_monto, originalPagos.sena2_tipo,
              form.sena2_monto, form.sena2_tipo, form.sena2_fecha, complejoActivo.id),
            syncCajaSilvia(form.codigo, form.nombre_apellido,
              originalPagos.pago_cabana_monto,
              form.pago_cabana_monto, form.pago_cabana_fecha, complejoActivo.id),
          ])
        } else {
          await syncMovimientoSena(complejoActivo, id, form.codigo, form.nombre_apellido,
            form.sena1_monto, form.sena1_tipo, form.sena1_fecha,
            form.sena2_monto, form.sena2_tipo, form.sena2_fecha,
            form.pago_cabana_monto, form.pago_cabana_fecha)
        }
      }
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('reservas')
        .insert({ ...payload, complejo_id: complejoActivo.id })
        .select('id, codigo, nombre_apellido, email, cabana, pax, fecha_entrada, fecha_salida, noches, monto_total, sena1_monto, sena1_tipo, sena1_fecha, estado')
        .single()
      err = insertErr
      newReserva = inserted

      if (!err && newReserva) {
        if (complejoActivo.slug === 'cabanas-vip') {
          const hoy = new Date().toISOString().slice(0, 10)
          const cajaOps = []

          if (Number(form.sena1_monto) > 0) {
            const tabla = form.sena1_tipo === 'Mercado Pago' ? 'caja_mercado_pago' : 'caja_banco'
            cajaOps.push(supabase.from(tabla).insert({
              complejo_id:    complejoActivo.id,
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
              complejo_id:    complejoActivo.id,
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
              complejo_id:     complejoActivo.id,
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
        } else {
          await syncMovimientoSena(complejoActivo, newReserva.id, form.codigo, form.nombre_apellido,
            form.sena1_monto, form.sena1_tipo, form.sena1_fecha,
            form.sena2_monto, form.sena2_tipo, form.sena2_fecha,
            form.pago_cabana_monto, form.pago_cabana_fecha)
        }
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
      navigate(`/${complejoActivo.slug}/reservas/${id}`, navState)
    } else {
      navigate(newReserva ? `/${complejoActivo.slug}/reservas/${newReserva.id}` : `/${complejoActivo.slug}/reservas`, navState)
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
        <button onClick={() => navigate(isEdit ? `/${complejoActivo.slug}/reservas/${id}` : `/${complejoActivo.slug}/reservas`)} className="text-[#888] hover:text-[#333] text-sm transition-colors">
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
                  data-testid="input-nombre-apellido"
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
                data-testid="input-email"
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
            {cabanasPorGrupo.length > 1 ? (
              <>
                <Field label="Bloque" required>
                  <select
                    data-testid="select-bloque"
                    value={grupoForm}
                    onChange={(e) => { setGrupoForm(e.target.value); set('cabana', '') }}
                    required
                    className={inputClass}
                  >
                    <option value="">Seleccionar bloque</option>
                    {cabanasPorGrupo.map((s) => (
                      <option key={s.grupo || 'sin-grupo'} value={s.grupo || ''}>{s.grupo || 'General'}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Cabaña" required>
                  <select
                    data-testid="select-cabana"
                    value={form.cabana}
                    onChange={(e) => set('cabana', e.target.value)}
                    required
                    disabled={!grupoForm}
                    className={inputClass}
                  >
                    <option value="">{grupoForm ? 'Seleccionar cabaña' : 'Elegí primero un bloque'}</option>
                    {(cabanasPorGrupo.find((s) => (s.grupo || '') === grupoForm)?.cabanas || []).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </>
            ) : (
              <Field label="Cabaña" required>
                <select
                  data-testid="select-cabana"
                  value={form.cabana}
                  onChange={(e) => set('cabana', e.target.value)}
                  required
                  className={inputClass}
                >
                  <option value="">Seleccionar cabaña</option>
                  {CABANAS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            )}
            {form.cabana && ocupadas.length > 0 && (
              <div className="col-span-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                <p className="text-xs font-semibold text-orange-700 mb-1.5">Fechas ya reservadas en {form.cabana}:</p>
                <div className="flex flex-wrap gap-1.5">
                  {ocupadas.map((o, i) => {
                    const fmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
                    return (
                      <span key={i} className="text-xs bg-orange-100 text-orange-800 rounded px-2 py-0.5">
                        {fmt(o.fecha_entrada)} – {fmt(o.fecha_salida)} · {o.nombre_apellido.split(',')[0].split(' ')[0]}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
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
                data-testid="select-estado"
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
                data-testid="input-fecha-entrada"
                value={form.fecha_entrada}
                onChange={(e) => handleFechaEntrada(e.target.value)}
                required
                className={inputClass}
              />
            </Field>
            <Field label="Fecha de salida (OUT)" required>
              <input
                type="date"
                data-testid="input-fecha-salida"
                value={form.fecha_salida}
                onChange={(e) => handleFechaSalida(e.target.value)}
                required
                className={inputClass}
              />
            </Field>
            {fechaConflicto && (
              <div className="col-span-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm font-medium">
                {fechaConflicto}
              </div>
            )}
            {minimoNochesError && (
              <div className="col-span-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm font-medium">
                {minimoNochesError}
              </div>
            )}
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
                  data-testid="input-monto-total"
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
            <p className="text-sm font-semibold text-[var(--color-primario)] mb-3">1ª Seña</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Monto ($)">
                <input
                  type="number"
                  min={0}
                  data-testid="input-sena1-monto"
                  value={form.sena1_monto}
                  onChange={(e) => set('sena1_monto', e.target.value)}
                  className={inputClass}
                  placeholder="0"
                />
              </Field>
              <Field label="Tipo">
                <select
                  data-testid="select-sena1-tipo"
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
                    data-testid="input-sena1-fecha"
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
            <p className="text-sm font-semibold text-[var(--color-primario)] mb-3">2ª Seña</p>
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
            <p className="text-sm font-semibold text-[var(--color-primario)] mb-3">Pago en cabaña</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Monto ($)">
                <input
                  ref={pagoTotalRef}
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
          <div data-testid="reserva-form-error" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 pb-6">
          <button
            type="button"
            onClick={() => navigate(isEdit ? `/${complejoActivo.slug}/reservas/${id}` : `/${complejoActivo.slug}/reservas`)}
            className="btn-secondary flex-1 py-2.5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            data-testid="btn-submit-reserva"
            disabled={saving || !!fechaConflicto || !!minimoNochesError}
            className="btn-primary flex-1 py-2.5 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear reserva'}
          </button>
        </div>
      </form>
    </div>
  )
}

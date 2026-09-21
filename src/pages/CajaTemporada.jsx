import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO, getMonth, getYear } from 'date-fns'
import { es } from 'date-fns/locale'
import { useComplejo } from '../context/ComplejoContext'
import { rangosSolapan, cierreQueContiene, labelCierre } from '../lib/cierres'

// Este archivo exporta algunas funciones puras (num/pesos/rowTotal/
// recapPorRango/addDaysISO/monthRange) además del componente default,
// para que los tests unitarios (tests/unit/) puedan importar y
// ejercitar la lógica real en vez de reimplementarla. Eso rompe el
// supuesto de Fast Refresh de "un archivo de componente sólo exporta
// componentes" — sin impacto en runtime/producción, sólo hace que Vite
// recargue toda la página en vez de hacer hot-swap al editar este
// archivo en desarrollo.
/* eslint-disable react-refresh/only-export-components */

// --- Constants ---------------------------------------------

const TODAY = new Date().toISOString().slice(0, 10)

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const NOW_YEAR = new Date().getFullYear()
const YEARS    = [NOW_YEAR - 1, NOW_YEAR, NOW_YEAR + 1]

const CATEGORIAS_EGRESO = [
  { value: 'arreglos_ferreteria', label: 'Arreglos y Ferretería'  },
  { value: 'impuestos_servicios', label: 'Impuestos y Servicios'  },
  { value: 'empleados',           label: 'Empleados'              },
  { value: 'limpieza_perfumeria', label: 'Limpieza y Perfumería'  },
  { value: 'lavadero',            label: 'Lavadero'               },
  { value: 'publicidad',          label: 'Publicidad'             },
  { value: 'desayunos',           label: 'Desayunos'              },
  { value: 'blanco',              label: 'Blanco'                 },
  { value: 'bazar',               label: 'Bazar'                  },
  { value: 'variables',           label: 'Variables'              },
  { value: 'libreria',            label: 'Librería'                },
]

const TIPO_LABELS = {
  ingreso: 'Ingreso', egreso: 'Egreso', prestamo: 'Préstamo', devolucion: 'Devolución', retiro: 'Retiro',
}
const TIPO_BADGE = {
  ingreso:    'bg-green-50 text-green-700',
  egreso:     'bg-red-50 text-red-600',
  prestamo:   'bg-indigo-50 text-indigo-700',
  devolucion: 'bg-orange-50 text-orange-600',
  retiro:     'bg-purple-50 text-purple-700',
}
const CATEGORIA_LABEL = {
  alquiler: 'Alquiler',
  ...Object.fromEntries(CATEGORIAS_EGRESO.map((c) => [c.value, c.label])),
}
const ORIGEN_TOOLTIP = {
  sena: 'Generado automáticamente desde la seña de la reserva',
  pago: 'Generado automáticamente desde un pago registrado en la reserva',
}

const RECON_SUGERENCIAS = ['Efectivo', 'Banco', 'Mercado Pago', 'Perdido']

// --- Helpers -------------------------------------------------

export const num   = (v) => Number(v) || 0
export const pesos = (v) => `$${num(v).toLocaleString('es-AR')}`
const fmtD  = (d) => d ? format(parseISO(d), 'dd/MM/yyyy', { locale: es }) : '—'
export const rowTotal = (m) => num(m.monto_depositos) + num(m.monto_efectivo) + num(m.monto_otros)
const sc = 'field w-auto'

// Queries reales usadas por este componente — exportadas para que los
// tests de integración (tests/integration/) puedan ejercitarlas
// directamente en vez de reimplementarlas. Devuelven la respuesta
// cruda de supabase-js ({data, error}); el caller decide qué hacer con
// cada una (acá, ignorar el error y mostrar lista vacía).
export async function fetchMovimientosPorComplejo(supabase, complejoId) {
  return supabase
    .from('movimientos_caja')
    .select('*')
    .eq('complejo_id', complejoId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
}

export async function fetchCierresPorComplejo(supabase, complejoId) {
  return supabase
    .from('cierres_caja')
    .select('*')
    .eq('complejo_id', complejoId)
    .order('fecha_hasta', { ascending: false })
}

// Validación de "Nuevo/Editar movimiento": el total de los 3 campos de
// monto tiene que ser > $0 — "otros" sólo cuenta para tipo 'ingreso'
// (los egresos no tienen campo "otros" en el form). Devuelve tanto si
// es válido como el total/otros ya calculados, para que el caller no
// tenga que recalcularlos.
export function validarMontoMovimiento(tipo, montoDepositos, montoEfectivo, montoOtros) {
  const otros = tipo === 'ingreso' ? num(montoOtros) : 0
  const total = num(montoDepositos) + num(montoEfectivo) + otros
  return { valido: total > 0, total, montoOtros: otros }
}

const emptyMov = () => ({
  tipo: 'ingreso',
  fecha: TODAY,
  detalle: '',
  categoria: '',
  monto_depositos: '',
  monto_efectivo: '',
  monto_otros: '',
  _reservaId: '',
})

export function addDaysISO(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// Primer y último día del mes dado, como string ISO — usado sólo para
// saber si el mes/año elegido en el filtro se superpone con algún
// cierre ya guardado (banner de período cerrado).
export function monthRange(mes, anio) {
  const iso = (d) => d.toISOString().slice(0, 10)
  const desde = new Date(anio, mes, 1)
  const hasta = new Date(anio, mes + 1, 0)
  return { fecha_desde: iso(desde), fecha_hasta: iso(hasta) }
}

// Resumen de un conjunto YA FILTRADO de movimientos (a un período, a un
// rango de fechas, lo que sea — este función no filtra nada, sólo
// agrega). Fuente única para el resumen en vivo (`summary`, más abajo)
// y para el recap de "Cerrar caja"/"Ver detalle" (`recapPorRango`) —
// antes cada uno reimplementaba la misma cuenta por su lado.
//
// Ganancia = Ventas − Gastos reales, nada más. `prestamo` (un
// préstamo: no es venta real) y `devolucion` (un reembolso: no es un
// gasto real) quedan afuera de esa cuenta a propósito — antes
// `ganancia` se calculaba como `(prestamos + ventas) − devoluciones −
// gastos`, tratando el préstamo como ingreso real y la devolución como
// si fuera un gasto real, lo que inflaba/desinflaba la Ganancia Neta
// cada vez que alguno de esos dos tipos aparecía en el período (bug
// real, encontrado en la Prioridad 1+2 de este cambio — Ganancias.jsx
// nunca tuvo este bug: su propio cálculo para NO-VIP ya sumaba
// únicamente tipo==='ingreso'/'egreso'). `ingresoTotal` (préstamos +
// ventas) y `devoluciones` siguen siendo su propia cifra aparte —
// siguen mostrándose igual que antes, sólo `ganancia` cambia. `retiro`
// (plata YA ganada que se retira, no un gasto) tampoco entra en ningún
// lado de esta cuenta — igual que prestamo/devolucion, por construcción
// (sumTipo sólo suma el tipo exacto que se le pide).
export function resumenMovimientos(movimientos) {
  const sumTipo = (tipo) => movimientos.filter((m) => m.tipo === tipo).reduce((a, m) => a + rowTotal(m), 0)
  const prestamos    = sumTipo('prestamo')
  const ventas       = sumTipo('ingreso')
  const ingresoTotal = prestamos + ventas
  const devoluciones = sumTipo('devolucion')
  const gastos       = sumTipo('egreso')
  const retiros      = sumTipo('retiro')
  const ganancia     = ventas - gastos
  return { prestamos, ventas, ingresoTotal, devoluciones, gastos, retiros, ganancia }
}

// Resumen recalculado en el momento a partir de los movimientos ya
// cargados, filtrados a un rango de fechas puntual — usado tanto por el
// recap en vivo de "Cerrar caja" como por "Ver detalle" de un cierre ya
// guardado (esos movimientos están bloqueados, así que recalcular es
// siempre seguro y fiel a lo que había en ese momento).
export function recapPorRango(movimientos, desde, hasta) {
  if (!desde || !hasta) return null
  const rango = movimientos.filter((m) => m.fecha >= desde && m.fecha <= hasta)
  return resumenMovimientos(rango)
}

// --- UI atoms (mirrors the look of Caja.jsx / Ganancias.jsx, kept local) ---

function BigTotal({ label, value }) {
  return (
    <div className="bg-[#d1fae5] border border-green-200 rounded-[16px] px-8 py-6 text-center mb-5">
      <p className="text-xs font-semibold text-[#065f46] uppercase tracking-widest mb-2">{label}</p>
      <p className="text-[#065f46] text-[32px] font-bold tabular-nums leading-none">{value}</p>
    </div>
  )
}

function StatCards({ items }) {
  const colorText = { green: 'text-green-600', red: 'text-red-500', orange: 'text-orange-500', blue: 'text-blue-600', neutral: 'text-[#444]' }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
      {items.map((item, i) => (
        <div key={i} className="bg-[var(--color-secundario)] border border-[#f0e6d8] rounded-[12px] px-4 py-4">
          <p className="section-label mb-2">{item.label}</p>
          <p className={`text-base font-semibold tabular-nums ${colorText[item.color] || colorText.neutral}`}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  )
}

// Misma convención que el FilterRow de Caja.jsx (mes/año + botón de alta),
// con un botón extra de "Cerrar caja" al lado — Caja.jsx no exporta el
// suyo, así que esta es una copia local con esa única diferencia.
function FilterRow({ mes, anio, onMes, onAnio, onAdd, addLabel, onCerrar }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="section-label block mb-1">Mes</label>
          <select data-testid="select-mes" value={mes} onChange={e => onMes(Number(e.target.value))} className={sc}>
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="section-label block mb-1">Año</label>
          <select data-testid="select-anio" value={anio} onChange={e => onAnio(Number(e.target.value))} className={sc}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCerrar} className="btn-secondary">
          Cerrar caja
        </button>
        <button onClick={onAdd} className="btn-primary">
          {addLabel || '+ Nuevo movimiento'}
        </button>
      </div>
    </div>
  )
}

function Th({ children, right, cls }) {
  return (
    <th className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap ${right ? 'text-right' : 'text-left'} ${cls || ''}`}>
      {children}
    </th>
  )
}

function Td({ children, right, cls, title }) {
  return (
    <td title={title} className={`px-3 py-2.5 text-xs whitespace-nowrap ${right ? 'text-right' : ''} ${cls || ''}`}>
      {children}
    </td>
  )
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className={`bg-white rounded-[16px] border border-[#f0e6d8] w-full ${wide ? 'max-w-xl' : 'max-w-md'} max-h-[92vh] overflow-y-auto`}
           onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-3 border-b border-[#f0e6d8]">
          <h3 className="text-base font-semibold text-[#111]">{title}</h3>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function Label({ children, required }) {
  return (
    <label className="section-label block mb-1.5">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )
}

// --- Component -------------------------------------------------

export default function CajaTemporada() {
  const { complejoActivo } = useComplejo()

  const [movimientos, setMovimientos] = useState([])
  const [loadingMovs, setLoadingMovs] = useState(true)
  const [reservas, setReservas]       = useState([])

  const [mes, setMes]   = useState(new Date().getMonth())
  const [anio, setAnio] = useState(NOW_YEAR)

  const [modal, setModal]         = useState(false)
  const [form, setForm]           = useState(emptyMov())
  const [saving, setSaving]       = useState(false)
  const [editingId, setEditingId] = useState(null)

  // Ref sobre "Depósitos ($)" para la burbuja nativa de "el total debe
  // ser > $0" (tres campos que deben sumar más de $0 entre todos, algo
  // que un solo min="" no puede expresar), y sobre "Fecha" para la
  // burbuja de "esta fecha está dentro de un cierre ya cerrado".
  const montoRef = useRef(null)
  const fechaRef = useRef(null)

  // Cierre de caja: rango de fechas libre, no atado a ninguna temporada.
  const [cierreModal, setCierreModal]         = useState(false)
  const [cierreForm, setCierreForm]           = useState(null)
  const [cierreOverlapError, setCierreOverlapError] = useState('')
  const [savingCierre, setSavingCierre]       = useState(false)
  const [cierres, setCierres]                 = useState([])
  const [loadingCierres, setLoadingCierres]   = useState(true)

  // "Ver detalle" de un cierre ya guardado (sólo lectura).
  const [detalleCierre, setDetalleCierre]   = useState(null)
  const [detalleRecon, setDetalleRecon]     = useState([])
  const [detalleReparto, setDetalleReparto] = useState([])
  const [loadingDetalle, setLoadingDetalle] = useState(false)

  // Libro contable continuo: se carga TODO el movimientos_caja del
  // complejo una sola vez (igual que caja_silvia en Caja.jsx) y el
  // filtro de mes/año se aplica en el cliente — así "Cerrar caja" y
  // "Ver detalle" pueden recalcular su propio recap contra cualquier
  // rango de fechas sin pegarle de nuevo a la base.
  const loadMovimientos = async (isStale = () => false) => {
    if (!complejoActivo) {
      setMovimientos([])
      setLoadingMovs(false)
      return
    }
    setLoadingMovs(true)
    const { data } = await fetchMovimientosPorComplejo(supabase, complejoActivo.id)
    if (isStale()) return
    setMovimientos(data || [])
    setLoadingMovs(false)
  }
  // Guard contra respuesta obsoleta — mismo patrón/motivo que
  // Ganancias.jsx (complejoActivo pasa por un default antes de que
  // Layout.jsx lo corrija al slug de la URL; sin esto, el fetch del
  // complejo viejo puede resolver después y pisar los datos correctos).
  useEffect(() => {
    let cancelado = false
    loadMovimientos(() => cancelado)
    return () => { cancelado = true }
  }, [complejoActivo?.id])

  // Reservas del complejo, para vincular (opcionalmente) un movimiento de
  // ingreso con una reserva puntual — acá SÍ se excluyen las Canceladas
  // (no tiene sentido ofrecer vincular un movimiento nuevo a una reserva
  // cancelada).
  // Guard contra respuesta obsoleta — ver comentario en loadMovimientos arriba.
  useEffect(() => {
    if (!complejoActivo) {
      setReservas([])
      return
    }
    let cancelado = false
    supabase
      .from('reservas')
      .select('id, codigo, nombre_apellido')
      .eq('complejo_id', complejoActivo.id)
      .neq('estado', 'Cancelada')
      .order('codigo', { ascending: false })
      .then(({ data }) => {
        if (cancelado) return
        setReservas(data || [])
      })
    return () => { cancelado = true }
  }, [complejoActivo?.id])

  // Mapa id → código de TODAS las reservas del complejo (Canceladas
  // incluidas), para el badge de "vinculado a reserva X" en la lista de
  // movimientos. A diferencia del picker de arriba: si una reserva ya
  // vinculada a un movimiento se cancela después, la plata sigue
  // mostrando de qué reserva vino — sólo el picker de reservas NUEVAS
  // para vincular excluye las Canceladas.
  const [reservaCodigos, setReservaCodigos] = useState({})
  // Guard contra respuesta obsoleta — ver comentario en loadMovimientos arriba.
  useEffect(() => {
    if (!complejoActivo) {
      setReservaCodigos({})
      return
    }
    let cancelado = false
    supabase
      .from('reservas')
      .select('id, codigo')
      .eq('complejo_id', complejoActivo.id)
      .then(({ data }) => {
        if (cancelado) return
        const map = {}
        ;(data || []).forEach((r) => { map[r.id] = r.codigo })
        setReservaCodigos(map)
      })
    return () => { cancelado = true }
  }, [complejoActivo?.id])

  // TODOS los cierres del complejo, sin límite — se usan tanto para la
  // lista "Cierres recientes" como para el candado de fechas cerradas
  // (Partes 1 y 2), así que tienen que estar completos, no paginados.
  const loadCierres = async (isStale = () => false) => {
    if (!complejoActivo) {
      setCierres([])
      setLoadingCierres(false)
      return
    }
    setLoadingCierres(true)
    const { data } = await fetchCierresPorComplejo(supabase, complejoActivo.id)
    if (isStale()) return
    setCierres(data || [])
    setLoadingCierres(false)
  }
  // Guard contra respuesta obsoleta — ver comentario en loadMovimientos arriba.
  useEffect(() => {
    let cancelado = false
    loadCierres(() => cancelado)
    return () => { cancelado = true }
  }, [complejoActivo?.id])

  // --- Movimientos: filtro de período (mismo patrón que Caja.jsx) -----

  const filtered = useMemo(() => movimientos.filter((m) => {
    const d = parseISO(m.fecha)
    return getMonth(d) === mes && getYear(d) === anio
  }), [movimientos, mes, anio])

  const summary = useMemo(() => resumenMovimientos(filtered), [filtered])

  const gastosPorCategoria = useMemo(() => (
    CATEGORIAS_EGRESO
      .map((c) => {
        const rows = filtered.filter((m) => m.tipo === 'egreso' && m.categoria === c.value)
        return { ...c, count: rows.length, total: rows.reduce((a, m) => a + rowTotal(m), 0) }
      })
      .filter((c) => c.count > 0)
  ), [filtered])

  // Banner de "este período ya fue cerrado" — el mes/año elegido en el
  // filtro se superpone (total o parcialmente) con algún cierre.
  const cierreDelMes = useMemo(() => {
    const { fecha_desde, fecha_hasta } = monthRange(mes, anio)
    return cierres.find((c) => rangosSolapan(fecha_desde, fecha_hasta, c.fecha_desde, c.fecha_hasta)) || null
  }, [cierres, mes, anio])

  // --- Nuevo / editar movimiento ------------------------------------

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (k === 'monto_depositos' || k === 'monto_efectivo' || k === 'monto_otros') {
      montoRef.current?.setCustomValidity('')
    }
    if (k === 'fecha') {
      fechaRef.current?.setCustomValidity('')
    }
  }

  const openNewModal = () => {
    setEditingId(null)
    setForm(emptyMov())
    setModal(true)
  }

  const openEditModal = (m) => {
    setEditingId(m.id)
    setForm({
      tipo: m.tipo,
      fecha: m.fecha,
      detalle: m.detalle || '',
      categoria: m.categoria || '',
      monto_depositos: m.monto_depositos ? String(m.monto_depositos) : '',
      monto_efectivo:  m.monto_efectivo  ? String(m.monto_efectivo)  : '',
      monto_otros:     m.monto_otros     ? String(m.monto_otros)     : '',
      _reservaId: m.reserva_id || '',
    })
    setModal(true)
  }

  const closeModal = () => {
    setModal(false)
    setEditingId(null)
    setForm(emptyMov())
    montoRef.current?.setCustomValidity('')
    fechaRef.current?.setCustomValidity('')
  }

  // Al elegir una reserva se sugiere un detalle ("Alquiler — A0005 Juan
  // Pérez"), que el usuario puede seguir editando a mano después. Al
  // volver a "Sin vincular" no se toca el detalle, por si ya lo editó.
  const handleReserva = (reservaId) => {
    const r = reservas.find((x) => x.id === reservaId)
    setForm((f) => ({
      ...f,
      _reservaId: reservaId,
      detalle: r ? `Alquiler — ${r.codigo} ${r.nombre_apellido}` : f.detalle,
    }))
  }

  const submitMov = async (e) => {
    e.preventDefault()
    if (!complejoActivo) {
      alert('No se pudo determinar el complejo activo. Recargá la página e intentá de nuevo.')
      return
    }
    montoRef.current?.setCustomValidity('')
    fechaRef.current?.setCustomValidity('')

    const { valido, montoOtros } = validarMontoMovimiento(form.tipo, form.monto_depositos, form.monto_efectivo, form.monto_otros)
    if (!valido) {
      montoRef.current?.setCustomValidity('El monto debe ser mayor a $0')
      montoRef.current?.reportValidity()
      return
    }

    // No se puede cargar (ni mover) un movimiento a una fecha que ya
    // quedó adentro de un cierre confirmado.
    const cierreBloqueante = cierreQueContiene(cierres, form.fecha)
    if (cierreBloqueante) {
      fechaRef.current?.setCustomValidity(
        `Esta fecha está dentro de un período ya cerrado (${labelCierre(cierreBloqueante)}). Para cargar un movimiento ahí, primero borrá ese cierre.`
      )
      fechaRef.current?.reportValidity()
      return
    }

    setSaving(true)
    const categoria = form.tipo === 'ingreso' ? 'alquiler'
                     : form.tipo === 'egreso'  ? form.categoria
                     : null
    const payload = {
      fecha:            form.fecha,
      tipo:             form.tipo,
      categoria,
      detalle:          form.detalle || null,
      monto_depositos:  num(form.monto_depositos),
      monto_efectivo:   num(form.monto_efectivo),
      monto_otros:      montoOtros,
      reserva_id:       form._reservaId || null,
    }

    if (editingId) {
      // No se toca `origen` al editar — si era 'sena'/'pago' (generado
      // automático) sigue mostrando su tag después de la edición manual.
      await supabase.from('movimientos_caja').update(payload).eq('id', editingId).eq('complejo_id', complejoActivo.id)
    } else {
      await supabase.from('movimientos_caja').insert({ ...payload, complejo_id: complejoActivo.id, origen: 'manual' })
    }

    setSaving(false)
    closeModal()
    loadMovimientos()
  }

  const delMov = async (id) => {
    if (!confirm('¿Eliminar este movimiento?')) return
    await supabase.from('movimientos_caja').delete().eq('id', id).eq('complejo_id', complejoActivo.id)
    loadMovimientos()
  }

  // --- Cerrar caja: rango de fechas libre -------------------------

  const openCierreModal = () => {
    const ultimo = cierres[0] || null // cierres ya viene ordenado por fecha_hasta desc
    setCierreForm({
      nombre: '',
      fecha_desde: ultimo ? addDaysISO(ultimo.fecha_hasta, 1) : TODAY,
      fecha_hasta: TODAY,
      inicio_manual: ultimo && ultimo.monto_final != null ? String(ultimo.monto_final) : '0',
      tipo_cambio_dolar: '',
      monto_final: '',
      observaciones: '',
      reconciliacion: [],
      reparto: [],
    })
    setCierreOverlapError('')
    setCierreModal(true)
  }
  const closeCierreModal = () => {
    setCierreModal(false)
    setCierreForm(null)
    setCierreOverlapError('')
  }

  const setCierreFecha = (campo, value) => {
    setCierreForm((f) => ({ ...f, [campo]: value }))
    setCierreOverlapError('')
  }

  // Recap de sólo-lectura, recalculado contra el rango de fechas que el
  // usuario esté editando en el form de cierre (arranca en base al
  // último cierre + hoy, pero se puede editar libremente).
  const cierreRecap = useMemo(() => (
    cierreForm ? recapPorRango(movimientos, cierreForm.fecha_desde, cierreForm.fecha_hasta) : null
  ), [movimientos, cierreForm])

  const totalReconciliado = cierreForm ? cierreForm.reconciliacion.reduce((a, r) => a + num(r.monto), 0) : 0
  const esperadoCierre    = cierreForm ? num(cierreForm.inicio_manual) + num(cierreRecap?.ganancia) : 0
  const diferenciaCierre  = totalReconciliado - esperadoCierre
  const cierraExacto      = Math.abs(diferenciaCierre) < 0.01

  const addReconRow    = (concepto = '') => setCierreForm((f) => ({ ...f, reconciliacion: [...f.reconciliacion, { concepto, monto: '' }] }))
  const updateReconRow = (i, field, value) => setCierreForm((f) => ({ ...f, reconciliacion: f.reconciliacion.map((r, idx) => idx === i ? { ...r, [field]: value } : r) }))
  const removeReconRow = (i) => setCierreForm((f) => ({ ...f, reconciliacion: f.reconciliacion.filter((_, idx) => idx !== i) }))

  const addRepartoRow    = () => setCierreForm((f) => ({ ...f, reparto: [...f.reparto, { persona: '', monto: '', monto_dolares: '' }] }))
  const updateRepartoRow = (i, field, value) => setCierreForm((f) => ({ ...f, reparto: f.reparto.map((r, idx) => idx === i ? { ...r, [field]: value } : r) }))
  const removeRepartoRow = (i) => setCierreForm((f) => ({ ...f, reparto: f.reparto.filter((_, idx) => idx !== i) }))

  const confirmarCierre = async (e) => {
    e.preventDefault()
    if (!complejoActivo || !cierreForm || !cierreRecap) return

    const conflicto = cierres.find((c) => rangosSolapan(cierreForm.fecha_desde, cierreForm.fecha_hasta, c.fecha_desde, c.fecha_hasta))
    if (conflicto) {
      setCierreOverlapError(`Este rango se superpone con un cierre existente: ${labelCierre(conflicto)}. Elegí otras fechas.`)
      return
    }

    const etiqueta = cierreForm.nombre.trim() || `${fmtD(cierreForm.fecha_desde)} – ${fmtD(cierreForm.fecha_hasta)}`
    if (!confirm(`¿Confirmás el cierre ${etiqueta}? Los movimientos de ese rango van a quedar bloqueados para editar o borrar.`)) {
      return
    }

    setSavingCierre(true)
    const { data: cierre, error } = await supabase.from('cierres_caja').insert({
      complejo_id:       complejoActivo.id,
      nombre:            cierreForm.nombre.trim() || null,
      fecha_desde:       cierreForm.fecha_desde,
      fecha_hasta:       cierreForm.fecha_hasta,
      inicio_manual:     num(cierreForm.inicio_manual),
      ganancia_total:    cierreRecap.ganancia,
      tipo_cambio_dolar: cierreForm.tipo_cambio_dolar !== '' ? num(cierreForm.tipo_cambio_dolar) : null,
      monto_final:       cierreForm.monto_final !== '' ? num(cierreForm.monto_final) : null,
      observaciones:     cierreForm.observaciones || null,
    }).select().single()

    if (error || !cierre) {
      setSavingCierre(false)
      alert('No se pudo guardar el cierre. Intentá de nuevo.')
      return
    }

    // concepto/persona son obligatorios en la base — se descartan las
    // filas que el usuario haya dejado sin completar el texto.
    const reconRows = cierreForm.reconciliacion
      .filter((r) => r.concepto.trim())
      .map((r) => ({ complejo_id: complejoActivo.id, cierre_id: cierre.id, concepto: r.concepto.trim(), monto: num(r.monto) }))
    const repartoRows = cierreForm.reparto
      .filter((r) => r.persona.trim())
      .map((r) => ({
        complejo_id:   complejoActivo.id,
        cierre_id:     cierre.id,
        persona:       r.persona.trim(),
        monto:         num(r.monto),
        monto_dolares: r.monto_dolares !== '' ? num(r.monto_dolares) : null,
      }))

    if (reconRows.length > 0)   await supabase.from('cierre_reconciliacion').insert(reconRows)
    if (repartoRows.length > 0) await supabase.from('cierre_reparto_ganancia').insert(repartoRows)

    setSavingCierre(false)
    closeCierreModal()
    loadCierres()
  }

  const delCierre = async (id) => {
    if (!confirm('¿Eliminar este cierre? También se eliminan su reconciliación y reparto de ganancia, y sus movimientos vuelven a quedar editables.')) return
    await supabase.from('cierres_caja').delete().eq('id', id).eq('complejo_id', complejoActivo.id)
    loadCierres()
  }

  // --- Ver detalle (sólo lectura) ------------------------------------

  const abrirDetalle = async (cierre) => {
    setDetalleCierre(cierre)
    setLoadingDetalle(true)
    const [{ data: recon }, { data: reparto }] = await Promise.all([
      supabase.from('cierre_reconciliacion').select('*').eq('cierre_id', cierre.id).eq('complejo_id', complejoActivo.id),
      supabase.from('cierre_reparto_ganancia').select('*').eq('cierre_id', cierre.id).eq('complejo_id', complejoActivo.id),
    ])
    setDetalleRecon(recon || [])
    setDetalleReparto(reparto || [])
    setLoadingDetalle(false)
  }
  const cerrarDetalle = () => {
    setDetalleCierre(null)
    setDetalleRecon([])
    setDetalleReparto([])
  }

  const detalleRecap = useMemo(() => (
    detalleCierre ? recapPorRango(movimientos, detalleCierre.fecha_desde, detalleCierre.fecha_hasta) : null
  ), [movimientos, detalleCierre])

  // --- Render ------------------------------------------------------

  return (
    <div className="fade-in">
      <BigTotal label="Ganancia" value={pesos(summary.ganancia)} />

      <StatCards items={[
        { label: 'Préstamos',     value: pesos(summary.prestamos),    color: 'blue'   },
        { label: 'Ventas',        value: pesos(summary.ventas),       color: 'green'  },
        { label: 'Ingreso total', value: pesos(summary.ingresoTotal), color: 'green'  },
        { label: 'Devoluciones',  value: pesos(summary.devoluciones), color: 'orange' },
        { label: 'Gastos',        value: pesos(summary.gastos),       color: 'red'    },
      ]} />

      <div className="mb-6">
        <p className="section-label mb-2">Gastos por categoría</p>
        {gastosPorCategoria.length === 0 ? (
          <p className="text-sm text-[#888] py-4">Todavía no hay gastos cargados en este período</p>
        ) : (
          <div className="overflow-x-auto rounded-[16px] border border-[#f0e6d8] overflow-hidden">
            <table className="w-full" style={{ minWidth: 420 }}>
              <thead>
                <tr className="bg-[#111111] text-white">
                  <Th>Categoría</Th>
                  <Th right>Monto</Th>
                </tr>
              </thead>
              <tbody>
                {gastosPorCategoria.map((c, i) => (
                  <tr key={c.value} className={`border-b border-[#f0e6d8] ${i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'}`}>
                    <Td cls="text-[#333]">{c.label}</Td>
                    <Td right cls={c.total > 0 ? 'font-semibold text-red-600' : 'text-[#ddd]'}>
                      {c.total > 0 ? pesos(c.total) : '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FilterRow mes={mes} anio={anio} onMes={setMes} onAnio={setAnio} onAdd={openNewModal} onCerrar={openCierreModal} />

      {cierreDelMes && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-orange-50 border border-orange-200 rounded-[12px] px-4 py-3 mb-4">
          <p className="text-sm text-orange-800">
            Este período ya fue cerrado — <strong>{labelCierre(cierreDelMes)}</strong>
          </p>
          <button onClick={() => abrirDetalle(cierreDelMes)} className="text-sm font-medium text-orange-700 hover:underline flex-shrink-0">
            Ver detalle
          </button>
        </div>
      )}

      {loadingMovs || filtered.length === 0
        ? (
          <p className="text-center text-[#888] py-14 text-sm">
            {loadingMovs ? 'Cargando movimientos...' : 'Todavía no cargaste movimientos en este período.'}
          </p>
        )
        : (
          <div className="overflow-x-auto rounded-[16px] border border-[#f0e6d8] overflow-hidden">
            <table className="w-full" style={{ minWidth: 900 }}>
              <thead>
                <tr className="bg-[#111111] text-white">
                  <Th>Fecha</Th>
                  <Th>Tipo</Th>
                  <Th>Categoría</Th>
                  <Th>Detalle</Th>
                  <Th right>Depósitos</Th>
                  <Th right>Efectivo</Th>
                  <Th right>Otros</Th>
                  <Th right cls="bg-[#0d0d0d] text-white">Total</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => {
                  const bloqueado = !!cierreQueContiene(cierres, m.fecha)
                  const tooltipBloqueo = bloqueado
                    ? `Este movimiento pertenece a un período ya cerrado (${labelCierre(cierreQueContiene(cierres, m.fecha))}). Borrá ese cierre para poder editarlo o eliminarlo.`
                    : ''
                  return (
                    <tr key={m.id} className={`border-b border-[#f0e6d8] ${i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'} hover:bg-[var(--color-fila-hover)] transition-colors`}>
                      <Td>{fmtD(m.fecha)}</Td>
                      <Td>
                        <span className={`inline-flex px-2 py-0.5 rounded-[8px] text-xs font-medium ${TIPO_BADGE[m.tipo] || ''}`}>
                          {TIPO_LABELS[m.tipo] || m.tipo}
                        </span>
                      </Td>
                      <Td cls="text-[#888]">{CATEGORIA_LABEL[m.categoria] || '—'}</Td>
                      <Td cls="text-[#333]" title={m.detalle}>
                        <div className="flex items-center gap-1.5 max-w-[200px]">
                          <span className="truncate">{m.detalle || '—'}</span>
                          {m.reserva_id && reservaCodigos[m.reserva_id] && (
                            <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-[6px] text-[10px] font-mono font-semibold bg-[var(--color-secundario)] text-[var(--color-primario)]">
                              {reservaCodigos[m.reserva_id]}
                            </span>
                          )}
                          {(m.origen === 'sena' || m.origen === 'pago') && (
                            <span
                              className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-[6px] text-[10px] font-medium bg-indigo-50 text-indigo-600"
                              title={m.reserva_id && reservaCodigos[m.reserva_id]
                                ? `Generado desde la reserva ${reservaCodigos[m.reserva_id]}`
                                : ORIGEN_TOOLTIP[m.origen]}
                            >
                              Automático
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td right cls={num(m.monto_depositos) > 0 ? 'text-[#333]' : 'text-[#ddd]'}>
                        {num(m.monto_depositos) > 0 ? pesos(m.monto_depositos) : ''}
                      </Td>
                      <Td right cls={num(m.monto_efectivo) > 0 ? 'text-[#333]' : 'text-[#ddd]'}>
                        {num(m.monto_efectivo) > 0 ? pesos(m.monto_efectivo) : ''}
                      </Td>
                      <Td right cls={num(m.monto_otros) > 0 ? 'text-[#333]' : 'text-[#ddd]'}>
                        {num(m.monto_otros) > 0 ? pesos(m.monto_otros) : ''}
                      </Td>
                      <Td right cls="font-semibold text-[#111] bg-[var(--color-secundario)] border-l border-[#f0e6d8]">
                        {pesos(rowTotal(m))}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => !bloqueado && openEditModal(m)}
                            disabled={bloqueado}
                            title={bloqueado ? tooltipBloqueo : 'Editar movimiento'}
                            className={bloqueado ? 'text-[#ddd] cursor-not-allowed text-xs' : 'text-[#aaa] hover:text-[var(--color-primario)] text-xs'}
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => !bloqueado && delMov(m.id)}
                            disabled={bloqueado}
                            title={bloqueado ? tooltipBloqueo : 'Eliminar movimiento'}
                            className={bloqueado ? 'text-[#ddd] cursor-not-allowed text-xs' : 'text-[#ccc] hover:text-red-500 text-xs'}
                          >
                            ✕
                          </button>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      {/* --- Cierres recientes: cards oscuras, no una tabla más -------- */}
      <div className="mt-8">
        <p className="section-label mb-2">Cierres recientes</p>
        {loadingCierres ? (
          <p className="text-sm text-[#888] py-2">Cargando...</p>
        ) : cierres.length === 0 ? (
          <p className="text-sm text-[#888] py-2">Todavía no cerraste ninguna caja.</p>
        ) : (
          <div className="space-y-3">
            {cierres.map((c) => (
              <div key={c.id} data-testid="cierre-card" className="rounded-[16px] p-5 bg-[#111111] flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white mb-0.5">{labelCierre(c)}</p>
                  <p className="text-xs text-[#999]">{fmtD(c.fecha_desde)} – {fmtD(c.fecha_hasta)} · cerrado el {fmtD(c.fecha_cierre)}</p>
                </div>
                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-secundario)] mb-0.5">Ganancia</p>
                    <p className="text-base font-bold text-green-400 tabular-nums">{c.ganancia_total != null ? pesos(c.ganancia_total) : '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-secundario)] mb-0.5">Monto final</p>
                    <p className="text-base font-bold text-white tabular-nums">{c.monto_final != null ? pesos(c.monto_final) : '—'}</p>
                  </div>
                  <button onClick={() => abrirDetalle(c)} className="btn-primary px-4 py-2 text-sm">
                    Ver detalle
                  </button>
                  <button onClick={() => delCierre(c.id)} className="text-[#666] hover:text-red-400 text-sm px-1" title="Eliminar cierre">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- Modal: nuevo / editar movimiento --------------------------- */}
      {modal && (
        <Modal title={editingId ? 'Editar movimiento' : 'Nuevo movimiento'} onClose={closeModal}>
          <form onSubmit={submitMov} className="space-y-4">
            <div>
              <Label required>Tipo</Label>
              <select
                data-testid="select-tipo-movimiento"
                value={form.tipo}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value, categoria: '', _reservaId: e.target.value === 'ingreso' ? f._reservaId : '' }))}
                required
                className="field"
              >
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
                <option value="prestamo">Préstamo</option>
                <option value="devolucion">Devolución</option>
              </select>
            </div>

            {form.tipo === 'ingreso' && (
              <div>
                <Label>Vincular a una reserva (opcional)</Label>
                <select data-testid="select-reserva-vincular" value={form._reservaId} onChange={(e) => handleReserva(e.target.value)} className="field">
                  <option value="">— Sin vincular —</option>
                  {reservas.map((r) => (
                    <option key={r.id} value={r.id}>{r.codigo} — {r.nombre_apellido}</option>
                  ))}
                </select>
              </div>
            )}

            {form.tipo === 'egreso' && (
              <div>
                <Label required>Categoría</Label>
                <select data-testid="select-categoria-movimiento" value={form.categoria} onChange={(e) => set('categoria', e.target.value)} required className="field">
                  <option value="">Seleccionar categoría</option>
                  {CATEGORIAS_EGRESO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label required>Fecha</Label>
                <input ref={fechaRef} type="date" data-testid="input-fecha-movimiento" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} required className="field" />
              </div>
              <div>
                <Label>Detalle</Label>
                <input type="text" data-testid="input-detalle-movimiento" value={form.detalle} onChange={(e) => set('detalle', e.target.value)} className="field" />
              </div>
            </div>

            <div className={`grid grid-cols-1 ${form.tipo === 'ingreso' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-3`}>
              <div>
                <Label>Depósitos ($)</Label>
                <input ref={montoRef} type="number" min={0} step="0.01" data-testid="input-monto-depositos" value={form.monto_depositos} onChange={(e) => set('monto_depositos', e.target.value)} className="field" placeholder="0" />
              </div>
              <div>
                <Label>Efectivo ($)</Label>
                <input type="number" min={0} step="0.01" data-testid="input-monto-efectivo" value={form.monto_efectivo} onChange={(e) => set('monto_efectivo', e.target.value)} className="field" placeholder="0" />
              </div>
              {form.tipo === 'ingreso' && (
                <div>
                  <Label>Otros ($)</Label>
                  <input type="number" min={0} step="0.01" data-testid="input-monto-otros" value={form.monto_otros} onChange={(e) => set('monto_otros', e.target.value)} className="field" placeholder="0" />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t border-[#f0e6d8] mt-4">
              <button type="button" onClick={closeModal} className="btn-secondary flex-1 py-2">
                Cancelar
              </button>
              <button type="submit" data-testid="btn-guardar-movimiento" disabled={saving} className="btn-primary flex-1 py-2 disabled:opacity-50">
                {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Guardar movimiento'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* --- Modal: cerrar caja --------------------------------------- */}
      {cierreModal && cierreForm && (
        <Modal title="Cerrar caja" onClose={closeCierreModal} wide>
          <form onSubmit={confirmarCierre} className="space-y-5">
            <div>
              <Label>Nombre (opcional)</Label>
              <input
                type="text" data-testid="input-cierre-nombre" className="field" placeholder="Ej: Temporada 2026-27"
                value={cierreForm.nombre}
                onChange={(e) => setCierreForm((f) => ({ ...f, nombre: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label required>Desde</Label>
                <input
                  type="date" required className="field" data-testid="input-cierre-fecha-desde"
                  value={cierreForm.fecha_desde}
                  onChange={(e) => setCierreFecha('fecha_desde', e.target.value)}
                />
              </div>
              <div>
                <Label required>Hasta</Label>
                <input
                  type="date" required className="field" data-testid="input-cierre-fecha-hasta"
                  value={cierreForm.fecha_hasta}
                  onChange={(e) => setCierreFecha('fecha_hasta', e.target.value)}
                />
              </div>
            </div>

            {cierreOverlapError && (
              <div data-testid="cierre-overlap-error" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                {cierreOverlapError}
              </div>
            )}

            <div>
              <Label required>Inicio manual ($)</Label>
              <input
                type="number" min={0} step="0.01" className="field" placeholder="0" data-testid="input-cierre-inicio-manual"
                value={cierreForm.inicio_manual}
                onChange={(e) => setCierreForm((f) => ({ ...f, inicio_manual: e.target.value }))}
              />
            </div>

            <div className="bg-[var(--color-secundario)] border border-[#f0e6d8] rounded-[12px] p-4">
              <p className="section-label mb-3">
                Resumen del período ({fmtD(cierreForm.fecha_desde)} – {fmtD(cierreForm.fecha_hasta)})
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-[#888]">Préstamos</span><span className="font-medium">{pesos(cierreRecap?.prestamos)}</span></div>
                <div className="flex justify-between"><span className="text-[#888]">Ventas</span><span className="font-medium">{pesos(cierreRecap?.ventas)}</span></div>
                <div className="flex justify-between"><span className="text-[#888]">Ingreso total</span><span className="font-medium">{pesos(cierreRecap?.ingresoTotal)}</span></div>
                <div className="flex justify-between"><span className="text-[#888]">Devoluciones</span><span className="font-medium">{pesos(cierreRecap?.devoluciones)}</span></div>
                <div className="flex justify-between"><span className="text-[#888]">Gastos</span><span className="font-medium">{pesos(cierreRecap?.gastos)}</span></div>
                <div className="flex justify-between font-semibold text-[#111]"><span>Ganancia</span><span>{pesos(cierreRecap?.ganancia)}</span></div>
              </div>
            </div>

            <div>
              <Label>Reconciliación física</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {RECON_SUGERENCIAS.map((s) => (
                  <button
                    key={s} type="button" onClick={() => addReconRow(s)}
                    className="text-xs px-2 py-1 rounded-full border border-[#f0e6d8] text-[#666] hover:border-[var(--color-primario)] hover:text-[var(--color-primario)] transition-colors"
                  >
                    + {s}
                  </button>
                ))}
                <button
                  type="button" onClick={() => addReconRow()}
                  className="text-xs px-2 py-1 rounded-full border border-[#f0e6d8] text-[#666] hover:border-[var(--color-primario)] hover:text-[var(--color-primario)] transition-colors"
                >
                  + Otro concepto
                </button>
              </div>

              {cierreForm.reconciliacion.length > 0 && (
                <div className="space-y-2 mb-2">
                  {cierreForm.reconciliacion.map((r, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text" placeholder="Concepto" className="field flex-1"
                        value={r.concepto}
                        onChange={(e) => updateReconRow(i, 'concepto', e.target.value)}
                      />
                      <input
                        type="number" step="0.01" placeholder="0" className="field w-32"
                        value={r.monto}
                        onChange={(e) => updateReconRow(i, 'monto', e.target.value)}
                      />
                      <button type="button" onClick={() => removeReconRow(i)} className="text-[#ccc] hover:text-red-500 text-sm px-1">✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1 text-sm border-t border-[#f0e6d8] pt-2">
                <div className="flex justify-between">
                  <span className="text-[#888]">Total reconciliado</span>
                  <span className="font-semibold">{pesos(totalReconciliado)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#888]">Esperado (inicio + ganancia)</span>
                  <span className="font-medium">{pesos(esperadoCierre)}</span>
                </div>
                {cierraExacto ? (
                  <p data-testid="cierre-diferencia" className="text-green-700 font-semibold">✓ Cierra exacto</p>
                ) : (
                  <p data-testid="cierre-diferencia" className="text-orange-600 font-semibold">
                    Diferencia: {pesos(diferenciaCierre)} — revisá antes de confirmar
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label>Reparto de ganancia</Label>
              <input
                type="number" step="0.01" placeholder="Tipo de cambio dólar" className="field mb-2"
                value={cierreForm.tipo_cambio_dolar}
                onChange={(e) => setCierreForm((f) => ({ ...f, tipo_cambio_dolar: e.target.value }))}
              />

              {cierreForm.reparto.length > 0 && (
                <div className="space-y-2">
                  {cierreForm.reparto.map((r, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text" placeholder="Persona" className="field flex-1"
                        value={r.persona}
                        onChange={(e) => updateRepartoRow(i, 'persona', e.target.value)}
                      />
                      <input
                        type="number" step="0.01" placeholder="Monto $" className="field w-28"
                        value={r.monto}
                        onChange={(e) => updateRepartoRow(i, 'monto', e.target.value)}
                      />
                      <input
                        type="number" step="0.01" placeholder="U$D" className="field w-24"
                        value={r.monto_dolares}
                        onChange={(e) => updateRepartoRow(i, 'monto_dolares', e.target.value)}
                      />
                      <button type="button" onClick={() => removeRepartoRow(i)} className="text-[#ccc] hover:text-red-500 text-sm px-1">✕</button>
                    </div>
                  ))}
                </div>
              )}

              <button type="button" onClick={addRepartoRow} className="text-xs text-[var(--color-primario)] hover:underline font-medium mt-2">
                + Agregar persona
              </button>
            </div>

            <div>
              <Label>Monto final ($)</Label>
              <input
                type="number" step="0.01" className="field" placeholder="0"
                value={cierreForm.monto_final}
                onChange={(e) => setCierreForm((f) => ({ ...f, monto_final: e.target.value }))}
              />
            </div>

            <div>
              <Label>Observaciones</Label>
              <textarea
                rows={2} className="field resize-none"
                value={cierreForm.observaciones}
                onChange={(e) => setCierreForm((f) => ({ ...f, observaciones: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-4 border-t border-[#f0e6d8] mt-4">
              <button type="button" onClick={closeCierreModal} className="btn-secondary flex-1 py-2">
                Cancelar
              </button>
              <button type="submit" data-testid="btn-confirmar-cierre" disabled={savingCierre} className="btn-primary flex-1 py-2 disabled:opacity-50">
                {savingCierre ? 'Guardando...' : 'Confirmar cierre'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* --- Modal: ver detalle de un cierre (sólo lectura) ------------- */}
      {detalleCierre && (
        <Modal title={labelCierre(detalleCierre)} onClose={cerrarDetalle} wide>
          {loadingDetalle ? (
            <p className="text-sm text-[#888] py-6 text-center">Cargando...</p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div><span className="text-[#888] block">Desde</span><span className="font-medium">{fmtD(detalleCierre.fecha_desde)}</span></div>
                <div><span className="text-[#888] block">Hasta</span><span className="font-medium">{fmtD(detalleCierre.fecha_hasta)}</span></div>
                <div><span className="text-[#888] block">Fecha de cierre</span><span className="font-medium">{fmtD(detalleCierre.fecha_cierre)}</span></div>
                <div><span className="text-[#888] block">Inicio manual</span><span className="font-medium">{pesos(detalleCierre.inicio_manual)}</span></div>
                <div><span className="text-[#888] block">Tipo de cambio dólar</span><span className="font-medium">{detalleCierre.tipo_cambio_dolar != null ? detalleCierre.tipo_cambio_dolar : '—'}</span></div>
                <div><span className="text-[#888] block">Monto final</span><span className="font-medium">{detalleCierre.monto_final != null ? pesos(detalleCierre.monto_final) : '—'}</span></div>
              </div>

              <div className="bg-[var(--color-secundario)] border border-[#f0e6d8] rounded-[12px] p-4">
                <p className="section-label mb-3">Resumen recalculado del período</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-[#888]">Préstamos</span><span className="font-medium">{pesos(detalleRecap?.prestamos)}</span></div>
                  <div className="flex justify-between"><span className="text-[#888]">Ventas</span><span className="font-medium">{pesos(detalleRecap?.ventas)}</span></div>
                  <div className="flex justify-between"><span className="text-[#888]">Ingreso total</span><span className="font-medium">{pesos(detalleRecap?.ingresoTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-[#888]">Devoluciones</span><span className="font-medium">{pesos(detalleRecap?.devoluciones)}</span></div>
                  <div className="flex justify-between"><span className="text-[#888]">Gastos</span><span className="font-medium">{pesos(detalleRecap?.gastos)}</span></div>
                  <div className="flex justify-between font-semibold text-[#111]"><span>Ganancia</span><span>{pesos(detalleRecap?.ganancia)}</span></div>
                </div>
              </div>

              <div>
                <p className="section-label mb-2">Reconciliación física</p>
                {detalleRecon.length === 0 ? (
                  <p className="text-sm text-[#888]">Sin conceptos cargados.</p>
                ) : (
                  <div className="space-y-1 text-sm">
                    {detalleRecon.map((r) => (
                      <div key={r.id} className="flex justify-between border-b border-[#f0e6d8] pb-1">
                        <span className="text-[#333]">{r.concepto}</span>
                        <span className="font-medium">{pesos(r.monto)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="section-label mb-2">Reparto de ganancia</p>
                {detalleReparto.length === 0 ? (
                  <p className="text-sm text-[#888]">Sin personas cargadas.</p>
                ) : (
                  <div className="space-y-1 text-sm">
                    {detalleReparto.map((r) => (
                      <div key={r.id} className="flex justify-between border-b border-[#f0e6d8] pb-1">
                        <span className="text-[#333]">{r.persona}</span>
                        <span className="font-medium">
                          {pesos(r.monto)}{r.monto_dolares != null ? ` · U$D ${r.monto_dolares}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {detalleCierre.observaciones && (
                <div>
                  <p className="section-label mb-1">Observaciones</p>
                  <p className="text-sm text-[#333] whitespace-pre-wrap">{detalleCierre.observaciones}</p>
                </div>
              )}

              <div className="flex pt-4 border-t border-[#f0e6d8] mt-4">
                <button type="button" onClick={cerrarDetalle} className="btn-secondary flex-1 py-2">
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

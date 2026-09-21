import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import FileUpload, { getPublicUrl } from '../components/FileUpload'
import { format, parseISO, getMonth, getYear } from 'date-fns'
import { es } from 'date-fns/locale'
import { useComplejo } from '../context/ComplejoContext'
import CajaTemporada from './CajaTemporada'

// Este archivo exporta MONTO_MINIMO_VIP/cumpleMontoMinimoVip además del
// componente default, para que los tests unitarios (tests/unit/)
// puedan importar y ejercitar la regla real en vez de reimplementarla.
// Eso rompe el supuesto de Fast Refresh de "un archivo de componente
// sólo exporta componentes" — sin impacto en runtime/producción, sólo
// hace que Vite recargue toda la página en vez de hacer hot-swap al
// editar este archivo en desarrollo.
/* eslint-disable react-refresh/only-export-components */

// --- Constants ---------------------------------------------

const GASTOS_SILVIA = [
  'El Barba / Ferretería', 'Extragas', 'EDEA', 'Tavo Destapador', 'Scyco Agua',
  'Cootelser', 'Sueldos', 'Jardinero', 'Limpieza de pileta', 'Bazar',
  'Publicidad en Internet', 'Marea TV Cable', 'Gastos extras', 'Mantenimiento',
  'Bomberos Voluntarios', 'Forrajería', 'Casa Triju', 'Varios',
]

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const NOW_YEAR = new Date().getFullYear()
const YEARS    = [NOW_YEAR - 1, NOW_YEAR, NOW_YEAR + 1]
const TODAY    = new Date().toISOString().slice(0, 10)

// --- Helpers -----------------------------------------------

const fmtD  = (d) => d ? format(parseISO(d), 'dd/MM/yyyy', { locale: es }) : '—'
const num   = (v) => Number(v) || 0
const pesos = (v) => `$${num(v).toLocaleString('es-AR')}`

function getTipoSilvia(r) {
  if (num(r.ingreso_pesos)   > 0) return 'ingreso_alquiler'
  if (num(r.ingreso_juli)    > 0) return 'ingreso_juli'
  if (num(r.gasto)           > 0) return 'gasto'
  if (num(r.retiro_pesos)    > 0) return 'retiro'
  return null
}

const AMOUNT_CL = {
  ingreso_alquiler: 'text-green-700  font-semibold',
  ingreso_juli:     'text-emerald-700 font-semibold',
  gasto:            'text-red-600    font-semibold',
  retiro:           'text-orange-600 font-semibold',
}

const ic = 'field'
const sc = 'field w-auto'

// Cabañas VIP no tiene un chequeo JS imperativo para "el monto tiene
// que ser > $0" en sus 3 forms de monto único (SilviaCaja/JuliCaja/
// CajaTransfer, más abajo) — a diferencia de CajaTemporada (que suma 3
// campos y sí necesita un predicado propio), acá la regla la aplica
// enteramente la constraint nativa min="0.01" del navegador en el
// input; no hay ningún "if" en el código que mover a una función sin
// cambiar comportamiento. Lo que sí estaba repetido 3 veces era el
// valor mágico "0.01" — se extrae acá como fuente única, y se expone
// la regla equivalente como función pura para poder testearla, sin
// agregar ningún bloqueo JS nuevo al submit (que sí cambiaría el
// comportamiento actual).
export const MONTO_MINIMO_VIP = 0.01
export function cumpleMontoMinimoVip(monto) {
  return Number(monto) >= MONTO_MINIMO_VIP
}

// --- UI atoms ----------------------------------------------

function BigTotals({ items }) {
  return (
    <div className="flex flex-wrap gap-4 mb-5">
      {items.map((item, i) => (
        <div key={i} className="flex-1 min-w-[200px] bg-[#d1fae5] border border-green-200 rounded-[16px] px-8 py-6 text-center">
          <p className="text-xs font-semibold text-[#065f46] uppercase tracking-widest mb-2">{item.label}</p>
          <p className="text-[#065f46] text-[32px] font-bold tabular-nums leading-none">{item.value}</p>
        </div>
      ))}
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

function FilterRow({ mes, anio, onMes, onAnio, onAdd, addLabel, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="section-label block mb-1">Mes</label>
          <select value={mes} onChange={e => onMes(Number(e.target.value))} className={sc}>
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="section-label block mb-1">Año</label>
          <select value={anio} onChange={e => onAnio(Number(e.target.value))} className={sc}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {children}
      </div>
      <button onClick={onAdd} className="btn-primary">
        {addLabel || '+ Nuevo movimiento'}
      </button>
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

function EmptyOrLoading({ loading }) {
  return (
    <p className="text-center text-[#888] py-14 text-sm">
      {loading ? 'Cargando movimientos...' : 'Sin movimientos en el período seleccionado'}
    </p>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-[16px] border border-[#f0e6d8] w-full max-w-md max-h-[92vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-3 border-b border-[#f0e6d8]">
          <h3 className="text-base font-semibold text-[#111]">{title}</h3>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function ModalActions({ onClose, saving }) {
  return (
    <div className="flex gap-3 pt-4 border-t border-[#f0e6d8] mt-4">
      <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2">
        Cancelar
      </button>
      <button type="submit" disabled={saving} className="btn-primary flex-1 py-2 disabled:opacity-50">
        {saving ? 'Guardando...' : 'Guardar movimiento'}
      </button>
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

function ToggleGroup({ options, value, onChange }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(o => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`py-2 rounded-[10px] text-sm font-semibold transition-all ${
            value === o.v
              ? o.active
              : 'bg-[var(--color-secundario)] border border-[#f0e6d8] text-[#555]'
          }`}>
          {o.l}
        </button>
      ))}
    </div>
  )
}

// --- Reserva sync helper -----------------------------------

async function syncReservaFromCaja(reservas, reservaId, monto, fecha, tipo) {
  const r = reservas.find(x => x.id === reservaId)
  if (!r) return
  const hasSena1 = num(r.sena1_monto) > 0
  const hasSena2 = num(r.sena2_monto) > 0
  const updates = {}
  if (!hasSena1) {
    updates.sena1_monto = monto
    updates.sena1_tipo  = tipo
    updates.sena1_fecha = fecha
    if (r.estado === 'Pendiente') updates.estado = 'Confirmada'
  } else if (!hasSena2) {
    updates.sena2_monto = monto
    updates.sena2_tipo  = tipo
    updates.sena2_fecha = fecha
  }
  if (Object.keys(updates).length > 0) {
    await supabase.from('reservas').update(updates).eq('id', reservaId)
  }
}

// --- CAJA SILVIA -------------------------------------------

const EMPTY_S = {
  tipo: 'ingreso',
  sub_tipo: 'alquiler',
  _reservaId: '',
  cuenta: '',
  fecha: TODAY,
  detalle: '',
  recibo: '',
  monto: '',
  comprobante: '',
}

function SilviaCaja({ reservas }) {
  const { complejoActivo } = useComplejo()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(EMPTY_S)
  const [saving, setSaving]   = useState(false)
  const [mes, setMes]         = useState(new Date().getMonth())
  const [anio, setAnio]       = useState(NOW_YEAR)
  const [tipo, setTipo]       = useState('todos')

  const load = async (isStale = () => false) => {
    if (!complejoActivo) {
      setRows([])
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('caja_silvia').select('*')
      .eq('complejo_id', complejoActivo.id)
      .order('fecha', { ascending: true })
      .order('created_at', { ascending: true })
    if (isStale()) return
    setRows(data || [])
    setLoading(false)
  }
  // Guard contra respuesta obsoleta — mismo patrón/motivo que
  // Ganancias.jsx (complejoActivo pasa por un default antes de que
  // Layout.jsx lo corrija al slug de la URL; sin esto, el fetch del
  // complejo viejo puede resolver después y pisar los datos correctos).
  useEffect(() => {
    let cancelado = false
    load(() => cancelado)
    return () => { cancelado = true }
  }, [complejoActivo?.id])

  const withTotals = useMemo(() => {
    let ps = 0
    return rows.map(r => {
      ps += num(r.ingreso_pesos) + num(r.ingreso_juli) - num(r.gasto) - num(r.retiro_pesos)
      return { ...r, _ps: ps }
    })
  }, [rows])

  const filtered = useMemo(() => withTotals.filter(r => {
    const d = parseISO(r.fecha)
    if (getMonth(d) !== mes || getYear(d) !== anio) return false
    const t = getTipoSilvia(r)
    if (tipo === 'ingresos' && !['ingreso_alquiler','ingreso_juli'].includes(t)) return false
    if (tipo === 'gastos'   && t !== 'gasto') return false
    if (tipo === 'retiros'  && t !== 'retiro') return false
    return true
  }), [withTotals, mes, anio, tipo])

  const sum = useMemo(() => {
    const m = withTotals.filter(r => {
      const d = parseISO(r.fecha)
      return getMonth(d) === mes && getYear(d) === anio
    })
    return {
      ingPesos: m.reduce((a, r) => a + num(r.ingreso_pesos), 0),
      ingJuli:  m.reduce((a, r) => a + num(r.ingreso_juli), 0),
      gastos:   m.reduce((a, r) => a + num(r.gasto), 0),
      retPesos: m.reduce((a, r) => a + num(r.retiro_pesos), 0),
      saldo:    m.length ? m[m.length - 1]._ps : 0,
    }
  }, [withTotals, mes, anio])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleReserva = (reservaId) => {
    const r = reservas.find(x => x.id === reservaId)
    if (r) {
      const saldo = num(r.monto_total) - num(r.sena1_monto) - num(r.sena2_monto) - num(r.pago_cabana_monto)
      setForm(f => ({
        ...f,
        _reservaId: reservaId,
        detalle: `${r.codigo} - ${r.nombre_apellido}`,
        monto: saldo > 0 ? String(saldo) : String(num(r.monto_total)),
      }))
    } else {
      setForm(f => ({ ...f, _reservaId: '', detalle: '', monto: '' }))
    }
  }

  const closeModal = () => { setModal(false); setForm(EMPTY_S) }

  const submit = async e => {
    e.preventDefault()
    if (!complejoActivo) {
      alert('No se pudo determinar el complejo activo. Recargá la página e intentá de nuevo.')
      return
    }
    const m = num(form.monto)
    setSaving(true)
    const isIngAlquiler = form.tipo === 'ingreso' && form.sub_tipo === 'alquiler'
    const isIngJuli     = form.tipo === 'ingreso' && form.sub_tipo === 'juli'
    const isGasto       = form.tipo === 'egreso'  && form.sub_tipo === 'gasto'
    const isRetiro      = form.tipo === 'egreso'  && form.sub_tipo === 'retiro'

    await supabase.from('caja_silvia').insert({
      complejo_id:     complejoActivo.id,
      fecha:           form.fecha,
      cuenta:          isIngAlquiler ? 'Alquiler'
                     : isIngJuli    ? 'Ingreso por Juli'
                     : isGasto      ? form.cuenta
                     : 'Retiro Pesos',
      detalle:         form.detalle || null,
      recibo:          form.recibo  || null,
      ingreso_pesos:   isIngAlquiler ? m : 0,
      ingreso_dolares: 0,
      ingreso_juli:    isIngJuli    ? m : 0,
      gasto:           isGasto      ? m : 0,
      retiro_pesos:    isRetiro     ? m : 0,
      retiro_dolares:  0,
      comprobante:     form.comprobante || null,
    })
    if (isIngAlquiler && form._reservaId) {
      await syncReservaFromCaja(reservas, form._reservaId, m, form.fecha, 'Efectivo')
    }
    setSaving(false); closeModal(); load()
  }

  const del = async id => {
    if (!confirm('¿Eliminar este movimiento?')) return
    await supabase.from('caja_silvia').delete().eq('id', id); load()
  }

  const isIngAlquiler = form.tipo === 'ingreso' && form.sub_tipo === 'alquiler'
  const isGasto       = form.tipo === 'egreso'  && form.sub_tipo === 'gasto'

  return (
    <div>
      <BigTotals items={[
        { label: 'Total en caja ARS', value: pesos(sum.saldo) },
      ]} />

      <StatCards items={[
        { label: 'Ingresos alquileres', value: pesos(sum.ingPesos), color: 'green'   },
        { label: 'Ingresos por Juli',   value: pesos(sum.ingJuli),  color: 'green'   },
        { label: 'Gastos',              value: pesos(sum.gastos),   color: 'red'     },
        { label: 'Retiros $',           value: pesos(sum.retPesos), color: 'orange'  },
      ]} />

      <FilterRow mes={mes} anio={anio} onMes={setMes} onAnio={setAnio} onAdd={() => setModal(true)}>
        <div>
          <label className="section-label block mb-1">Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={sc}>
            <option value="todos">Todos</option>
            <option value="ingresos">Ingresos</option>
            <option value="gastos">Gastos</option>
            <option value="retiros">Retiros</option>
          </select>
        </div>
      </FilterRow>

      {loading || filtered.length === 0
        ? <EmptyOrLoading loading={loading} />
        : (
          <div className="overflow-x-auto rounded-[16px] border border-[#f0e6d8] overflow-hidden">
            <table className="w-full" style={{ minWidth: 820 }}>
              <thead>
                <tr className="bg-[#111111] text-white">
                  <Th>Fecha</Th>
                  <Th>Cuenta</Th>
                  <Th>Detalle / Nº Op.</Th>
                  <Th>Recibo</Th>
                  <Th right cls="text-green-300">Ing. Pesos</Th>
                  <Th right cls="text-emerald-300">Ing. Juli</Th>
                  <Th right cls="text-red-300">Gastos</Th>
                  <Th right cls="text-orange-300">Retiro $</Th>
                  <Th right cls="bg-[#0d0d0d] text-white">Total $</Th>
                  <Th cls="text-center">Comp.</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const t  = getTipoSilvia(r)
                  const ac = AMOUNT_CL[t] || ''
                  return (
                    <tr key={r.id} className={`border-b border-[#f0e6d8] ${i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'} hover:bg-[var(--color-fila-hover)] transition-colors`}
                        style={{ boxShadow: undefined }}>
                      <Td>{fmtD(r.fecha)}</Td>
                      <Td cls="text-[#888]">{r.cuenta || '—'}</Td>
                      <Td cls="max-w-[140px] truncate text-[#333]" title={r.detalle}>{r.detalle || '—'}</Td>
                      <Td cls="text-[#888]">{r.recibo || '—'}</Td>
                      <Td right cls={t === 'ingreso_alquiler' ? ac : 'text-[#ddd]'}>{num(r.ingreso_pesos) > 0 ? pesos(r.ingreso_pesos) : ''}</Td>
                      <Td right cls={t === 'ingreso_juli'     ? ac : 'text-[#ddd]'}>{num(r.ingreso_juli)  > 0 ? pesos(r.ingreso_juli)  : ''}</Td>
                      <Td right cls={t === 'gasto'            ? ac : 'text-[#ddd]'}>{num(r.gasto)         > 0 ? pesos(r.gasto)         : ''}</Td>
                      <Td right cls={t === 'retiro'           ? ac : 'text-[#ddd]'}>{num(r.retiro_pesos)  > 0 ? pesos(r.retiro_pesos)  : ''}</Td>
                      <Td right cls="font-semibold text-[#111] bg-[var(--color-secundario)] border-l border-[#f0e6d8]">{pesos(r._ps)}</Td>
                      <Td cls="text-center">
                        {r.comprobante
                          ? <a href={getPublicUrl(r.comprobante)} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primario)] hover:underline text-xs font-medium">Ver</a>
                          : <span className="text-[#ddd] text-xs">—</span>}
                      </Td>
                      <Td>
                        <button onClick={() => del(r.id)} className="text-[#ccc] hover:text-red-500 transition-colors text-xs">✕</button>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      {modal && (
        <Modal title="Nuevo movimiento — Caja Silvia" onClose={closeModal}>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label required>Tipo</Label>
              <ToggleGroup
                value={form.tipo}
                onChange={v => setForm(f => ({ ...f, tipo: v, sub_tipo: v === 'ingreso' ? 'alquiler' : 'gasto', _reservaId: '', detalle: '', monto: '' }))}
                options={[
                  { v: 'ingreso', l: 'Ingreso', active: 'bg-green-600 text-white' },
                  { v: 'egreso',  l: 'Egreso',  active: 'bg-red-500 text-white'   },
                ]}
              />
            </div>

            {form.tipo === 'ingreso' && (
              <div>
                <Label required>Origen del ingreso</Label>
                <ToggleGroup
                  value={form.sub_tipo}
                  onChange={v => setForm(f => ({ ...f, sub_tipo: v, _reservaId: '', detalle: '', monto: '' }))}
                  options={[
                    { v: 'alquiler', l: 'Alquiler', active: 'bg-[var(--color-primario)] text-white' },
                    { v: 'juli',     l: 'Por Juli',  active: 'bg-[var(--color-primario)] text-white' },
                  ]}
                />
              </div>
            )}
            {form.tipo === 'egreso' && (
              <div>
                <Label required>Tipo de egreso</Label>
                <ToggleGroup
                  value={form.sub_tipo}
                  onChange={v => setForm(f => ({ ...f, sub_tipo: v, cuenta: '' }))}
                  options={[
                    { v: 'gasto',  l: 'Gasto',      active: 'bg-red-500 text-white'    },
                    { v: 'retiro', l: 'Retiro en $', active: 'bg-orange-500 text-white' },
                  ]}
                />
              </div>
            )}

            {isIngAlquiler && (
              <div>
                <Label>Vincular reserva</Label>
                <select value={form._reservaId} onChange={e => handleReserva(e.target.value)} className={ic}>
                  <option value="">— Sin vincular —</option>
                  {reservas.map(r => (
                    <option key={r.id} value={r.id}>{r.codigo} · {r.nombre_apellido}</option>
                  ))}
                </select>
              </div>
            )}

            {isGasto && (
              <div>
                <Label required>Categoría</Label>
                <select value={form.cuenta} onChange={e => set('cuenta', e.target.value)} required className={ic}>
                  <option value="">Seleccionar categoría</option>
                  {GASTOS_SILVIA.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label required>Fecha</Label>
                <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} required className={ic} />
              </div>
              <div>
                <Label required>Monto ($)</Label>
                <input type="number" min={MONTO_MINIMO_VIP} step="0.01" value={form.monto} onChange={e => set('monto', e.target.value)} required className={ic} placeholder="0" />
              </div>
              <div>
                <Label>Detalle / Nº Operación</Label>
                <input type="text" value={form.detalle} onChange={e => set('detalle', e.target.value)} className={ic} />
              </div>
              <div>
                <Label>Recibo</Label>
                <input type="text" value={form.recibo} onChange={e => set('recibo', e.target.value)} className={ic} />
              </div>
            </div>
            <FileUpload label="Comprobante" path={form.comprobante} onUpload={p => set('comprobante', p)} />
            <ModalActions onClose={closeModal} saving={saving} />
          </form>
        </Modal>
      )}
    </div>
  )
}

// --- CAJA JULI ---------------------------------------------

const EMPTY_J = {
  seccion: 'main', tipo_main: 'ingreso',
  fecha: TODAY,
  detalle: '', recibo: '', importe: '',
  transferencia_silvia: '', devolucion: '',
  modalidad_pago: 'Efectivo', devuelto: false, comprobante: '',
}

function JuliCaja() {
  const { complejoActivo } = useComplejo()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(EMPTY_J)
  const [saving, setSaving]   = useState(false)
  const [mes, setMes]         = useState(new Date().getMonth())
  const [anio, setAnio]       = useState(NOW_YEAR)
  const [vista, setVista]     = useState('main')

  const load = async (isStale = () => false) => {
    if (!complejoActivo) {
      setRows([])
      return
    }
    setLoading(true)
    const { data } = await supabase.from('caja_juli').select('*')
      .eq('complejo_id', complejoActivo.id)
      .order('fecha', { ascending: true }).order('created_at', { ascending: true })
    if (isStale()) return
    setRows(data || [])
    setLoading(false)
  }
  // Guard contra respuesta obsoleta — ver comentario en SilviaCaja arriba.
  useEffect(() => {
    let cancelado = false
    load(() => cancelado)
    return () => { cancelado = true }
  }, [complejoActivo?.id])

  const withTotals = useMemo(() => {
    let total = 0
    return rows.map(r => {
      if (r.seccion === 'main') {
        total += r.tipo_main === 'ingreso' ? num(r.importe) : -num(r.importe)
      } else {
        total += -num(r.importe) + num(r.devolucion) - num(r.transferencia_silvia)
      }
      return { ...r, _total: total }
    })
  }, [rows])

  const filtered = useMemo(() => withTotals.filter(r => {
    const d = parseISO(r.fecha)
    return getMonth(d) === mes && getYear(d) === anio && r.seccion === vista
  }), [withTotals, mes, anio, vista])

  const sum = useMemo(() => {
    const m = withTotals.filter(r => {
      const d = parseISO(r.fecha)
      return getMonth(d) === mes && getYear(d) === anio
    })
    const main   = m.filter(r => r.seccion === 'main')
    const gastos = m.filter(r => r.seccion === 'gastos')
    return {
      ingresos:     main.filter(r => r.tipo_main === 'ingreso').reduce((a, r) => a + num(r.importe), 0),
      egresos:      main.filter(r => r.tipo_main === 'egreso').reduce((a, r) => a + num(r.importe), 0),
      gastos:       gastos.reduce((a, r) => a + num(r.importe), 0),
      devoluciones: gastos.reduce((a, r) => a + num(r.devolucion), 0),
      transfSilvia: gastos.reduce((a, r) => a + num(r.transferencia_silvia), 0),
      saldo:        m.length ? m[m.length - 1]._total : 0,
    }
  }, [withTotals, mes, anio])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const openModal = (sec) => { setForm({ ...EMPTY_J, seccion: sec }); setModal(true) }
  const closeModal = () => { setModal(false); setForm(EMPTY_J) }

  const submit = async e => {
    e.preventDefault()
    if (!complejoActivo) {
      alert('No se pudo determinar el complejo activo. Recargá la página e intentá de nuevo.')
      return
    }
    setSaving(true)
    await supabase.from('caja_juli').insert({
      complejo_id: complejoActivo.id,
      seccion: form.seccion, tipo_main: form.seccion === 'main' ? form.tipo_main : null,
      fecha: form.fecha, detalle: form.detalle || null, recibo: form.recibo || null,
      importe: num(form.importe),
      transferencia_silvia: form.seccion === 'gastos' ? num(form.transferencia_silvia) : 0,
      devolucion: form.seccion === 'gastos' ? num(form.devolucion) : 0,
      modalidad_pago: form.seccion === 'gastos' ? form.modalidad_pago : null,
      devuelto: form.seccion === 'gastos' ? form.devuelto : false,
      comprobante: form.comprobante || null,
    })
    setSaving(false); closeModal(); load()
  }

  const del = async id => {
    if (!confirm('¿Eliminar este movimiento?')) return
    await supabase.from('caja_juli').delete().eq('id', id); load()
  }

  return (
    <div>
      <BigTotals items={[{ label: 'Total en caja', value: pesos(sum.saldo) }]} />

      <StatCards items={[
        { label: 'Ingresos',           value: pesos(sum.ingresos),     color: 'green'  },
        { label: 'Egresos',            value: pesos(sum.egresos),      color: 'red'    },
        { label: 'Gastos efec./MP',    value: pesos(sum.gastos),       color: 'red'    },
        { label: 'Devoluciones',       value: pesos(sum.devoluciones), color: 'green'  },
        { label: 'Transf. a Silvia',   value: pesos(sum.transfSilvia), color: 'orange' },
      ]} />

      <div className="flex items-center gap-1 mb-4 border-b border-[#f0e6d8]">
        {[{ value: 'main', label: 'Caja Juli' }, { value: 'gastos', label: 'Gastos efectivo / MP' }].map(v => (
          <button key={v.value} onClick={() => setVista(v.value)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-all ${
              vista === v.value ? 'border-[var(--color-primario)] text-[#111]' : 'border-transparent text-[#888] hover:text-[#333]'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <FilterRow mes={mes} anio={anio} onMes={setMes} onAnio={setAnio} onAdd={() => openModal(vista)}
        addLabel="+ Nuevo movimiento"
      />

      {vista === 'main' && (
        loading || filtered.length === 0
          ? <EmptyOrLoading loading={loading} />
          : (
            <div className="overflow-x-auto rounded-[16px] border border-[#f0e6d8] overflow-hidden">
              <table className="w-full" style={{ minWidth: 580 }}>
                <thead>
                  <tr className="bg-[#111111] text-white">
                    <Th>Fecha</Th>
                    <Th>Detalle / Nº Op.</Th>
                    <Th>Recibo</Th>
                    <Th right cls="text-green-300">Ingreso</Th>
                    <Th right cls="text-red-300">Egreso</Th>
                    <Th right cls="bg-[#0d0d0d] text-white">Total en caja</Th>
                    <Th cls="text-center">Comp.</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const esIng = r.tipo_main === 'ingreso'
                    return (
                      <tr key={r.id} className={`border-b border-[#f0e6d8] ${i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'} hover:bg-[var(--color-fila-hover)]`}>
                        <Td>{fmtD(r.fecha)}</Td>
                        <Td cls="max-w-[180px] truncate text-[#333]" title={r.detalle}>{r.detalle || '—'}</Td>
                        <Td cls="text-[#888]">{r.recibo || '—'}</Td>
                        <Td right cls={esIng ? 'text-green-700 font-semibold' : 'text-[#ddd]'}>{esIng ? pesos(r.importe) : ''}</Td>
                        <Td right cls={!esIng ? 'text-red-600 font-semibold' : 'text-[#ddd]'}>{!esIng ? pesos(r.importe) : ''}</Td>
                        <Td right cls="font-semibold text-[#111] bg-[var(--color-secundario)] border-l border-[#f0e6d8]">{pesos(r._total)}</Td>
                        <Td cls="text-center">
                          {r.comprobante ? <a href={getPublicUrl(r.comprobante)} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primario)] hover:underline text-xs font-medium">Ver</a> : <span className="text-[#ddd] text-xs">—</span>}
                        </Td>
                        <Td><button onClick={() => del(r.id)} className="text-[#ccc] hover:text-red-500 text-xs">✕</button></Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
      )}

      {vista === 'gastos' && (
        loading || filtered.length === 0
          ? <EmptyOrLoading loading={loading} />
          : (
            <div className="overflow-x-auto rounded-[16px] border border-[#f0e6d8] overflow-hidden">
              <table className="w-full" style={{ minWidth: 840 }}>
                <thead>
                  <tr className="bg-[#111111] text-white">
                    <Th>Fecha</Th>
                    <Th>Detalle / Nº Op.</Th>
                    <Th>Recibo</Th>
                    <Th right cls="text-orange-300">Transf. Silvia</Th>
                    <Th right cls="text-red-300">Importe</Th>
                    <Th right cls="text-green-300">Devolución</Th>
                    <Th right cls="bg-[#0d0d0d] text-white">Total en caja</Th>
                    <Th>Modalidad</Th>
                    <Th>Estado</Th>
                    <Th cls="text-center">Comp.</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.id} className={`border-b border-[#f0e6d8] ${i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'} hover:bg-[var(--color-fila-hover)]`}>
                      <Td>{fmtD(r.fecha)}</Td>
                      <Td cls="max-w-[140px] truncate text-[#333]" title={r.detalle}>{r.detalle || '—'}</Td>
                      <Td cls="text-[#888]">{r.recibo || '—'}</Td>
                      <Td right cls={num(r.transferencia_silvia) > 0 ? 'text-orange-600 font-semibold' : 'text-[#ddd]'}>{num(r.transferencia_silvia) > 0 ? pesos(r.transferencia_silvia) : ''}</Td>
                      <Td right cls="text-red-600 font-semibold">{pesos(r.importe)}</Td>
                      <Td right cls={num(r.devolucion) > 0 ? 'text-green-700 font-semibold' : 'text-[#ddd]'}>{num(r.devolucion) > 0 ? pesos(r.devolucion) : ''}</Td>
                      <Td right cls="font-semibold text-[#111] bg-[var(--color-secundario)] border-l border-[#f0e6d8]">{pesos(r._total)}</Td>
                      <Td>
                        <span className={`inline-flex px-2 py-0.5 rounded-[8px] text-xs font-medium ${r.modalidad_pago === 'Mercado Pago' ? 'bg-indigo-50 text-indigo-700' : 'bg-[var(--color-secundario)] text-[#555]'}`}>
                          {r.modalidad_pago || '—'}
                        </span>
                      </Td>
                      <Td>
                        <span className={`inline-flex px-2 py-0.5 rounded-[8px] text-xs font-medium ${r.devuelto ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          {r.devuelto ? 'Devuelto' : 'Pendiente'}
                        </span>
                      </Td>
                      <Td cls="text-center">
                        {r.comprobante ? <a href={getPublicUrl(r.comprobante)} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primario)] hover:underline text-xs font-medium">Ver</a> : <span className="text-[#ddd] text-xs">—</span>}
                      </Td>
                      <Td><button onClick={() => del(r.id)} className="text-[#ccc] hover:text-red-500 text-xs">✕</button></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}

      {modal && (
        <Modal
          title={`Nuevo movimiento — ${form.seccion === 'main' ? 'Caja Juli' : 'Gastos efectivo / MP'}`}
          onClose={closeModal}
        >
          <form onSubmit={submit} className="space-y-4">
            {form.seccion === 'main' && (
              <div>
                <Label>Tipo</Label>
                <ToggleGroup
                  value={form.tipo_main}
                  onChange={v => setForm(f => ({ ...f, tipo_main: v, detalle: '' }))}
                  options={[
                    { v: 'ingreso', l: 'Ingreso', active: 'bg-green-600 text-white' },
                    { v: 'egreso',  l: 'Egreso',  active: 'bg-red-500 text-white'   },
                  ]}
                />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label required>Fecha</Label>
                <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} required className={ic} />
              </div>
              <div>
                <Label required>Importe ($)</Label>
                <input type="number" min={MONTO_MINIMO_VIP} step="0.01" value={form.importe} onChange={e => set('importe', e.target.value)} required className={ic} placeholder="0" />
              </div>
              <div>
                {(form.seccion === 'gastos' || (form.seccion === 'main' && form.tipo_main === 'egreso')) ? (
                  <>
                    <Label required>Categoría</Label>
                    <select value={form.detalle} onChange={e => set('detalle', e.target.value)} required className={ic}>
                      <option value="">Seleccionar categoría</option>
                      {GASTOS_SILVIA.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </>
                ) : (
                  <>
                    <Label>Detalle / Nº Operación</Label>
                    <input type="text" value={form.detalle} onChange={e => set('detalle', e.target.value)} className={ic} />
                  </>
                )}
              </div>
              <div>
                <Label>Recibo</Label>
                <input type="text" value={form.recibo} onChange={e => set('recibo', e.target.value)} className={ic} />
              </div>
            </div>
            {form.seccion === 'gastos' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Transf. a Silvia ($)</Label>
                    <input type="number" min={0} step="0.01" value={form.transferencia_silvia} onChange={e => set('transferencia_silvia', e.target.value)} className={ic} placeholder="0" />
                  </div>
                  <div>
                    <Label>Devolución ($)</Label>
                    <input type="number" min={0} step="0.01" value={form.devolucion} onChange={e => set('devolucion', e.target.value)} className={ic} placeholder="0" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div>
                    <Label>Modalidad de pago</Label>
                    <select value={form.modalidad_pago} onChange={e => set('modalidad_pago', e.target.value)} className={ic}>
                      <option>Efectivo</option>
                      <option>Mercado Pago</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none pb-1">
                    <input type="checkbox" checked={form.devuelto} onChange={e => set('devuelto', e.target.checked)} className="w-4 h-4 rounded accent-green-600" />
                    <span className="text-sm text-[#333] font-medium">Devuelto</span>
                  </label>
                </div>
              </>
            )}
            <FileUpload label="Comprobante" path={form.comprobante} onUpload={p => set('comprobante', p)} />
            <ModalActions onClose={closeModal} saving={saving} />
          </form>
        </Modal>
      )}
    </div>
  )
}

// --- CAJA TRANSFER (Banco / Mercado Pago) ------------------

const emptyTransfer = () => ({
  tipo: 'ingreso',
  _reservaId: '',
  fecha: TODAY,
  detalle: '',
  reserva_codigo: '',
  reserva_nombre: '',
  monto: '',
  comprobante: '',
})

function CajaTransfer({ tabla, titulo, reservas }) {
  const { complejoActivo } = useComplejo()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(emptyTransfer())
  const [saving, setSaving]   = useState(false)
  const [mes, setMes]         = useState(new Date().getMonth())
  const [anio, setAnio]       = useState(NOW_YEAR)

  const load = async (isStale = () => false) => {
    if (!complejoActivo) {
      setRows([])
      return
    }
    setLoading(true)
    const { data } = await supabase.from(tabla).select('*')
      .eq('complejo_id', complejoActivo.id)
      .order('fecha', { ascending: true })
      .order('created_at', { ascending: true })
    if (isStale()) return
    setRows(data || [])
    setLoading(false)
  }
  // Guard contra respuesta obsoleta — ver comentario en SilviaCaja arriba.
  useEffect(() => {
    let cancelado = false
    load(() => cancelado)
    return () => { cancelado = true }
  }, [tabla, complejoActivo?.id])

  const withTotals = useMemo(() => {
    let total = 0
    return rows.map(r => {
      total += num(r.ingreso) - num(r.egreso)
      return { ...r, _total: total }
    })
  }, [rows])

  const filtered = useMemo(() => withTotals.filter(r => {
    const d = parseISO(r.fecha)
    return getMonth(d) === mes && getYear(d) === anio
  }), [withTotals, mes, anio])

  const sum = useMemo(() => {
    const m = withTotals.filter(r => {
      const d = parseISO(r.fecha)
      return getMonth(d) === mes && getYear(d) === anio
    })
    return {
      ingresos: m.reduce((a, r) => a + num(r.ingreso), 0),
      egresos:  m.reduce((a, r) => a + num(r.egreso), 0),
      saldo:    m.length ? m[m.length - 1]._total : 0,
    }
  }, [withTotals, mes, anio])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleReserva = (reservaId) => {
    const r = reservas.find(x => x.id === reservaId)
    if (r) {
      setForm(f => ({
        ...f,
        _reservaId: reservaId,
        reserva_codigo: r.codigo,
        reserva_nombre: r.nombre_apellido,
        detalle: `${r.codigo} - ${r.nombre_apellido}`,
      }))
    } else {
      setForm(f => ({ ...f, _reservaId: '', reserva_codigo: '', reserva_nombre: '', detalle: '' }))
    }
  }

  const closeModal = () => { setModal(false); setForm(emptyTransfer()) }

  const submit = async e => {
    e.preventDefault()
    if (!complejoActivo) {
      alert('No se pudo determinar el complejo activo. Recargá la página e intentá de nuevo.')
      return
    }
    setSaving(true)
    await supabase.from(tabla).insert({
      complejo_id:    complejoActivo.id,
      fecha:          form.fecha,
      detalle:        form.detalle        || null,
      reserva_codigo: form.reserva_codigo || null,
      reserva_nombre: form.reserva_nombre || null,
      ingreso:        form.tipo === 'ingreso' ? num(form.monto) : 0,
      egreso:         form.tipo === 'egreso'  ? num(form.monto) : 0,
      comprobante:    form.comprobante    || null,
    })
    if (form.tipo === 'ingreso' && form._reservaId) {
      const tipoSena = tabla === 'caja_mercado_pago' ? 'Mercado Pago' : 'Banco'
      await syncReservaFromCaja(reservas, form._reservaId, num(form.monto), form.fecha, tipoSena)
    }
    setSaving(false); closeModal(); load()
  }

  const del = async id => {
    if (!confirm('¿Eliminar este movimiento?')) return
    await supabase.from(tabla).delete().eq('id', id); load()
  }

  const toggleChequeado = async (id, current) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, chequeado: !current } : r))
    await supabase.from(tabla).update({ chequeado: !current }).eq('id', id)
  }

  return (
    <div>
      <BigTotals items={[
        { label: `Total en caja ${titulo}`, value: pesos(sum.saldo) },
      ]} />

      <StatCards items={[
        { label: 'Ingresos del período', value: pesos(sum.ingresos), color: 'green' },
        { label: 'Egresos del período',  value: pesos(sum.egresos),  color: 'red'   },
      ]} />

      <FilterRow mes={mes} anio={anio} onMes={setMes} onAnio={setAnio} onAdd={() => setModal(true)} />

      {loading || filtered.length === 0
        ? <EmptyOrLoading loading={loading} />
        : (
          <div className="overflow-x-auto rounded-[16px] border border-[#f0e6d8] overflow-hidden">
            <table className="w-full" style={{ minWidth: 780 }}>
              <thead>
                <tr className="bg-[#111111] text-white">
                  <Th>Fecha</Th>
                  <Th>Detalle</Th>
                  <Th>Reserva</Th>
                  <Th right cls="text-green-300">Ingreso</Th>
                  <Th right cls="text-red-300">Egreso</Th>
                  <Th right cls="bg-[#0d0d0d] text-white">Total</Th>
                  <Th cls="text-center">Comp.</Th>
                  <Th cls="text-center">Chequeado</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} className={`border-b border-[#f0e6d8] ${i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-secundario)]'} hover:bg-[var(--color-fila-hover)]`}>
                    <Td>{fmtD(r.fecha)}</Td>
                    <Td cls="max-w-[200px] truncate text-[#333]" title={r.detalle}>{r.detalle || '—'}</Td>
                    <Td cls="text-[#888] font-mono text-xs">{r.reserva_codigo || '—'}</Td>
                    <Td right cls={num(r.ingreso) > 0 ? 'text-green-700 font-semibold' : 'text-[#ddd]'}>{num(r.ingreso) > 0 ? pesos(r.ingreso) : ''}</Td>
                    <Td right cls={num(r.egreso)  > 0 ? 'text-red-600  font-semibold' : 'text-[#ddd]'}>{num(r.egreso)  > 0 ? pesos(r.egreso)  : ''}</Td>
                    <Td right cls="font-semibold text-[#111] bg-[var(--color-secundario)] border-l border-[#f0e6d8]">{pesos(r._total)}</Td>
                    <Td cls="text-center">
                      {r.comprobante
                        ? <a href={getPublicUrl(r.comprobante)} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primario)] hover:underline text-xs font-medium">Ver</a>
                        : <span className="text-[#ddd] text-xs">—</span>}
                    </Td>
                    <Td cls="text-center">
                      <input
                        type="checkbox"
                        checked={!!r.chequeado}
                        onChange={() => toggleChequeado(r.id, r.chequeado)}
                        className="w-4 h-4 rounded accent-[var(--color-primario)] cursor-pointer"
                        title={r.chequeado ? 'Chequeado' : 'Sin chequear'}
                      />
                    </Td>
                    <Td><button onClick={() => del(r.id)} className="text-[#ccc] hover:text-red-500 text-xs">✕</button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {modal && (
        <Modal title={`Nuevo movimiento — ${titulo}`} onClose={closeModal}>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label required>Tipo</Label>
              <ToggleGroup
                value={form.tipo}
                onChange={v => set('tipo', v)}
                options={[
                  { v: 'ingreso', l: 'Ingreso', active: 'bg-green-600 text-white' },
                  { v: 'egreso',  l: 'Egreso',  active: 'bg-red-500 text-white'   },
                ]}
              />
            </div>

            {form.tipo === 'ingreso' && (
              <div>
                <Label>Vincular reserva (opcional)</Label>
                <select value={form._reservaId} onChange={e => handleReserva(e.target.value)} className={ic}>
                  <option value="">— Sin vincular —</option>
                  {reservas.map(r => (
                    <option key={r.id} value={r.id}>{r.codigo} · {r.nombre_apellido}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label required>Fecha</Label>
                <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} required className={ic} />
              </div>
              <div>
                <Label required>Monto ($)</Label>
                <input type="number" min={MONTO_MINIMO_VIP} step="0.01" value={form.monto} onChange={e => set('monto', e.target.value)} required className={ic} placeholder="0" />
              </div>
            </div>

            <div>
              <Label>Detalle</Label>
              <input type="text" value={form.detalle} onChange={e => set('detalle', e.target.value)} className={ic} placeholder="Descripción del movimiento" />
            </div>

            <FileUpload label="Comprobante" path={form.comprobante} onUpload={p => set('comprobante', p)} />
            <ModalActions onClose={closeModal} saving={saving} />
          </form>
        </Modal>
      )}
    </div>
  )
}

// --- MAIN --------------------------------------------------

const TABS = [
  { v: 'silvia', l: 'Caja Silvia' },
  { v: 'juli',   l: 'Caja Juli'   },
  { v: 'banco',  l: 'Banco'       },
  { v: 'mp',     l: 'Mercado Pago'},
]

// Fase 6 — rol='limitado_caja_silvia' sólo ve la vista Caja Silvia, ni
// siquiera el selector de pestañas para las otras 3 (Juli/Banco/MP
// están bloqueadas también a nivel de RLS, ver 021_membresias_rol.sql
// — esto es la capa de UX encima de eso, no un reemplazo). rol=
// 'limitado_reservas' no debería poder llegar nunca a este componente
// (RequiereSeccion.jsx bloquea la ruta /caja entera para ese rol) — el
// caso 0 pestañas de acá es sólo defensa en profundidad, para que esta
// función nunca devuelva "todo visible" si algún día algo la llama sin
// pasar por ese guard.
export function tabsCajaVipVisibles(rol) {
  if (rol === 'limitado_caja_silvia') return TABS.filter((t) => t.v === 'silvia')
  if (rol === 'limitado_reservas') return []
  return TABS
}

export default function Caja() {
  const { complejoActivo } = useComplejo()

  // Cabañas VIP sigue con su Caja de siempre (Silvia/Juli/Banco/MP), sin
  // ningún cambio. Cualquier otro complejo usa la nueva Caja "temporada".
  // Se resuelve como un componente distinto (no un return temprano dentro
  // de esta misma función) porque CajaVIP declara sus propios hooks
  // (useState/useEffect) — mezclar eso con un return condicional en el
  // mismo cuerpo de función violaría las Rules of Hooks apenas el usuario
  // cambie de complejo activo sin recargar la página.
  if (complejoActivo?.slug && complejoActivo.slug !== 'cabanas-vip') {
    return <CajaTemporada />
  }
  return <CajaVIP />
}

function CajaVIP() {
  const { complejoActivo, rolActivo } = useComplejo()
  const [tab, setTab]           = useState('silvia')
  const [reservas, setReservas] = useState([])
  // rol='limitado_caja_silvia': ni el switcher de pestañas se muestra
  // (nada a lo que cambiar — tabsCajaVipVisibles ya sólo devuelve
  // 'silvia'), y `tab` nunca deja de ser su default 'silvia' porque no
  // hay ningún botón que lo cambie.
  const tabsVisibles = tabsCajaVipVisibles(rolActivo)
  const soloSilvia = tabsVisibles.length === 1

  // Guard contra respuesta obsoleta — ver comentario en SilviaCaja arriba.
  useEffect(() => {
    if (!complejoActivo) {
      setReservas([])
      return
    }
    let cancelado = false
    supabase
      .from('reservas')
      .select('id, codigo, nombre_apellido, monto_total, sena1_monto, sena2_monto, pago_cabana_monto, estado')
      .eq('complejo_id', complejoActivo.id)
      .neq('estado', 'Cancelada')
      .order('codigo', { ascending: false })
      .then(({ data }) => {
        if (cancelado) return
        setReservas(data || [])
      })
    return () => { cancelado = true }
  }, [complejoActivo?.id])

  return (
    <div className="fade-in">
      <div className="border-b border-[#f0e6d8] mb-6">
        <div className="flex items-end justify-between">
          <div className="pb-3">
            <h2 className="text-[28px] font-bold text-[#111111]">Caja</h2>
            <p className="text-sm text-[#888] mt-0.5">Registro de movimientos y totales</p>
          </div>
          {!soloSilvia && (
            <div className="flex flex-wrap">
              {tabsVisibles.map(t => (
                <button
                  key={t.v}
                  onClick={() => setTab(t.v)}
                  className={`px-6 py-3 text-sm font-semibold border-b-2 -mb-px transition-all ${
                    tab === t.v
                      ? 'border-[var(--color-primario)] text-[#111111]'
                      : 'border-transparent text-[#888] hover:text-[#333] hover:border-[#f0e6d8]'
                  }`}
                >
                  {t.l}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {tab === 'silvia' && <SilviaCaja reservas={reservas} />}
      {tab === 'juli'   && <JuliCaja />}
      {tab === 'banco'  && <CajaTransfer tabla="caja_banco"        titulo="Banco"         reservas={reservas} />}
      {tab === 'mp'     && <CajaTransfer tabla="caja_mercado_pago" titulo="Mercado Pago"  reservas={reservas} />}
    </div>
  )
}

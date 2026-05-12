import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import FileUpload, { getPublicUrl } from '../components/FileUpload'
import { format, parseISO, getMonth, getYear } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── Constants ─────────────────────────────────────────────

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

// ─── Helpers ───────────────────────────────────────────────

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

const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400'
const sc = 'border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 text-gray-700'

// ─── UI atoms ──────────────────────────────────────────────

function BigTotals({ items }) {
  return (
    <div className="bg-slate-800 rounded-2xl px-8 py-5 mb-4 flex flex-wrap items-center justify-around gap-6">
      {items.map((item, i) => (
        <div key={i} className="text-center">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">{item.label}</p>
          <p className="text-white text-3xl font-semibold tabular-nums">{item.value}</p>
        </div>
      ))}
    </div>
  )
}

function StatCards({ items }) {
  const colorText = { green: 'text-green-700', red: 'text-red-600', orange: 'text-orange-600', blue: 'text-blue-700', neutral: 'text-slate-700' }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
      {items.map((item, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-400 font-medium mb-1">{item.label}</p>
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
          <label className="text-xs text-gray-400 block mb-1 font-medium">Mes</label>
          <select value={mes} onChange={e => onMes(Number(e.target.value))} className={sc}>
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1 font-medium">Año</label>
          <select value={anio} onChange={e => onAnio(Number(e.target.value))} className={sc}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {children}
      </div>
      <button
        onClick={onAdd}
        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
      >
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
    <p className="text-center text-gray-400 py-14 text-sm">
      {loading ? 'Cargando movimientos...' : 'Sin movimientos en el período seleccionado'}
    </p>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-2 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function ModalActions({ onClose, saving }) {
  return (
    <div className="flex gap-3 pt-4 border-t border-gray-100 mt-4">
      <button type="button" onClick={onClose}
        className="flex-1 border border-gray-300 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors text-gray-700">
        Cancelar
      </button>
      <button type="submit" disabled={saving}
        className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors">
        {saving ? 'Guardando...' : 'Guardar movimiento'}
      </button>
    </div>
  )
}

function Label({ children, required }) {
  return (
    <label className="text-xs font-semibold text-gray-500 block mb-1">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )
}

function ToggleGroup({ options, value, onChange }) {
  return (
    <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(o => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`py-2 rounded-lg text-sm font-semibold border-2 transition-all ${
            value === o.v ? o.active : 'border-gray-200 text-gray-500 bg-white hover:bg-gray-50'
          }`}>
          {o.l}
        </button>
      ))}
    </div>
  )
}

// ─── CAJA SILVIA ───────────────────────────────────────────

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
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(EMPTY_S)
  const [saving, setSaving]   = useState(false)
  const [mes, setMes]         = useState(new Date().getMonth())
  const [anio, setAnio]       = useState(NOW_YEAR)
  const [tipo, setTipo]       = useState('todos')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('caja_silvia').select('*')
      .order('fecha', { ascending: true })
      .order('created_at', { ascending: true })
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

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
    e.preventDefault(); setSaving(true)
    const m = num(form.monto)
    const isIngAlquiler = form.tipo === 'ingreso' && form.sub_tipo === 'alquiler'
    const isIngJuli     = form.tipo === 'ingreso' && form.sub_tipo === 'juli'
    const isGasto       = form.tipo === 'egreso'  && form.sub_tipo === 'gasto'
    const isRetiro      = form.tipo === 'egreso'  && form.sub_tipo === 'retiro'

    await supabase.from('caja_silvia').insert({
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
          <label className="text-xs text-gray-400 block mb-1 font-medium">Tipo</label>
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
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full" style={{ minWidth: 820 }}>
              <thead>
                <tr className="bg-slate-800 text-slate-200">
                  <Th>Fecha</Th>
                  <Th>Cuenta</Th>
                  <Th>Detalle / Nº Op.</Th>
                  <Th>Recibo</Th>
                  <Th right cls="text-green-300">Ing. Pesos</Th>
                  <Th right cls="text-emerald-300">Ing. Juli</Th>
                  <Th right cls="text-red-300">Gastos</Th>
                  <Th right cls="text-orange-300">Retiro $</Th>
                  <Th right cls="bg-slate-900 text-slate-100">Total $</Th>
                  <Th cls="text-center">Comp.</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const t  = getTipoSilvia(r)
                  const ac = AMOUNT_CL[t] || ''
                  return (
                    <tr key={r.id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-slate-50 transition-colors`}>
                      <Td>{fmtD(r.fecha)}</Td>
                      <Td cls="text-gray-500">{r.cuenta || '—'}</Td>
                      <Td cls="max-w-[140px] truncate text-gray-700" title={r.detalle}>{r.detalle || '—'}</Td>
                      <Td cls="text-gray-500">{r.recibo || '—'}</Td>
                      <Td right cls={t === 'ingreso_alquiler' ? ac : 'text-gray-200'}>{num(r.ingreso_pesos) > 0 ? pesos(r.ingreso_pesos) : ''}</Td>
                      <Td right cls={t === 'ingreso_juli'     ? ac : 'text-gray-200'}>{num(r.ingreso_juli)  > 0 ? pesos(r.ingreso_juli)  : ''}</Td>
                      <Td right cls={t === 'gasto'            ? ac : 'text-gray-200'}>{num(r.gasto)         > 0 ? pesos(r.gasto)         : ''}</Td>
                      <Td right cls={t === 'retiro'           ? ac : 'text-gray-200'}>{num(r.retiro_pesos)  > 0 ? pesos(r.retiro_pesos)  : ''}</Td>
                      <Td right cls="font-semibold text-slate-800 bg-slate-50 border-l border-slate-200">{pesos(r._ps)}</Td>
                      <Td cls="text-center">
                        {r.comprobante
                          ? <a href={getPublicUrl(r.comprobante)} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:underline text-xs font-medium">Ver</a>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </Td>
                      <Td>
                        <button onClick={() => del(r.id)} className="text-gray-300 hover:text-red-500 transition-colors text-xs">✕</button>
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
            {/* Ingreso / Egreso */}
            <div>
              <Label required>Tipo</Label>
              <ToggleGroup
                value={form.tipo}
                onChange={v => setForm(f => ({ ...f, tipo: v, sub_tipo: v === 'ingreso' ? 'alquiler' : 'gasto', _reservaId: '', detalle: '', monto: '' }))}
                options={[
                  { v: 'ingreso', l: 'Ingreso', active: 'bg-green-600 text-white border-green-600' },
                  { v: 'egreso',  l: 'Egreso',  active: 'bg-red-500 text-white border-red-500'   },
                ]}
              />
            </div>

            {/* Sub-tipo */}
            {form.tipo === 'ingreso' && (
              <div>
                <Label required>Origen del ingreso</Label>
                <ToggleGroup
                  value={form.sub_tipo}
                  onChange={v => setForm(f => ({ ...f, sub_tipo: v, _reservaId: '', detalle: '', monto: '' }))}
                  options={[
                    { v: 'alquiler', l: 'Alquiler', active: 'bg-blue-600 text-white border-blue-600'    },
                    { v: 'juli',     l: 'Por Juli',  active: 'bg-blue-600 text-white border-blue-600'   },
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
                    { v: 'gasto',  l: 'Gasto',         active: 'bg-red-500   text-white border-red-500'    },
                    { v: 'retiro', l: 'Retiro en $',    active: 'bg-orange-500 text-white border-orange-500' },
                  ]}
                />
              </div>
            )}

            {/* Reserva picker (solo ingreso alquiler) */}
            {isIngAlquiler && (
              <div>
                <Label>Vincular reserva</Label>
                <select
                  value={form._reservaId}
                  onChange={e => handleReserva(e.target.value)}
                  className={ic}
                >
                  <option value="">— Sin vincular —</option>
                  {reservas.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.codigo} · {r.nombre_apellido}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Categoría de gasto */}
            {isGasto && (
              <div>
                <Label required>Categoría</Label>
                <select
                  value={form.cuenta}
                  onChange={e => set('cuenta', e.target.value)}
                  required
                  className={ic}
                >
                  <option value="">Seleccionar categoría</option>
                  {GASTOS_SILVIA.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label required>Fecha</Label>
                <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} required className={ic} />
              </div>
              <div>
                <Label required>Monto ($)</Label>
                <input type="number" min={0} step="0.01" value={form.monto} onChange={e => set('monto', e.target.value)} required className={ic} placeholder="0" />
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

// ─── CAJA JULI ─────────────────────────────────────────────

const EMPTY_J = {
  seccion: 'main', tipo_main: 'ingreso',
  fecha: TODAY,
  detalle: '', recibo: '', importe: '',
  transferencia_silvia: '', devolucion: '',
  modalidad_pago: 'Efectivo', devuelto: false, comprobante: '',
}

function JuliCaja() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(EMPTY_J)
  const [saving, setSaving]   = useState(false)
  const [mes, setMes]         = useState(new Date().getMonth())
  const [anio, setAnio]       = useState(NOW_YEAR)
  const [vista, setVista]     = useState('main')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('caja_juli').select('*')
      .order('fecha', { ascending: true }).order('created_at', { ascending: true })
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

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
    e.preventDefault(); setSaving(true)
    await supabase.from('caja_juli').insert({
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

      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
        {[{ value: 'main', label: 'Caja Juli' }, { value: 'gastos', label: 'Gastos efectivo / MP' }].map(v => (
          <button key={v.value} onClick={() => setVista(v.value)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-all ${
              vista === v.value ? 'border-slate-800 text-slate-800' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <FilterRow mes={mes} anio={anio} onMes={setMes} onAnio={setAnio} onAdd={() => openModal(vista)}
        addLabel={vista === 'main' ? '+ Ingreso / Egreso' : '+ Gasto efectivo/MP'}
      />

      {vista === 'main' && (
        loading || filtered.length === 0
          ? <EmptyOrLoading loading={loading} />
          : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full" style={{ minWidth: 580 }}>
                <thead>
                  <tr className="bg-slate-800 text-slate-200">
                    <Th>Fecha</Th>
                    <Th>Detalle / Nº Op.</Th>
                    <Th>Recibo</Th>
                    <Th right cls="text-green-300">Ingreso</Th>
                    <Th right cls="text-red-300">Egreso</Th>
                    <Th right cls="bg-slate-900 text-slate-100">Total en caja</Th>
                    <Th cls="text-center">Comp.</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const esIng = r.tipo_main === 'ingreso'
                    return (
                      <tr key={r.id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-slate-50`}>
                        <Td>{fmtD(r.fecha)}</Td>
                        <Td cls="max-w-[180px] truncate text-gray-700" title={r.detalle}>{r.detalle || '—'}</Td>
                        <Td cls="text-gray-500">{r.recibo || '—'}</Td>
                        <Td right cls={esIng ? 'text-green-700 font-semibold' : 'text-gray-200'}>{esIng ? pesos(r.importe) : ''}</Td>
                        <Td right cls={!esIng ? 'text-red-600 font-semibold' : 'text-gray-200'}>{!esIng ? pesos(r.importe) : ''}</Td>
                        <Td right cls="font-semibold text-slate-800 bg-slate-50 border-l border-slate-200">{pesos(r._total)}</Td>
                        <Td cls="text-center">
                          {r.comprobante ? <a href={getPublicUrl(r.comprobante)} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:underline text-xs font-medium">Ver</a> : <span className="text-gray-300 text-xs">—</span>}
                        </Td>
                        <Td><button onClick={() => del(r.id)} className="text-gray-300 hover:text-red-500 text-xs">✕</button></Td>
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
            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full" style={{ minWidth: 840 }}>
                <thead>
                  <tr className="bg-slate-800 text-slate-200">
                    <Th>Fecha</Th>
                    <Th>Detalle / Nº Op.</Th>
                    <Th>Recibo</Th>
                    <Th right cls="text-orange-300">Transf. Silvia</Th>
                    <Th right cls="text-red-300">Importe</Th>
                    <Th right cls="text-green-300">Devolución</Th>
                    <Th right cls="bg-slate-900 text-slate-100">Total en caja</Th>
                    <Th>Modalidad</Th>
                    <Th>Estado</Th>
                    <Th cls="text-center">Comp.</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-slate-50`}>
                      <Td>{fmtD(r.fecha)}</Td>
                      <Td cls="max-w-[140px] truncate text-gray-700" title={r.detalle}>{r.detalle || '—'}</Td>
                      <Td cls="text-gray-500">{r.recibo || '—'}</Td>
                      <Td right cls={num(r.transferencia_silvia) > 0 ? 'text-orange-600 font-semibold' : 'text-gray-200'}>{num(r.transferencia_silvia) > 0 ? pesos(r.transferencia_silvia) : ''}</Td>
                      <Td right cls="text-red-600 font-semibold">{pesos(r.importe)}</Td>
                      <Td right cls={num(r.devolucion) > 0 ? 'text-green-700 font-semibold' : 'text-gray-200'}>{num(r.devolucion) > 0 ? pesos(r.devolucion) : ''}</Td>
                      <Td right cls="font-semibold text-slate-800 bg-slate-50 border-l border-slate-200">{pesos(r._total)}</Td>
                      <Td>
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${r.modalidad_pago === 'Mercado Pago' ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                          {r.modalidad_pago || '—'}
                        </span>
                      </Td>
                      <Td>
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${r.devuelto ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          {r.devuelto ? 'Devuelto' : 'Pendiente'}
                        </span>
                      </Td>
                      <Td cls="text-center">
                        {r.comprobante ? <a href={getPublicUrl(r.comprobante)} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:underline text-xs font-medium">Ver</a> : <span className="text-gray-300 text-xs">—</span>}
                      </Td>
                      <Td><button onClick={() => del(r.id)} className="text-gray-300 hover:text-red-500 text-xs">✕</button></Td>
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
                  onChange={v => set('tipo_main', v)}
                  options={[
                    { v: 'ingreso', l: 'Ingreso', active: 'bg-green-600 text-white border-green-600' },
                    { v: 'egreso',  l: 'Egreso',  active: 'bg-red-500 text-white border-red-500'   },
                  ]}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label required>Fecha</Label>
                <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} required className={ic} />
              </div>
              <div>
                <Label required>Importe ($)</Label>
                <input type="number" min={0} step="0.01" value={form.importe} onChange={e => set('importe', e.target.value)} required className={ic} placeholder="0" />
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
            {form.seccion === 'gastos' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Transf. a Silvia ($)</Label>
                    <input type="number" min={0} step="0.01" value={form.transferencia_silvia} onChange={e => set('transferencia_silvia', e.target.value)} className={ic} placeholder="0" />
                  </div>
                  <div>
                    <Label>Devolución ($)</Label>
                    <input type="number" min={0} step="0.01" value={form.devolucion} onChange={e => set('devolucion', e.target.value)} className={ic} placeholder="0" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <Label>Modalidad de pago</Label>
                    <select value={form.modalidad_pago} onChange={e => set('modalidad_pago', e.target.value)} className={ic}>
                      <option>Efectivo</option>
                      <option>Mercado Pago</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none pb-1">
                    <input type="checkbox" checked={form.devuelto} onChange={e => set('devuelto', e.target.checked)} className="w-4 h-4 rounded accent-green-600" />
                    <span className="text-sm text-gray-700 font-medium">Devuelto</span>
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

// ─── CAJA TRANSFER (Banco / Mercado Pago) ──────────────────

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
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(emptyTransfer())
  const [saving, setSaving]   = useState(false)
  const [mes, setMes]         = useState(new Date().getMonth())
  const [anio, setAnio]       = useState(NOW_YEAR)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from(tabla).select('*')
      .order('fecha', { ascending: true })
      .order('created_at', { ascending: true })
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [tabla])

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
    e.preventDefault(); setSaving(true)
    await supabase.from(tabla).insert({
      fecha:          form.fecha,
      detalle:        form.detalle        || null,
      reserva_codigo: form.reserva_codigo || null,
      reserva_nombre: form.reserva_nombre || null,
      ingreso:        form.tipo === 'ingreso' ? num(form.monto) : 0,
      egreso:         form.tipo === 'egreso'  ? num(form.monto) : 0,
      comprobante:    form.comprobante    || null,
    })
    setSaving(false); closeModal(); load()
  }

  const del = async id => {
    if (!confirm('¿Eliminar este movimiento?')) return
    await supabase.from(tabla).delete().eq('id', id); load()
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
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full" style={{ minWidth: 680 }}>
              <thead>
                <tr className="bg-slate-800 text-slate-200">
                  <Th>Fecha</Th>
                  <Th>Detalle</Th>
                  <Th>Reserva</Th>
                  <Th right cls="text-green-300">Ingreso</Th>
                  <Th right cls="text-red-300">Egreso</Th>
                  <Th right cls="bg-slate-900 text-slate-100">Total</Th>
                  <Th cls="text-center">Comp.</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-slate-50`}>
                    <Td>{fmtD(r.fecha)}</Td>
                    <Td cls="max-w-[200px] truncate text-gray-700" title={r.detalle}>{r.detalle || '—'}</Td>
                    <Td cls="text-gray-500 font-mono text-xs">{r.reserva_codigo || '—'}</Td>
                    <Td right cls={num(r.ingreso) > 0 ? 'text-green-700 font-semibold' : 'text-gray-200'}>{num(r.ingreso) > 0 ? pesos(r.ingreso) : ''}</Td>
                    <Td right cls={num(r.egreso)  > 0 ? 'text-red-600  font-semibold' : 'text-gray-200'}>{num(r.egreso)  > 0 ? pesos(r.egreso)  : ''}</Td>
                    <Td right cls="font-semibold text-slate-800 bg-slate-50 border-l border-slate-200">{pesos(r._total)}</Td>
                    <Td cls="text-center">
                      {r.comprobante
                        ? <a href={getPublicUrl(r.comprobante)} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:underline text-xs font-medium">Ver</a>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </Td>
                    <Td><button onClick={() => del(r.id)} className="text-gray-300 hover:text-red-500 text-xs">✕</button></Td>
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
                  { v: 'ingreso', l: 'Ingreso', active: 'bg-green-600 text-white border-green-600' },
                  { v: 'egreso',  l: 'Egreso',  active: 'bg-red-500 text-white border-red-500'   },
                ]}
              />
            </div>

            <div>
              <Label>Vincular reserva (opcional)</Label>
              <select
                value={form._reservaId}
                onChange={e => handleReserva(e.target.value)}
                className={ic}
              >
                <option value="">— Sin vincular —</option>
                {reservas.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.codigo} · {r.nombre_apellido}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label required>Fecha</Label>
                <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} required className={ic} />
              </div>
              <div>
                <Label required>Monto ($)</Label>
                <input type="number" min={0} step="0.01" value={form.monto} onChange={e => set('monto', e.target.value)} required className={ic} placeholder="0" />
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

// ─── MAIN ──────────────────────────────────────────────────

const TABS = [
  { v: 'silvia', l: 'Caja Silvia' },
  { v: 'juli',   l: 'Caja Juli'   },
  { v: 'banco',  l: 'Banco'       },
  { v: 'mp',     l: 'Mercado Pago'},
]

export default function Caja() {
  const [tab, setTab]         = useState('silvia')
  const [reservas, setReservas] = useState([])

  useEffect(() => {
    supabase
      .from('reservas')
      .select('id, codigo, nombre_apellido, monto_total, sena1_monto, sena2_monto, pago_cabana_monto, estado')
      .neq('estado', 'Cancelada')
      .order('codigo', { ascending: false })
      .then(({ data }) => setReservas(data || []))
  }, [])

  return (
    <div>
      <div className="border-b border-gray-200 mb-6">
        <div className="flex items-end justify-between">
          <div className="pb-3">
            <h2 className="text-2xl font-bold text-gray-900">Caja</h2>
            <p className="text-sm text-gray-400 mt-0.5">Registro de movimientos y totales</p>
          </div>
          <div className="flex flex-wrap">
            {TABS.map(t => (
              <button
                key={t.v}
                onClick={() => setTab(t.v)}
                className={`px-6 py-3 text-sm font-semibold border-b-2 -mb-px transition-all ${
                  tab === t.v
                    ? 'border-slate-800 text-slate-800'
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
                }`}
              >
                {t.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'silvia' && <SilviaCaja reservas={reservas} />}
      {tab === 'juli'   && <JuliCaja />}
      {tab === 'banco'  && <CajaTransfer tabla="caja_banco"        titulo="Banco"         reservas={reservas} />}
      {tab === 'mp'     && <CajaTransfer tabla="caja_mercado_pago" titulo="Mercado Pago"  reservas={reservas} />}
    </div>
  )
}

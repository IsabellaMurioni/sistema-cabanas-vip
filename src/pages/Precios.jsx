import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO, isWithinInterval, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'

const PAX_LIST = [2, 3, 4, 5, 6, 7]

function fmtFecha(d) {
  if (!d) return 'en adelante'
  return format(parseISO(d), 'dd/MM/yyyy', { locale: es })
}

function money(v) {
  if (!v && v !== 0) return '$0'
  return `$${Number(v).toLocaleString('es-AR')}`
}

function isPeriodoActivo(p) {
  const hoy = startOfDay(new Date())
  const inicio = startOfDay(parseISO(p.fecha_inicio))
  if (!p.fecha_fin) return hoy >= inicio
  const fin = startOfDay(parseISO(p.fecha_fin))
  return isWithinInterval(hoy, { start: inicio, end: fin })
}

const EMPTY_PERIODO = {
  nombre: '',
  fecha_inicio: '',
  fecha_fin: '',
  minimo_noches: 1,
}

function PaxIcon({ count }) {
  return (
    <span className="inline-flex items-center gap-1">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-[#888]">
        <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z"/>
      </svg>
      <span className="text-xs text-[#888] font-semibold">{count}</span>
    </span>
  )
}

export default function Precios() {
  const [periodos, setPeriodos]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [expanded, setExpanded]     = useState({})
  const [editing, setEditing]       = useState({})
  const [saving, setSaving]         = useState(null)
  const [showNew, setShowNew]       = useState(false)
  const [newForm, setNewForm]       = useState(EMPTY_PERIODO)
  const [savingNew, setSavingNew]   = useState(false)
  const [error, setError]           = useState('')
  const [editNombre, setEditNombre] = useState({})
  const [editingNombre, setEditingNombre] = useState(null)

  const fetchAll = async () => {
    setLoading(true)
    const { data: pds } = await supabase
      .from('periodos_precios')
      .select('*')
      .order('orden')

    const { data: precios } = await supabase
      .from('precios_pax')
      .select('*')

    const enriched = (pds || []).map((p) => ({
      ...p,
      precios: (precios || []).filter((x) => x.periodo_id === p.id),
    }))
    setPeriodos(enriched)
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const toggleExpand = (id) =>
    setExpanded((e) => ({ ...e, [id]: !e[id] }))

  const startEdit = (periodo) => {
    const map = {}
    PAX_LIST.forEach((pax) => {
      const row = periodo.precios.find((r) => r.pax === pax) || {}
      map[pax] = {
        noche:  String(row.precio_noche  ?? 0),
        semana: String(row.precio_semana ?? 0),
        rowId:  row.id,
      }
    })
    setEditing((e) => ({ ...e, [periodo.id]: map }))
    setExpanded((e) => ({ ...e, [periodo.id]: true }))
  }

  const cancelEdit = (id) =>
    setEditing((e) => { const n = { ...e }; delete n[id]; return n })

  const handlePriceChange = (periodoId, pax, field, value) => {
    setEditing((e) => ({
      ...e,
      [periodoId]: {
        ...e[periodoId],
        [pax]: { ...e[periodoId][pax], [field]: value },
      },
    }))
  }

  const saveEdit = async (periodo) => {
    const map = editing[periodo.id]
    if (!map) return
    setSaving(periodo.id)
    setError('')

    const ops = PAX_LIST.map((pax) => {
      const { noche, semana, rowId } = map[pax]
      if (rowId) {
        return supabase.from('precios_pax').update({
          precio_noche:  Number(noche)  || 0,
          precio_semana: Number(semana) || 0,
        }).eq('id', rowId)
      }
      return supabase.from('precios_pax').insert({
        periodo_id:    periodo.id,
        pax,
        precio_noche:  Number(noche)  || 0,
        precio_semana: Number(semana) || 0,
      })
    })

    const results = await Promise.all(ops)
    const firstErr = results.find((r) => r.error)
    if (firstErr?.error) {
      setError(firstErr.error.message)
    } else {
      cancelEdit(periodo.id)
      await fetchAll()
    }
    setSaving(null)
  }

  const saveNombre = async (id) => {
    const nombre = editNombre[id]
    if (!nombre?.trim()) return
    await supabase.from('periodos_precios').update({ nombre }).eq('id', id)
    setEditingNombre(null)
    fetchAll()
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este período y todos sus precios?')) return
    await supabase.from('periodos_precios').delete().eq('id', id)
    fetchAll()
  }

  const saveNew = async () => {
    if (!newForm.nombre || !newForm.fecha_inicio) {
      setError('Completá al menos el nombre y la fecha de inicio.')
      return
    }
    setSavingNew(true)
    setError('')

    const maxOrden = periodos.length ? Math.max(...periodos.map((p) => p.orden)) : 0

    const { data: inserted, error: err } = await supabase
      .from('periodos_precios')
      .insert({
        nombre:        newForm.nombre,
        fecha_inicio:  newForm.fecha_inicio,
        fecha_fin:     newForm.fecha_fin || null,
        minimo_noches: Number(newForm.minimo_noches) || 1,
        orden:         maxOrden + 1,
      })
      .select('id')
      .single()

    if (err) { setError(err.message); setSavingNew(false); return }

    await supabase.from('precios_pax').insert(
      PAX_LIST.map((pax) => ({
        periodo_id: inserted.id, pax,
        precio_noche: 0, precio_semana: 0,
      }))
    )

    setSavingNew(false)
    setShowNew(false)
    setNewForm(EMPTY_PERIODO)
    fetchAll()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <p className="text-[#d2ab84] text-lg font-medium">Cargando precios...</p>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto fade-in">

      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-[28px] font-bold text-[#111111]">Temporadas &amp; Precios</h1>
          <p className="text-sm text-[#888] mt-1">
            Precios por PAX y período. Al crear una reserva se calcula el total automáticamente.
          </p>
        </div>
        <button onClick={() => { setShowNew(true); setError('') }} className="btn-primary">
          + Nuevo período
        </button>
      </div>

      {error && (
        <div className="bg-[#fee2e2] border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm mb-5">
          {error}
        </div>
      )}

      {/* New period form */}
      {showNew && (
        <div className="card mb-6 animate-fade-in">
          <h3 className="text-[18px] font-semibold text-[#111111] mb-4">Nuevo período</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="col-span-2">
              <label className="section-label block mb-1.5">Nombre del período</label>
              <input
                className="field"
                placeholder="ej: Temporada Alta"
                value={newForm.nombre}
                onChange={(e) => setNewForm((f) => ({ ...f, nombre: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label className="section-label block mb-1.5">Fecha inicio</label>
              <input
                type="date"
                className="field"
                value={newForm.fecha_inicio}
                onChange={(e) => setNewForm((f) => ({ ...f, fecha_inicio: e.target.value }))}
              />
            </div>
            <div>
              <label className="section-label block mb-1.5">Fecha fin <span className="text-[#aaa] normal-case font-normal">(vacío = en adelante)</span></label>
              <input
                type="date"
                className="field"
                value={newForm.fecha_fin}
                onChange={(e) => setNewForm((f) => ({ ...f, fecha_fin: e.target.value }))}
              />
            </div>
            <div>
              <label className="section-label block mb-1.5">Mínimo de noches</label>
              <input
                type="number"
                min={1}
                className="field"
                value={newForm.minimo_noches}
                onChange={(e) => setNewForm((f) => ({ ...f, minimo_noches: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => { setShowNew(false); setNewForm(EMPTY_PERIODO); setError('') }} className="btn-secondary">
              Cancelar
            </button>
            <button onClick={saveNew} disabled={savingNew} className="btn-primary">
              {savingNew ? 'Guardando...' : 'Crear período'}
            </button>
          </div>
        </div>
      )}

      {/* Period cards */}
      <div className="space-y-4">
        {periodos.map((periodo) => {
          const activo    = isPeriodoActivo(periodo)
          const isExpanded = expanded[periodo.id]
          const isEditing  = Boolean(editing[periodo.id])

          return (
            <div
              key={periodo.id}
              className="bg-[#fee7ef] rounded-[16px] border transition-all"
              style={{
                borderColor: activo ? '#d2ab84' : '#f0e6d8',
                borderLeftWidth: activo ? 4 : 1,
              }}
            >
              {/* Card header */}
              <div
                className="flex items-center justify-between px-6 py-4 cursor-pointer select-none"
                onClick={() => !isEditing && toggleExpand(periodo.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {activo && (
                    <span className="flex-shrink-0 bg-[#d1fae5] text-[#065f46] text-xs font-semibold px-2.5 py-1 rounded-[8px]">
                      ACTIVO
                    </span>
                  )}
                  <div>
                    {editingNombre === periodo.id ? (
                      <input
                        className="field font-semibold text-[#111111] min-w-[280px]"
                        value={editNombre[periodo.id] ?? periodo.nombre}
                        onChange={(e) => setEditNombre((n) => ({ ...n, [periodo.id]: e.target.value }))}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveNombre(periodo.id)
                          if (e.key === 'Escape') setEditingNombre(null)
                        }}
                        autoFocus
                      />
                    ) : (
                      <span className="text-[18px] font-semibold text-[#111111]">
                        {periodo.nombre}
                      </span>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-[#888]">
                        {fmtFecha(periodo.fecha_inicio)} → {fmtFecha(periodo.fecha_fin)}
                      </span>
                      <span className="inline-flex items-center gap-1 bg-[#d2ab84] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        mín. {periodo.minimo_noches} {periodo.minimo_noches === 1 ? 'noche' : 'noches'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  {editingNombre !== periodo.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingNombre(periodo.id)
                        setEditNombre((n) => ({ ...n, [periodo.id]: periodo.nombre }))
                      }}
                      className="text-xs text-[#888] hover:text-[#333] px-2 py-1 rounded-[8px] transition-colors"
                    >
                      Renombrar
                    </button>
                  )}
                  {editingNombre === periodo.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); saveNombre(periodo.id) }}
                      className="btn-primary text-xs px-3 py-1.5"
                    >
                      OK
                    </button>
                  )}
                  {!isEditing ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(periodo) }}
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      Editar precios
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); saveEdit(periodo) }}
                        disabled={saving === periodo.id}
                        className="btn-primary text-xs px-3 py-1.5"
                      >
                        {saving === periodo.id ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); cancelEdit(periodo.id) }}
                        className="btn-secondary text-xs px-3 py-1.5"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(periodo.id) }}
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded transition-colors"
                  >
                    ✕
                  </button>
                  <span className="text-[#888] text-sm ml-1">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {/* Expandable price table */}
              {(isExpanded || isEditing) && (
                <div className="px-6 pb-6">
                  <div style={{ borderTop: '1px solid #f0e6d8' }} className="pt-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: '1px solid #f0e6d8' }}>
                          <th className="text-left pb-2 section-label w-32">PAX</th>
                          <th className="text-right pb-2 section-label">Por noche</th>
                          <th className="text-right pb-2 section-label">Por semana</th>
                        </tr>
                      </thead>
                      <tbody>
                        {PAX_LIST.map((pax) => {
                          const row  = periodo.precios.find((r) => r.pax === pax) || {}
                          const eRow = editing[periodo.id]?.[pax]

                          return (
                            <tr key={pax} style={{ borderBottom: '1px solid #f0e6d8' }} className="last:border-0">
                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  <PaxIcon count={pax} />
                                  <span className="font-semibold text-[#333]">{pax} PAX</span>
                                </div>
                              </td>
                              <td className="py-3 text-right">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min={0}
                                    value={eRow?.noche ?? ''}
                                    onChange={(e) => handlePriceChange(periodo.id, pax, 'noche', e.target.value)}
                                    className="field w-32 text-right"
                                    placeholder="0"
                                  />
                                ) : (
                                  <span className={`font-semibold ${Number(row.precio_noche) > 0 ? 'text-[#111111]' : 'text-[#ccc]'}`}>
                                    {money(row.precio_noche)}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 text-right">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min={0}
                                    value={eRow?.semana ?? ''}
                                    onChange={(e) => handlePriceChange(periodo.id, pax, 'semana', e.target.value)}
                                    className="field w-32 text-right"
                                    placeholder="0"
                                  />
                                ) : (
                                  <span className={`font-semibold ${Number(row.precio_semana) > 0 ? 'text-[#d2ab84]' : 'text-[#ccc]'}`}>
                                    {money(row.precio_semana)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {periodos.length === 0 && !showNew && (
          <div className="text-center py-20">
            <p className="text-[#888] text-lg font-medium">No hay períodos configurados.</p>
            <p className="text-[#aaa] text-sm mt-2">Hacé clic en "+ Nuevo período" para agregar el primero.</p>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

function fmt(d) {
  if (!d) return '-'
  return format(parseISO(d), 'dd/MM/yyyy', { locale: es })
}

function money(v) {
  if (v === null || v === undefined || v === '') return '-'
  return `$${Number(v).toLocaleString('es-AR')}`
}

const ic = 'border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

const EMPTY_NEW = { nombre: '', fecha_inicio: '', fecha_fin: '', precio_noche: '' }

export default function Precios() {
  const [precios, setPrecios]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [editingId, setEditingId]   = useState(null)
  const [editForm, setEditForm]     = useState({})
  const [showNew, setShowNew]       = useState(false)
  const [newForm, setNewForm]       = useState(EMPTY_NEW)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const fetchPrecios = async () => {
    setLoading(true)
    const { data } = await supabase.from('precios').select('*').order('fecha_inicio')
    setPrecios(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchPrecios() }, [])

  const startEdit = (p) => {
    setEditingId(p.id)
    setEditForm({ nombre: p.nombre, fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin, precio_noche: String(p.precio_noche) })
    setError('')
  }

  const cancelEdit = () => { setEditingId(null); setEditForm({}); setError('') }

  const saveEdit = async () => {
    if (!editForm.nombre || !editForm.fecha_inicio || !editForm.fecha_fin || !editForm.precio_noche) {
      setError('Completá todos los campos del período.')
      return
    }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('precios').update({
      nombre:       editForm.nombre,
      fecha_inicio: editForm.fecha_inicio,
      fecha_fin:    editForm.fecha_fin,
      precio_noche: Number(editForm.precio_noche),
    }).eq('id', editingId)
    setSaving(false)
    if (err) { setError(err.message); return }
    setEditingId(null)
    fetchPrecios()
  }

  const saveNew = async () => {
    if (!newForm.nombre || !newForm.fecha_inicio || !newForm.fecha_fin || !newForm.precio_noche) {
      setError('Completá todos los campos del período.')
      return
    }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('precios').insert({
      nombre:       newForm.nombre,
      fecha_inicio: newForm.fecha_inicio,
      fecha_fin:    newForm.fecha_fin,
      precio_noche: Number(newForm.precio_noche),
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowNew(false)
    setNewForm(EMPTY_NEW)
    fetchPrecios()
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este período de precios?')) return
    await supabase.from('precios').delete().eq('id', id)
    fetchPrecios()
  }

  if (loading) return <p className="text-gray-500 text-center py-16">Cargando...</p>

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Precios</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Al crear una reserva, el monto se calcula con el precio del período que coincide con la fecha de entrada.
          </p>
        </div>
        <button
          onClick={() => { setShowNew(true); setError('') }}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Nuevo período
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500 text-xs uppercase tracking-wide bg-gray-50">
              <th className="px-5 py-3 font-medium">Período</th>
              <th className="px-5 py-3 font-medium">Desde</th>
              <th className="px-5 py-3 font-medium">Hasta</th>
              <th className="px-5 py-3 font-medium">Precio / noche</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {precios.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                {editingId === p.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input
                        className={ic}
                        value={editForm.nombre}
                        onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                        placeholder="Nombre del período"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="date"
                        className={ic}
                        value={editForm.fecha_inicio}
                        onChange={e => setEditForm(f => ({ ...f, fecha_inicio: e.target.value }))}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="date"
                        className={ic}
                        value={editForm.fecha_fin}
                        onChange={e => setEditForm(f => ({ ...f, fecha_fin: e.target.value }))}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        className={`${ic} w-36`}
                        value={editForm.precio_noche}
                        onChange={e => setEditForm(f => ({ ...f, precio_noche: e.target.value }))}
                        placeholder="0"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className="text-xs bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 transition-colors"
                        >
                          {saving ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-xs border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-5 py-3 font-medium text-gray-800">{p.nombre}</td>
                    <td className="px-5 py-3 text-gray-600">{fmt(p.fecha_inicio)}</td>
                    <td className="px-5 py-3 text-gray-600">{fmt(p.fecha_fin)}</td>
                    <td className="px-5 py-3 font-semibold text-gray-800">{money(p.precio_noche)}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-3">
                        <button
                          onClick={() => startEdit(p)}
                          className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}

            {showNew && (
              <tr className="border-b last:border-0 bg-blue-50">
                <td className="px-4 py-2">
                  <input
                    className={ic}
                    placeholder="Nombre del período"
                    value={newForm.nombre}
                    onChange={e => setNewForm(f => ({ ...f, nombre: e.target.value }))}
                    autoFocus
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="date"
                    className={ic}
                    value={newForm.fecha_inicio}
                    onChange={e => setNewForm(f => ({ ...f, fecha_inicio: e.target.value }))}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="date"
                    className={ic}
                    value={newForm.fecha_fin}
                    onChange={e => setNewForm(f => ({ ...f, fecha_fin: e.target.value }))}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={0}
                    className={`${ic} w-36`}
                    placeholder="0"
                    value={newForm.precio_noche}
                    onChange={e => setNewForm(f => ({ ...f, precio_noche: e.target.value }))}
                  />
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <button
                      onClick={saveNew}
                      disabled={saving}
                      className="text-xs bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 transition-colors"
                    >
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      onClick={() => { setShowNew(false); setNewForm(EMPTY_NEW); setError('') }}
                      className="text-xs border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {precios.length === 0 && !showNew && (
          <p className="text-gray-400 text-center py-12 text-sm">
            No hay períodos configurados. Hacé clic en &ldquo;+ Nuevo período&rdquo; para agregar el primero.
          </p>
        )}
      </div>
    </div>
  )
}

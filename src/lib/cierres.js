// Ayuda compartida para el candado de "Cerrar caja": una vez cerrado, un
// cierre bloquea para siempre el rango [fecha_desde, fecha_hasta] que
// cubre — usado tanto por CajaTemporada.jsx (que ya tiene los cierres
// cargados en memoria) como por ReservaForm.jsx/ReservaPago.jsx (que sólo
// necesitan chequear una fecha puntual antes de escribir en
// movimientos_caja, sin tener la lista de cierres precargada).

// Comparación de rangos de fecha ISO (YYYY-MM-DD) — comparables
// directamente como string porque son lexicográficamente ordenables.
export function rangosSolapan(aDesde, aHasta, bDesde, bHasta) {
  return aDesde <= bHasta && aHasta >= bDesde
}

// Devuelve el primer cierre (de una lista ya cargada) cuyo rango
// contiene la fecha dada, o null si ninguno la cubre.
export function cierreQueContiene(cierres, fecha) {
  if (!fecha) return null
  return cierres.find((c) => fecha >= c.fecha_desde && fecha <= c.fecha_hasta) || null
}

// Etiqueta legible de un cierre: su nombre si tiene uno cargado: si no,
// el rango de fechas como fallback.
export function labelCierre(cierre) {
  if (!cierre) return ''
  return cierre.nombre || `${cierre.fecha_desde} – ${cierre.fecha_hasta}`
}

// Chequeo puntual contra la base — para ReservaForm.jsx/ReservaPago.jsx,
// que no tienen los cierres precargados. Devuelve { cierre, error }
// siguiendo la misma convención que el resto de las funciones de este
// proyecto que hablan con supabase.
export async function fechaEstaCerrada(supabase, complejoId, fecha) {
  if (!fecha) return { cierre: null, error: null }
  const { data, error } = await supabase
    .from('cierres_caja')
    .select('id, nombre, fecha_desde, fecha_hasta')
    .eq('complejo_id', complejoId)
    .lte('fecha_desde', fecha)
    .gte('fecha_hasta', fecha)
    .limit(1)
  if (error) return { cierre: null, error }
  return { cierre: data && data.length > 0 ? data[0] : null, error: null }
}

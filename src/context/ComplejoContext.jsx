import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ComplejoContext = createContext(null)

// Este archivo ya exportaba el hook useComplejo además del componente
// ComplejoProvider (pre-existente, no de este cambio); ahora también
// exporta shadeColor para que los tests unitarios (tests/unit/) puedan
// ejercitar la lógica real en vez de reimplementarla. Ambos casos
// rompen el supuesto de Fast Refresh de "un archivo de componente sólo
// exporta componentes" — sin impacto en runtime/producción, sólo hace
// que Vite recargue toda la página en vez de hacer hot-swap al editar
// este archivo en desarrollo.
/* eslint-disable react-refresh/only-export-components */

export function shadeColor(hex, percent) {
  const f = parseInt(hex.replace('#',''), 16)
  const t = percent < 0 ? 0 : 255
  const p = Math.abs(percent)
  const R = (f >> 16) & 0xFF, G = (f >> 8) & 0xFF, B = f & 0xFF
  const newR = Math.round((t - R) * p) + R
  const newG = Math.round((t - G) * p) + G
  const newB = Math.round((t - B) * p) + B
  return '#' + (0x1000000 + newR * 0x10000 + newG * 0x100 + newB).toString(16).slice(1).toUpperCase()
}

// Color de una cabaña por nombre, dada la lista de cabañas del
// complejo activo — antes vivía como closure sobre `cabanasActivo`
// (estado de React); ahora toma esos datos como parámetro explícito.
export function resolverColorCabana(cabanasActivo, nombreCabana) {
  const c = cabanasActivo.find((cab) => cab.nombre === nombreCabana)
  return c?.color || '#64748b'
}

// Colores de hover derivados del primario de un complejo. Cabañas VIP
// usa 3 valores literales hardcodeados de siempre (no shadeColor,
// para no cambiar ni un pixel de su apariencia histórica); cualquier
// otro complejo deriva los 3 a partir de su propio color primario.
export function resolverColoresHover(slug, primario) {
  if (!slug || slug === 'cabanas-vip') {
    return { hover: '#c49870', filaHover: '#fff4e8', botonHover: '#ffe0c0' }
  }
  return {
    hover: shadeColor(primario, -0.12),
    filaHover: shadeColor(primario, 0.85),
    botonHover: shadeColor(primario, 0.60),
  }
}

// Fase 6 — roles restringidos dentro de un complejo (ver
// 021_membresias_rol.sql / 024_membresias_rol_limitado_reservas.sql).
// El rol vive por FILA de membresias (un mismo usuario puede ser
// 'completo' en un complejo y algo restringido en otro), así que hace
// falta el id del complejo activo para saber cuál mirar. 'completo' de
// fallback si no se encuentra membresía — no debería pasar en la
// práctica (complejoActivo sólo se setea a partir de un complejo con
// membresía real), pero mantiene el comportamiento previo a este
// cambio (todo usuario ya existente es 'completo') si algo llega a
// fallar.
export function rolParaComplejo(membresias, complejoId) {
  const m = (membresias || []).find((m) => m.complejo_id === complejoId)
  return m?.rol || 'completo'
}

export function esRolLimitado(rol) {
  return rol === 'limitado_caja_silvia' || rol === 'limitado_reservas'
}

// Qué secciones del sidebar oculta cada rol restringido — mapa
// explícito POR ROL (no un único set genérico), porque cada uno oculta
// un conjunto distinto: 'limitado_caja_silvia' mantiene Caja (sólo
// queda tab-restringida por dentro, ver tabsCajaVipVisibles en
// Caja.jsx); 'limitado_reservas' la oculta del todo, en los 5
// complejos por igual (no está atado a uno puntual). Precios tiene
// acceso completo (ver/crear/editar/borrar) para los dos roles
// restringidos desde 025_precios_acceso_roles_limitados.sql — por eso
// no aparece en ninguno de los dos sets. Única fuente de verdad para
// Layout.jsx (nav) Y RequiereSeccion.jsx (guard de ruta) — ambos la
// consultan vía navItemsVisibles/seccionVisible, así que nunca pueden
// desincronizarse sobre qué ve cada rol.
const SECCIONES_OCULTAS_POR_ROL = {
  limitado_caja_silvia: new Set(['Ganancias']),
  limitado_reservas:    new Set(['Ganancias', 'Caja']),
}

export function seccionVisible(seccion, rol) {
  const ocultas = SECCIONES_OCULTAS_POR_ROL[rol]
  return !ocultas || !ocultas.has(seccion)
}

export function navItemsVisibles(items, rol) {
  const ocultas = SECCIONES_OCULTAS_POR_ROL[rol]
  if (!ocultas) return items
  return items.filter((item) => !ocultas.has(item.label))
}

export function ComplejoProvider({ children }) {
  const { session } = useAuth()
  const [todosLosComplejos, setTodosLosComplejos] = useState([])
  const [complejosConAcceso, setComplejosConAcceso] = useState([])
  const [membresiasUsuario, setMembresiasUsuario] = useState([]) // [{ complejo_id, rol }]
  const [complejoActivo, setComplejoActivo] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [cabanasActivo, setCabanasActivo] = useState([])

  useEffect(() => {
    if (!session) return

    let cancelado = false
    setCargando(true)

    Promise.all([
      supabase.from('complejos').select('*'),
      supabase.from('membresias').select('complejo_id, rol').eq('user_id', session.user.id),
    ]).then(([complejosRes, membresiasRes]) => {
      if (cancelado) return

      const complejos = complejosRes.data || []
      const membresias = membresiasRes.data || []
      const idsConAcceso = membresias.map((m) => m.complejo_id)

      setTodosLosComplejos(complejos)
      setComplejosConAcceso(idsConAcceso)
      setMembresiasUsuario(membresias)
      setComplejoActivo((actual) => {
        if (actual && idsConAcceso.includes(actual.id)) {
          return complejos.find((c) => c.id === actual.id) || actual
        }
        return complejos.find((c) => c.id === idsConAcceso[0]) || null
      })
      setCargando(false)
    })

    return () => {
      cancelado = true
    }
  }, [session?.user?.id])

  const cambiarComplejo = (complejoId) => {
    if (!complejosConAcceso.includes(complejoId)) return
    const complejo = todosLosComplejos.find((c) => c.id === complejoId)
    if (complejo) setComplejoActivo(complejo)
  }

  useEffect(() => {
    if (!complejoActivo) {
      setCabanasActivo([])
      return
    }

    let cancelado = false

    supabase
      .from('cabanas')
      .select('*')
      .eq('complejo_id', complejoActivo.id)
      .order('orden')
      .then(({ data }) => {
        if (cancelado) return
        setCabanasActivo(data || [])
      })

    return () => {
      cancelado = true
    }
  }, [complejoActivo?.id])

  const rolActivo = rolParaComplejo(membresiasUsuario, complejoActivo?.id)

  const cabanasNombres = cabanasActivo.map((c) => c.nombre)
  const getCabanaColor = (nombreCabana) => resolverColorCabana(cabanasActivo, nombreCabana)

  const cabanasPorGrupo = (() => {
    const secciones = []
    cabanasActivo.forEach((c) => {
      const grupo = c.grupo || null
      const ultima = secciones[secciones.length - 1]
      if (ultima && ultima.grupo === grupo) {
        ultima.cabanas.push(c.nombre)
      } else {
        secciones.push({ grupo, cabanas: [c.nombre] })
      }
    })
    return secciones
  })()

  useEffect(() => {
    document.documentElement.style.setProperty('--color-primario', complejoActivo?.color_primario || '#d2ab84')
    document.documentElement.style.setProperty('--color-secundario', complejoActivo?.color_secundario || '#fee7ef')

    const root = document.documentElement
    const primario = complejoActivo?.color_primario || '#d2ab84'
    const { hover, filaHover, botonHover } = resolverColoresHover(complejoActivo?.slug, primario)
    root.style.setProperty('--color-primario-hover', hover)
    root.style.setProperty('--color-fila-hover', filaHover)
    root.style.setProperty('--color-boton-secundario-hover', botonHover)
  }, [complejoActivo])

  return (
    <ComplejoContext.Provider
      value={{
        todosLosComplejos, complejosConAcceso, complejoActivo, cambiarComplejo, cargando,
        cabanasActivo, cabanasNombres, getCabanaColor, cabanasPorGrupo, rolActivo,
      }}
    >
      {children}
    </ComplejoContext.Provider>
  )
}

export const useComplejo = () => useContext(ComplejoContext)

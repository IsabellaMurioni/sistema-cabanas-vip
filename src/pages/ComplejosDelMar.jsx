import { useEffect, useLayoutEffect, useMemo, useRef, useState, Fragment } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useComplejo } from '../context/ComplejoContext'
import { CalendarPicker } from '../components/DateRangePicker'
import {
  DayHeaders, MonthBoundaryLines, ReservaPopup,
  agruparDiasPorMes, reservaIncluyeCabana, partirNombreCabana,
  ANCHO_COLUMNA_NOMBRE_MOBILE,
} from './Disponibilidad'
import { addDays, addMonths, differenceInDays, getDay, isSameDay, format, parseISO } from 'date-fns'

// "Complejos del mar" — vista unificada de disponibilidad con las
// cabañas de TODOS los complejos a los que el usuario tiene acceso, en
// una sola grilla. Ruta de nivel superior (`/complejos-del-mar`, ver
// App.jsx), FUERA del árbol `/:complejoSlug/*` — mismo precedente que
// `/login` y `/` (RedirectAComplejoDefault): chrome propio y mínimo,
// no se monta dentro de Layout.jsx.
//
// Un solo fetch POR TIPO de dato (`cabanas`/`reservas`), con
// `.in('complejo_id', complejosConAcceso)` — nunca un fetch por
// complejo. Un fetch-por-complejo reintroduciría la misma clase de bug
// que el commit dc7e4fc (21/09, "aislamiento entre complejos") ya tuvo
// que arreglar en 7 archivos: ahí el problema era una carrera
// transitoria (complejoActivo pasando por un default antes de que
// Layout.jsx lo corrija); acá sería peor — N requests LEGÍTIMAMENTE
// concurrentes (uno por complejo) que pueden resolver en cualquier
// orden, listas para pisarse entre sí si cada una tuviera su propio
// setState. Agrupando del lado del cliente por el `complejo_id` que
// ya viene en cada fila, con un solo setState por tipo de dato, esa
// clase de bug no puede pasar: no hay N respuestas independientes que
// puedan llegar en desorden, hay una sola.
//
// RLS ya alcanza sin ningún cambio: las policies de `cabanas`/
// `reservas` filtran por `complejo_id in (select complejo_id from
// membresias where user_id = auth.uid())` — no importa si la query
// pide un complejo o varios con `.in(...)`, el resultado ya viene
// scopeado server-side a los que el usuario puede ver.
export function agruparPorComplejo(cabanas, reservas) {
  const cabanasPorComplejo = {}
  for (const c of cabanas) {
    if (!cabanasPorComplejo[c.complejo_id]) cabanasPorComplejo[c.complejo_id] = []
    cabanasPorComplejo[c.complejo_id].push(c)
  }
  const reservasPorComplejo = {}
  for (const r of reservas) {
    if (!reservasPorComplejo[r.complejo_id]) reservasPorComplejo[r.complejo_id] = []
    reservasPorComplejo[r.complejo_id].push(r)
  }
  return { cabanasPorComplejo, reservasPorComplejo }
}

// Mismo criterio de agrupamiento contiguo que `cabanasPorGrupo` en
// ComplejoContext.jsx (un tramo nuevo cada vez que cambia `grupo`,
// nunca un Set/bucket global) — pero esa versión vive inline dentro
// de ComplejoProvider, cerrada sobre el único `cabanasActivo` del
// complejo activo global, así que no es reusable tal cual para un
// array arbitrario de UN complejo puntual dentro del loop de abajo.
// Reimplementada acá como función pura — misma lógica, no una idea
// nueva — operando sobre filas completas (no sólo nombres), porque
// esta página necesita el resto de cada fila (id, color no se usa acá
// a propósito — ver header de la sección de color más abajo).
export function agruparCabanasPorGrupo(cabanasDelComplejo) {
  const secciones = []
  cabanasDelComplejo.forEach((c) => {
    const grupo = c.grupo || null
    const ultima = secciones[secciones.length - 1]
    if (ultima && ultima.grupo === grupo) {
      ultima.cabanas.push(c)
    } else {
      secciones.push({ grupo, cabanas: [c] })
    }
  })
  return secciones
}

// Estado por cabaña (Libre / próxima reserva / ocupada hoy) — MISMA
// lógica, línea por línea, que `cabanaStatus` en Disponibilidad.jsx
// (su propio useMemo, no exportado). La diferencia real: ahí vive
// cerrada sobre `reservas`/`cabanasActivo`, el estado del complejo
// ACTIVO global — no reusable tal cual acá, donde cada complejo
// necesita su PROPIO `reservasDelComplejo`/`cabanasDelComplejo`
// explícitos (nunca el array combinado de los 5). Reimplementada como
// función pura con esos dos como parámetros — mismo criterio que
// UnidadRow vs. TimelineRow (ver ese comentario más abajo): no se
// reusa el original tal cual porque lee estado global, se reimplementa
// la MISMA lógica tomando los datos ya scoped por complejo.
export function calcularStatusCabana(cabana, reservasDelComplejo, cabanasDelComplejo, todayISO) {
  const current = reservasDelComplejo.find(
    (r) => reservaIncluyeCabana(r, cabana.nombre, cabanasDelComplejo) && r.fecha_entrada <= todayISO && todayISO <= r.fecha_salida
  )
  const upcoming = reservasDelComplejo
    .filter((r) => reservaIncluyeCabana(r, cabana.nombre, cabanasDelComplejo) && r.fecha_entrada > todayISO)
    .sort((a, b) => a.fecha_entrada.localeCompare(b.fecha_entrada))[0]
  return { current, upcoming, occupied: Boolean(current) }
}

// DAY_W es FIJO (38px), igual en mobile y desktop — no es una
// elección de diseño, es una restricción real: `DayHeaders` (reusado
// sin cambios, ver header del archivo) tiene ese ancho de columna
// hardcodeado adentro (`DAY_W = 38` en Disponibilidad.jsx, sin prop
// para parametrizarlo) — si esta página usara un ancho distinto en
// mobile, las columnas de día de la grilla quedarían desalineadas
// contra el propio DayHeaders reusado. Mismo criterio que ya usa
// Disponibilidad.jsx: su propio DAY_W tampoco varía entre mobile y
// desktop en "Ver todas" — sólo ROW_H y el ancho de la columna de
// nombres sí.
const DAY_W = 38
// Subidos (eran 48/44) para que entren, SIN desbordar, el nombre de
// cabaña (hasta 2 líneas vía partirNombreCabana) + la línea de estado
// (dot + "Libre"/huésped/"Próx: dd-mm") debajo — ver el bloque de
// estado por cabaña más abajo. A diferencia del sidebar de "Ver por
// cabaña" en Disponibilidad.jsx (que calcula una altura DINÁMICA por
// complejo, alturaFilaSidebar/calcularAlturaFilaSidebarDesktop, no
// reusada acá), esta página mantiene UNA altura fija global para
// TODOS los complejos — a propósito: una altura por-complejo variable
// obligaría a la columna derecha (UnidadRow) a crecer exactamente lo
// mismo fila por fila para no repetir el bug de desalineación que ya
// se arregló con headerStackHeight, y nadie pidió esa complejidad acá
// — un número fijo, generoso para el peor caso (2 líneas de nombre +
// 1 de estado), es más simple y sigue siendo seguro en todos los
// casos reales.
const ROW_H_DESKTOP = 64
const ROW_H_MOBILE = 58
const NOMBRE_COL_W_DESKTOP = 200
// Mobile: reusa el mismo ancho fijo (127px) y el mismo criterio ya
// shippeado en Disponibilidad.jsx "Ver todas" (commit 418de0d,
// 01/10) — ver ANCHO_COLUMNA_NOMBRE_MOBILE ahí (importado, no
// duplicado): ceil(ancho de "Departamento", la palabra más larga
// entre los 5 complejos, + overhead + buffer), hardcodeado a
// propósito porque RLS no deja leer las cabañas de otro complejo
// para recalcularlo en vivo. No se reinventa un valor nuevo.
const BANNER_H = 32
const SUBGRUPO_H = 24
const MONTH_BAND_H = 22
const BREAKPOINT_MOBILE = 640
// Separación entre la "tarjeta" de un complejo y la del siguiente
// (rediseño "Opción C" — ver mockup elegido por Isa). Mismo valor en
// ambas columnas (nombre y grilla): un <div> espaciador de esta
// altura se agrega en las DOS, nunca sólo en una, para que no se
// desalineen fila por fila (mismo criterio que ya exige headerStackHeight).
const GAP_COMPLEJO = 14

function useEsMobile() {
  const [esMobile, setEsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < BREAKPOINT_MOBILE
  )
  useEffect(() => {
    const handler = () => setEsMobile(window.innerWidth < BREAKPOINT_MOBILE)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return esMobile
}

// Mismo corte deliberado que ya usa el sidebar desktop de "Ver por
// cabaña" en Disponibilidad.jsx (13/10) — reusa `partirNombreCabana`
// (no reimplementada) en vez de truncar con ellipsis: para "<número>
// Ambientes <resto>" siempre corta en línea 1 "<número> Ambientes" /
// línea 2 "<resto>".
//
// Para cualquier OTRO nombre (no matchea ese patrón — p.ej. "Chalet 3
// Ambientes" de Mimmo, que no empieza con el número): wrap normal
// (`whiteSpace: 'normal'`), nunca ellipsis. Verificado contra los
// nombres reales de los 5 complejos: a 127px (ANCHO_COLUMNA_NOMBRE_
// MOBILE, mobile) varios no matchean el patrón de partirNombreCabana
// Y son demasiado largos para una sola línea — con ellipsis se
// truncarían y perderían texto real; con wrap libre entran completos,
// en cuantas líneas hagan falta, sin tocar la altura de fila fija
// (ROW_H_MOBILE/DESKTOP ya tienen margen de sobra para 2 líneas).
function NombreCabana({ nombre, fontSize }) {
  const lineas = partirNombreCabana(nombre)
  if (lineas.length === 2) {
    return (
      <span style={{ fontSize, fontWeight: 600, color: '#333', lineHeight: 1.3 }}>
        <div style={{ whiteSpace: 'nowrap' }}>{lineas[0]}</div>
        <div style={{ whiteSpace: 'nowrap' }}>{lineas[1]}</div>
      </span>
    )
  }
  return (
    <span style={{
      fontSize, fontWeight: 600, color: '#333', minWidth: 0,
      whiteSpace: 'normal', lineHeight: 1.3, display: 'block',
    }}>
      {nombre}
    </span>
  )
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function todayStr() {
  return format(startOfToday(), 'yyyy-MM-dd')
}

// Banda de mes local — NO exportada por Disponibilidad.jsx (ahí vive
// como función interna `MonthHeaders`, fuera de la lista explícita de
// reuso), así que esta página tiene su propia versión. Reusa
// `agruparDiasPorMes` (sí reusada) para la lógica de agrupar días por
// mes — sólo el JSX de la banda es propio. Necesaria, no decorativa:
// `DayHeaders` y `MonthBoundaryLines` (reusados sin cambios) asumen
// `top: 22`/`top: 22` respectivamente — una banda de exactamente 22px
// (MONTH_BAND_H) tiene que existir arriba de todo, sticky en top:0,
// para que ese offset hardcodeado dentro de esos dos componentes
// siga siendo correcto.
function MonthHeaders({ startDate, numDays, dayW }) {
  const tramos = agruparDiasPorMes(startDate, numDays)
  return (
    <div style={{
      display: 'flex', width: numDays * dayW, minWidth: numDays * dayW, flexShrink: 0,
      position: 'sticky', top: 0, zIndex: 21,
    }}>
      {tramos.map((tramo, i) => (
        <div
          key={`${tramo.anio}-${tramo.mes}-${i}`}
          style={{
            width: tramo.dias * dayW, minWidth: tramo.dias * dayW, flexShrink: 0,
            height: MONTH_BAND_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRight: '1px solid #333',
            backgroundColor: '#111111',
            color: 'white',
            fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            userSelect: 'none',
          }}
        >
          {tramo.label}
        </div>
      ))}
    </div>
  )
}

// Línea vertical de "hoy" — UNA sola, continua, superpuesta sobre TODA
// la grilla (header de días + banners de complejo + sub-grupos +
// filas), igual que MonthBoundaryLines. Antes se dibujaba una copia
// recortada DENTRO de cada UnidadRow — cada banner/sub-grupo de
// complejo (que no es una UnidadRow) rompía la línea, dejando un
// corte/notch visible cada vez que la línea cruzaba uno de esos
// bloques. Una sola línea absoluta sobre todo el contenedor, en vez de
// N copias por fila, no puede tener ese corte por construcción.
function LineaHoyContinua({ startDate, numDays, dayW }) {
  const today = startOfToday()
  const todayOffset = differenceInDays(today, startDate)
  if (todayOffset < 0 || todayOffset >= numDays) return null
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        top: MONTH_BAND_H, bottom: 0,
        left: todayOffset * dayW + dayW / 2 - 1,
        width: 2, backgroundColor: '#f97316',
        zIndex: 20,
      }}
    />
  )
}

// Fila de reserva por unidad — mismo mecanismo visual que TimelineRow
// en Disponibilidad.jsx (posicionamiento absoluto, merge de días
// consecutivos, esquinas redondeadas), pero NO es TimelineRow
// reusado: TimelineRow lee `getCabanaColor`/`cabanasActivo` directo de
// `useComplejo()` (el complejo activo GLOBAL) — en esta página no hay
// ningún complejo "activo" y cada fila puede pertenecer a un complejo
// distinto, así que esa lectura global sería lisa y llanamente
// incorrecta acá. Esta versión toma `color` y `cabanasDelComplejo`
// como props explícitos (el color del COMPLEJO al que pertenece esta
// fila — ver ColorPorComplejo más abajo — no el color individual de
// la cabaña, a propósito: en esta vista el color identifica complejo,
// no cabaña puntual, para que una grilla con cabañas de 5 complejos no
// termine con 50+ colores sueltos sin relación visual entre sí).
function UnidadRow({ cabana, reservas, cabanasDelComplejo, startDate, endDate, dayW, height, color, onReservaClick }) {
  const today = startOfToday()
  const numDays = differenceInDays(endDate, startDate) + 1

  const relevantReservas = reservas.filter((r) => {
    if (!reservaIncluyeCabana(r, cabana.nombre, cabanasDelComplejo)) return false
    const ent = parseISO(r.fecha_entrada)
    const sal = parseISO(r.fecha_salida)
    return sal >= startDate && ent <= endDate
  })

  const totalW = numDays * dayW

  return (
    <div style={{ position: 'relative', height, width: totalW, minWidth: totalW, flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: totalW, height: '100%', display: 'flex' }}>
        {Array.from({ length: numDays }, (_, i) => {
          const day = addDays(startDate, i)
          const dow = getDay(day)
          const isWeekend = dow === 0 || dow === 6
          const isToday = isSameDay(day, today)
          return (
            <div
              key={i}
              style={{
                width: dayW, minWidth: dayW, flexShrink: 0, height: '100%',
                borderRight: '1px solid #f0e6d8',
                backgroundColor: isToday ? '#fff7ed' : isWeekend ? '#fff4e8' : '#fff',
              }}
            />
          )
        })}
      </div>

      {relevantReservas.map((r) => {
        const ent = parseISO(r.fecha_entrada)
        const sal = parseISO(r.fecha_salida)
        const startsInView = ent >= startDate
        const endsInView = sal <= endDate
        const clampedStart = startsInView ? ent : startDate
        const clampedEnd = endsInView ? sal : endDate
        const dayStart = differenceInDays(clampedStart, startDate)
        const daySpan = differenceInDays(clampedEnd, clampedStart) + 1

        const consecutiveNext = endsInView
          ? relevantReservas.find((r2) => r2.id !== r.id && r2.fecha_entrada === r.fecha_salida)
          : null
        const consecutivePrev = startsInView
          ? relevantReservas.find((r2) => r2.id !== r.id && r2.fecha_salida === r.fecha_entrada)
          : null

        let left = dayStart * dayW + 1
        let width = daySpan * dayW - 2
        if (consecutiveNext) width -= 1
        if (consecutivePrev) { left += 1; width -= 1 }
        width = Math.max(width, 10)

        const roundedL = startsInView && !consecutivePrev ? 8 : 2
        const roundedR = endsInView && !consecutiveNext ? 8 : 2
        const borderRadius = `${roundedL}px ${roundedR}px ${roundedR}px ${roundedL}px`
        // Mismo formato que TimelineRow (Disponibilidad.jsx:707-719):
        // ↓ + primer nombre en el extremo de entrada, código centrado,
        // ↑ en el extremo de salida. NO se porta el tooltip on-hover de
        // TimelineRow (useState/onMouseEnter/fixed div) — el pedido fue
        // puntualmente las flechas + nombre + código, no el tooltip, y
        // nada de esta página necesitaba uno hasta ahora.
        const firstName = r.nombre_apellido?.split(' ')[0] ?? ''

        return (
          <div
            key={r.id}
            data-testid={`reserva-bar-${r.id}`}
            style={{
              position: 'absolute',
              left,
              width,
              top: height * 0.1,
              height: height * 0.8,
              backgroundColor: color,
              borderRadius,
              cursor: 'pointer',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              zIndex: 5,
            }}
            onClick={() => onReservaClick(r)}
          >
            {startsInView && (
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.9)', paddingLeft: 4, flexShrink: 0, lineHeight: 1 }}>
                ↓{firstName && <span style={{ marginLeft: 2 }}>{firstName}</span>}
              </span>
            )}
            <span style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>
              {r.codigo}
            </span>
            {endsInView && (
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.9)', paddingRight: 4, flexShrink: 0, lineHeight: 1 }}>
                ↑
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ComplejosDelMar() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { todosLosComplejos, complejosConAcceso, cargando } = useComplejo()

  const [cabanas, setCabanas] = useState([])
  const [reservas, setReservas] = useState([])
  const [loadingDatos, setLoadingDatos] = useState(true)
  const [popup, setPopup] = useState(null)

  const esMobile = useEsMobile()
  const dayW = DAY_W
  const rowH = esMobile ? ROW_H_MOBILE : ROW_H_DESKTOP
  const anchoColumnaNombres = esMobile ? ANCHO_COLUMNA_NOMBRE_MOBILE : NOMBRE_COL_W_DESKTOP

  // Altura real de la celda esquina (columna izquierda, sticky) — tiene
  // que ser EXACTA a la altura combinada real de MonthHeaders + DayHeaders
  // (columna derecha) para que las dos columnas arranquen en el mismo
  // offset vertical. Antes era un número hardcodeado (MONTH_BAND_H + 44)
  // asumiendo que DayHeaders mide 44px — no mide eso: DayHeaders (reusado
  // sin cambios) no tiene `height` propio, su alto sale de su contenido
  // (padding + 3 líneas de texto apiladas + borde), ≈46.6px, no 44 — un
  // desfasaje de un par de px que, acumulado fila tras fila, es lo que se
  // vio como corte en la línea de "hoy". En vez de reemplazar un número
  // adivinado por otro (que se desincroniza de nuevo si DayHeaders
  // cambia su CSS alguna vez), se MIDE el alto real del stack
  // MonthHeaders+DayHeaders en vivo (ref + offsetHeight) y se aplica ese
  // valor medido a la celda esquina — quedan sincronizados por
  // construcción, no por coincidencia numérica.
  // `headerStackRef` ya NO envuelve a MonthHeaders/DayHeaders en un
  // <div> — se verificó con un repro aislado (Playwright, fuera de
  // este archivo) que CUALQUIER <div> contenedor de layout normal
  // (position:static, relative, o incluso display:flex) interpuesto
  // entre un position:sticky y la columna derecha (que es un flex
  // item de la fila `display:flex` de más arriba) hace que Chromium
  // deje de respetar el sticky de sus hijos — se mueven con el scroll
  // en vez de quedar fijos. display:contents evita el problema pero
  // da offsetHeight:0 (inservible para medir). La solución es no
  // envolver nada: MonthHeaders y DayHeaders quedan como hermanos
  // directos de la columna derecha (su sticky ya confirmado intacto
  // así), y este ref apunta a un centinela de altura 0, hermano
  // puesto JUSTO DESPUÉS de los dos — su `offsetTop` (distancia desde
  // el borde superior de la columna derecha, su offsetParent) es
  // exactamente la suma de ambas alturas, sin necesitar envolverlas.
  const headerStackRef = useRef(null)
  const [headerStackHeight, setHeaderStackHeight] = useState(MONTH_BAND_H + 44)
  useLayoutEffect(() => {
    if (headerStackRef.current) {
      setHeaderStackHeight(headerStackRef.current.offsetTop)
    }
  }, [esMobile])

  // Antes fijo en "hoy .. hoy+29" (useMemo, nunca cambiaba) — ahora
  // controlado por el CalendarPicker Desde/Hasta de abajo (mismo
  // CalendarPicker ya reusado por Ganancias.jsx/Reservas.jsx vía
  // DateRangePicker, no uno nuevo). Default: "hoy .. exactamente un
  // mes calendario después" (addMonths, no un conteo fijo de días).
  const [startDate, setStartDate] = useState(() => startOfToday())
  const [endDate, setEndDate] = useState(() => addMonths(startOfToday(), 1))
  const numDays = differenceInDays(endDate, startDate) + 1

  // Mismo clamp que ya usa Disponibilidad.jsx (handleStartDate/
  // handleEndDate): mover "desde" más allá de "hasta" empuja "hasta"
  // adelante (acá, 1 mes — el mismo tamaño de ventana que el default,
  // no los 29 días fijos que usa Disponibilidad para SU default
  // propio); mover "hasta" antes de "desde" se ignora.
  const handleStartDate = (d) => {
    setStartDate(d)
    if (d > endDate) setEndDate(addMonths(d, 1))
  }
  const handleEndDate = (d) => {
    if (d < startDate) return
    setEndDate(d)
  }

  // Fetch batcheado — un solo pedido por tabla, `.in('complejo_id',
  // complejosConAcceso)`, nunca un fetch por complejo (ver header del
  // archivo). Guard `cancelado` contra respuesta obsoleta, mismo
  // patrón que el resto de la app.
  useEffect(() => {
    if (cargando) return
    if (!complejosConAcceso || complejosConAcceso.length === 0) {
      setCabanas([])
      setReservas([])
      setLoadingDatos(false)
      return
    }
    let cancelado = false
    setLoadingDatos(true)
    Promise.all([
      supabase.from('cabanas').select('*').in('complejo_id', complejosConAcceso).order('orden'),
      supabase
        .from('reservas')
        .select('id, codigo, nombre_apellido, cabana, fecha_entrada, fecha_salida, estado, pax, mascotas, noches, monto_total, sena1_monto, sena2_monto, pago_cabana_monto, celular, complejo_id')
        .in('complejo_id', complejosConAcceso)
        .neq('estado', 'Cancelada'),
    ]).then(([cabanasRes, reservasRes]) => {
      if (cancelado) return
      setCabanas(cabanasRes.data || [])
      setReservas(reservasRes.data || [])
      setLoadingDatos(false)
    })
    return () => { cancelado = true }
  }, [cargando, complejosConAcceso])

  const { cabanasPorComplejo, reservasPorComplejo } = useMemo(
    () => agruparPorComplejo(cabanas, reservas),
    [cabanas, reservas]
  )

  const complejosVisibles = useMemo(
    () => todosLosComplejos.filter((c) => complejosConAcceso.includes(c.id)),
    [todosLosComplejos, complejosConAcceso]
  )

  const slugPorComplejoId = useMemo(
    () => Object.fromEntries(todosLosComplejos.map((c) => [c.id, c.slug])),
    [todosLosComplejos]
  )

  // Para el popup: color/nombre del complejo REAL de la reserva (nunca
  // el de la cabaña, nunca el de ningún complejo "activo" — ver props
  // colorOverride/complejoNombre en ReservaPopup, Disponibilidad.jsx).
  const complejoPorId = useMemo(
    () => Object.fromEntries(todosLosComplejos.map((c) => [c.id, c])),
    [todosLosComplejos]
  )

  // "Ver detalle" nunca usa un complejo "activo" global (no existe
  // ninguno en esta página) — resuelve el slug de ESA reserva puntual
  // vía su propio complejo_id.
  const handleVerDetalle = (reserva) => {
    setPopup(null)
    const slug = slugPorComplejoId[reserva.complejo_id]
    if (slug) navigate(`/${slug}/reservas/${reserva.id}`)
  }

  const todayISO = todayStr()
  const { totalCabanas, ocupadasHoy } = useMemo(() => {
    let total = 0
    let ocupadas = 0
    for (const complejo of complejosVisibles) {
      const cabs = cabanasPorComplejo[complejo.id] || []
      const resvs = reservasPorComplejo[complejo.id] || []
      total += cabs.length
      for (const c of cabs) {
        const ocupadaHoy = resvs.some(
          (r) => reservaIncluyeCabana(r, c.nombre, cabs) && r.fecha_entrada <= todayISO && todayISO <= r.fecha_salida
        )
        if (ocupadaHoy) ocupadas++
      }
    }
    return { totalCabanas: total, ocupadasHoy: ocupadas }
  }, [complejosVisibles, cabanasPorComplejo, reservasPorComplejo, todayISO])

  const email = session?.user?.email || ''
  const userName = email.split('@')[0] || 'Usuario'
  const initial = userName[0]?.toUpperCase() || 'U'

  const loading = cargando || loadingDatos

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: '#FAF7F2' }}>
      {/* Top bar — sticky de nuevo. En la revisión anterior se había
          sacado el sticky de acá porque, en ese momento, la grilla
          scrolleaba contra la PÁGINA entera y DayHeaders (top:22
          hardcodeado adentro, reusado sin cambios) se hubiera superpuesto
          con esta barra. Ahora que la grilla volvió a tener su propio
          scroll interno (ver más abajo), DayHeaders se pega contra ESE
          contenedor, no contra la página — el conflicto ya no existe, así
          que esta barra puede volver a ser sticky sin problema. */}
      <div
        className="flex items-center justify-between px-4 sm:px-7 h-14 sm:h-16 bg-white sticky top-0 z-30 flex-shrink-0"
        style={{ borderBottom: '1px solid #f0e6d8' }}
      >
        <Link to="/" className="text-sm font-medium text-[#888] hover:text-[#333] transition-colors">
          ← Volver a mis complejos
        </Link>
        <div
          className="rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          style={{ width: 34, height: 34, backgroundColor: '#111111' }}
        >
          {initial}
        </div>
      </div>

      {/* flex-1 + min-h-0: deja que esta zona ocupe TODO el alto
          restante del viewport (debajo de la barra de arriba), en vez
          de un alto fijo adivinado — min-h-0 es necesario para que un
          hijo flex pueda encogerse/scrollear en vez de desbordar (gotcha
          clásico de flexbox, sin esto el contenido simplemente crecería
          más allá del viewport). */}
      <div className="flex-1 min-h-0 flex flex-col px-4 sm:px-7 py-5 sm:py-7 max-w-[1480px] mx-auto w-full">
        {/* Header — misma estructura/alineación que Disponibilidad.jsx
            (línea ~999): título+subtítulo a la izquierda, Desde/Hasta a
            la derecha en la MISMA fila (sm:ml-auto), en mobile el grupo
            de fechas pasa a su propia fila debajo pero Desde/Hasta
            quedan lado a lado en 2 columnas (`sm:contents` + `flex-1
            min-w-0 sm:flex-none` en cada CalendarPicker) — no apilados.
            CalendarPicker importado de DateRangePicker.jsx (con los
            className/triggerClassName agregados ahí para esto), no la
            copia local de Disponibilidad.jsx. */}
        <div className="flex flex-wrap items-end gap-4 flex-shrink-0">
          <div>
            <h1 className="text-[22px] sm:text-[28px] font-bold text-[#111111] whitespace-nowrap">Complejos del mar</h1>
            <p className="text-sm text-[#888] mt-0.5">
              {ocupadasHoy} de {totalCabanas} cabañas ocupadas hoy
            </p>
          </div>
          <div className="flex flex-col gap-3 w-full sm:w-auto sm:flex-row sm:flex-wrap sm:items-end sm:ml-auto">
            <div className="flex gap-3 sm:contents">
              <CalendarPicker
                label="Desde"
                value={startDate}
                onChange={handleStartDate}
                className="flex-1 min-w-0 sm:flex-none"
                triggerClassName="w-full sm:w-auto"
              />
              <CalendarPicker
                label="Hasta"
                value={endDate}
                onChange={handleEndDate}
                className="flex-1 min-w-0 sm:flex-none"
                triggerClassName="w-full sm:w-auto"
              />
            </div>
          </div>
        </div>

        {/* Grilla */}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-[#888] text-sm">
            Cargando disponibilidad...
          </div>
        ) : (
          <div className="mt-4 bg-white rounded-[16px] border border-[#f0e6d8] overflow-hidden flex-1 min-h-0 flex flex-col">
            {/* Scroll interno (horizontal Y vertical) acotado a esta
                caja — DayHeaders queda sticky DENTRO de este contenedor,
                como en la implementación original. El alto de la caja ya
                no es un número fijo adivinado: `flex-1 min-h-0` la hace
                ocupar todo el alto disponible real del viewport (ver el
                flex chain de arriba). Scrollbar propia, angosta y
                redondeada — mismos valores que ya usa el panel de
                CabinMultiPicker en ReservaForm.jsx (`#D7DEE8`), no un
                color inventado nuevo. */}
            <div
              className="flex-1 min-h-0 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:bg-[#D7DEE8] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
              style={{ overflow: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#D7DEE8 transparent' }}
            >
              <div style={{ display: 'flex', width: anchoColumnaNombres + numDays * dayW, minWidth: anchoColumnaNombres + numDays * dayW }}>

                {/* Columna izquierda: nombres, sticky-left */}
                <div style={{ width: anchoColumnaNombres, minWidth: anchoColumnaNombres, flexShrink: 0, position: 'sticky', left: 0, zIndex: 22, borderRight: '1px solid #f0e6d8' }}>
                  {/* Rediseño "Opción C": la celda de esquina ya no es
                      un bloque sólido de borde a borde — el rótulo
                      "Complejos" vive en su propia cajita chica,
                      redondeada, alineada abajo (paddingBottom 10 = el
                      ~10px de separación pedido antes de la primera
                      tarjeta de complejo). El alto de la celda sigue
                      siendo headerStackHeight sin tocar — eso es lo que
                      mantiene esta columna alineada con MonthHeaders+
                      DayHeaders del lado derecho, el fix del round
                      anterior. */}
                  <div style={{
                    height: headerStackHeight, backgroundColor: '#111111',
                    position: 'sticky', top: 0, zIndex: 23,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                    border: 'none', boxShadow: 'none', textShadow: 'none', outline: 'none',
                  }}>
                    <span style={{
                      border: 'none', boxShadow: 'none', textShadow: 'none', outline: 'none',
                      fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1,
                    }}>
                      Complejos
                    </span>
                  </div>
                  {complejosVisibles.map((complejo, idx) => {
                    const cabs = cabanasPorComplejo[complejo.id] || []
                    const resvs = reservasPorComplejo[complejo.id] || []
                    const colorPrimario = complejo.color_primario || '#64748b'
                    const colorSecundario = complejo.color_secundario || '#f0e6d8'
                    const secciones = agruparCabanasPorGrupo(cabs)
                    const esUltimo = idx === complejosVisibles.length - 1
                    return (
                      // Tarjeta por complejo: borde + radio + sombra
                      // acá (columna sticky, siempre entera en
                      // pantalla — ver nota más abajo en la columna
                      // derecha sobre por qué ahí NO se replica igual).
                      // overflow:hidden recorta el banner/filas de
                      // esquinas rectas a esta forma redondeada, sin
                      // tocar esos elementos — mismo truco que el
                      // mockup. La barra de acento de color (borderLeft
                      // de 4px en cada fila) se sacó: el banner ya
                      // carga el color, no hace falta duplicarlo.
                      <Fragment key={complejo.id}>
                      <div style={{
                        border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                        marginBottom: esUltimo ? 0 : GAP_COMPLEJO,
                      }}>
                        <div
                          data-testid={`banner-complejo-${complejo.slug}`}
                          style={{
                            height: BANNER_H, display: 'flex', alignItems: 'center', gap: 8,
                            paddingLeft: 10, backgroundColor: colorPrimario,
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'white', flexShrink: 0 }} />
                          <span style={{ fontSize: esMobile ? 11 : 12, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {complejo.nombre}
                          </span>
                        </div>
                        {secciones.map((seccion, si) => (
                          <Fragment key={seccion.grupo || `${complejo.id}-sin-grupo-${si}`}>
                            {seccion.grupo && (
                              <div style={{
                                height: SUBGRUPO_H, display: 'flex', alignItems: 'center',
                                paddingLeft: 22, fontSize: 10, fontWeight: 700,
                                color: '#333', textTransform: 'uppercase', letterSpacing: '0.04em',
                                backgroundColor: colorSecundario,
                              }}>
                                {seccion.grupo}
                              </div>
                            )}
                            {seccion.cabanas.map((cabana, ci) => {
                              // Mismo cálculo que `cabanaStatus` en
                              // Disponibilidad.jsx, pero con los
                              // parámetros de ESTE complejo explícitos
                              // (resvs/cabs) en vez de cerrar sobre
                              // estado global — mismo criterio que
                              // UnidadRow vs. TimelineRow.
                              const st = calcularStatusCabana(cabana, resvs, cabs, todayISO)
                              const statusText = st.current
                                ? st.current.nombre_apellido.split(' ').slice(0, 2).join(' ')
                                : st.upcoming
                                  ? `Próx: ${format(parseISO(st.upcoming.fecha_entrada), 'dd/MM')}`
                                  : 'Libre'
                              // En Disponibilidad.jsx el punto "próxima
                              // reserva" usa 'var(--color-primario)' (el
                              // complejo ACTIVO global) — acá no existe
                              // tal cosa (la gracia de esta página es
                              // mostrar varios a la vez), así que se usa
                              // el colorPrimario YA resuelto de la fila,
                              // igual que el resto de esta página.
                              const dotColor = st.current ? colorPrimario : st.upcoming ? colorPrimario : '#4ade80'
                              const textColor = st.current ? colorPrimario : st.upcoming ? '#888888' : '#16a34a'
                              return (
                                <div
                                  key={cabana.id}
                                  style={{
                                    height: rowH, display: 'flex', flexDirection: 'column',
                                    justifyContent: 'center', alignItems: 'flex-start',
                                    gap: 4, paddingLeft: 10, paddingRight: 8,
                                    borderBottom: '1px solid #f0e6d8',
                                    backgroundColor: ci % 2 === 0 ? '#fff' : '#fff7f9',
                                  }}
                                >
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                                    <span style={{
                                      width: 10, height: 10, borderRadius: '50%',
                                      backgroundColor: dotColor, flexShrink: 0,
                                    }} />
                                    <NombreCabana nombre={cabana.nombre} fontSize={esMobile ? 11 : 12} />
                                  </span>
                                  <span style={{
                                    fontSize: esMobile ? 10 : 12, fontWeight: 500, color: textColor,
                                    marginLeft: 18, maxWidth: esMobile ? 100 : 148,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    {statusText}
                                  </span>
                                </div>
                              )
                            })}
                          </Fragment>
                        ))}
                      </div>
                      </Fragment>
                    )
                  })}
                </div>

                {/* Columna derecha: bandas de mes/día + filas */}
                <div style={{ width: numDays * dayW, minWidth: numDays * dayW, flexShrink: 0, position: 'relative' }}>
                  {/* MonthHeaders y DayHeaders YA NO están envueltos en
                      un <div> — ver el comentario junto a headerStackRef
                      más arriba (ese wrapper era lo que rompía su
                      position:sticky). Quedan como hermanos directos de
                      esta columna, y el centinela de abajo (altura 0,
                      mismo ancho irrelevante) mide dónde terminan sin
                      envolverlos. */}
                  <MonthHeaders startDate={startDate} numDays={numDays} dayW={dayW} />
                  <DayHeaders startDate={startDate} numDays={numDays} />
                  <div ref={headerStackRef} style={{ height: 0 }} />

                  {/* Capa 1 — fondos: banners de complejo, sub-grupos, y las
                      filas de cabaña (que a su vez pintan sus propias barras
                      de reserva vía UnidadRow, z-index:5 interno). Todos
                      `position: static` (sin position seteado), en flujo
                      normal — se pintan en este orden, de arriba a abajo. */}
                  {complejosVisibles.map((complejo, idx) => {
                    const cabs = cabanasPorComplejo[complejo.id] || []
                    const resvs = reservasPorComplejo[complejo.id] || []
                    const colorPrimario = complejo.color_primario || '#64748b'
                    const secciones = agruparCabanasPorGrupo(cabs)
                    const esUltimo = idx === complejosVisibles.length - 1
                    return (
                      // Mismo borde horizontal (1px #e5e7eb, arriba Y
                      // abajo) y mismo GAP_COMPLEJO que la tarjeta de
                      // la columna izquierda, para que las dos columnas
                      // sigan sumando exactamente la misma altura total
                      // por complejo — pero SIN radio de esquina ni
                      // box-shadow acá. Motivo (pedido explícito: no
                      // copiar el mockup literal sin chequear esto):
                      // esta columna NO es sticky, es ancha (numDays*
                      // dayW, normalmente mucho más que el viewport) y
                      // vive dentro del MISMO contenedor con scroll
                      // horizontal que la columna de nombres — su borde
                      // izquierdo queda tapado por la columna sticky en
                      // cuanto se scrollea, y su borde derecho está,
                      // literalmente, en el día 90+ (fuera de vista casi
                      // siempre). Un box-shadow ahí sólo se vería
                      // completo en los extremos del scroll horizontal
                      // — en cualquier otra posición se vería una
                      // sombra cortada/parpadeando, peor que no tener
                      // ninguna. El borde arriba/abajo, en cambio, sí es
                      // visible siempre (no depende del scroll
                      // horizontal, sólo del vertical), así que ESO se
                      // replica para que la línea divisoria entre
                      // complejos se vea continua en toda la fila.
                      <Fragment key={complejo.id}>
                      <div style={{
                        borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb',
                        marginBottom: esUltimo ? 0 : GAP_COMPLEJO,
                      }}>
                        <div style={{ height: BANNER_H, backgroundColor: colorPrimario }} />
                        {secciones.map((seccion, si) => (
                          <Fragment key={seccion.grupo || `${complejo.id}-sin-grupo-${si}`}>
                            {seccion.grupo && (
                              <div style={{ height: SUBGRUPO_H, backgroundColor: complejo.color_secundario || '#f0e6d8' }} />
                            )}
                            {seccion.cabanas.map((cabana, ci) => (
                              <div
                                key={cabana.id}
                                style={{
                                  height: rowH, borderBottom: '1px solid #f0e6d8',
                                  backgroundColor: ci % 2 === 0 ? '#fff' : 'rgba(254,231,239,0.35)',
                                  overflow: 'visible',
                                }}
                              >
                                <UnidadRow
                                  cabana={cabana}
                                  reservas={resvs}
                                  cabanasDelComplejo={cabs}
                                  startDate={startDate}
                                  endDate={endDate}
                                  dayW={dayW}
                                  height={rowH}
                                  color={colorPrimario}
                                  onReservaClick={setPopup}
                                />
                              </div>
                            ))}
                          </Fragment>
                        ))}
                      </div>
                      </Fragment>
                    )
                  })}

                  {/* Capa 2 — líneas de hoy/cambio de mes. YA NO llevan un
                      wrapper con zIndex:100: ese z-index salía de este
                      contenedor (sin stacking context propio) y competía
                      directo contra CUALQUIER otro elemento posicionado
                      de la página — incluido el overlay del ReservaPopup
                      (`fixed ... z-50`), que quedaba tapado por estas
                      líneas al abrir una reserva. El z-index:100 se
                      agregó en un round anterior creyendo que el seam
                      visual entre banners/sub-grupos era un problema de
                      orden de pintado — resultó ser la altura de la
                      celda de esquina (headerStackHeight, ya fijo), no
                      esto. Sin el wrapper, cada línea vuelve a pintar
                      con su propio z-index interno (MonthBoundaryLines:
                      15, LineaHoyContinua: 20 — mismo mecanismo que ya
                      usa Disponibilidad.jsx sin este problema) y ya no
                      hay nada acá que pueda superar al popup. */}
                  <MonthBoundaryLines startDate={startDate} numDays={numDays} />
                  <LineaHoyContinua startDate={startDate} numDays={numDays} dayW={dayW} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {popup && (
        <ReservaPopup
          reserva={popup}
          onClose={() => setPopup(null)}
          onView={() => handleVerDetalle(popup)}
          colorOverride={complejoPorId[popup.complejo_id]?.color_primario}
          complejoNombre={complejoPorId[popup.complejo_id]?.nombre}
        />
      )}
    </div>
  )
}

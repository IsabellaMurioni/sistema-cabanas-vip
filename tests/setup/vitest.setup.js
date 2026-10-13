// Vitest global setup — runs before every test file.
//
// Loaded via vite.config.js's `test.setupFiles`. Adds jest-dom's DOM
// matchers (toBeInTheDocument, etc.) for when integration tests that
// render components are added in a later step. Part B's unit tests are
// pure-logic and don't need this, but it costs nothing to have ready.
import '@testing-library/jest-dom/vitest'

// Mock de Canvas 2D measureText — jsdom no implementa Canvas de
// verdad (getContext('2d') devuelve null salvo que se instale el
// paquete nativo `canvas`, que este proyecto no tiene). Disponibilidad
// usa Canvas para medir el ancho de los nombres de cabaña y calcular
// el ancho dinámico de la columna de nombres (ver
// calcularAnchoColumnaNombres en src/pages/Disponibilidad.jsx) — sin
// este mock, CUALQUIER test que renderice <Disponibilidad /> rompería
// al llamar ctx.font en un ctx null, no sólo los tests que prueban esa
// función específicamente.
//
// Los anchos por carácter están calibrados contra Canvas 2D real
// (Chromium) con el font de la celda de nombre de cabaña (600 12px
// Inter) — ver tests/unit/disponibilidad-ancho-columna-nombres.test.jsx
// para la validación cruzada contra medición en navegador real. No
// cubre TODOS los caracteres posibles (sólo los que aparecen en
// nombres de cabaña reales hoy, más margen), así que cualquier
// carácter no listado usa ANCHO_CARACTER_FALLBACK — un valor generoso,
// a propósito, para no subestimar en los tests.
const ANCHOS_CARACTER_INTER_600_12PX = {
  ' ': 3.0234375, '2': 7.4765625, '3': 7.634765625, '4': 7.9921875, '5': 7.34765625,
  '6': 7.67578125, '7': 6.9140625, '8': 7.681640625, '9': 7.67578125,
  A: 8.73046875, B: 7.91015625, C: 8.841796875, D: 8.666015625, H: 8.947265625,
  I: 3.322265625, J: 6.955078125, M: 11.068359375, P: 7.740234375, V: 8.73046875,
  a: 6.890625, b: 7.48828125, c: 6.990234375, e: 7.095703125, f: 4.6640625,
  h: 7.34765625, i: 3.140625, j: 3.140625, l: 3.140625, m: 10.8046875, n: 7.341796875,
  o: 7.306640625, p: 7.48828125, r: 4.763671875, s: 6.591796875, t: 4.236328125,
  u: 7.34765625, w: 10.072265625, x: 6.826171875, z: 6.791015625,
  á: 6.890625, ú: 7.34765625,
}
const ANCHO_CARACTER_FALLBACK = 9

// Calibrado contra Canvas 2D real (Chromium, vía la app corriendo en
// localhost para que Google Fonts/Inter esté cargado de verdad) con el
// font de la lista de cabañas de "Ver por cabaña" en desktop (500 14px
// Inter) — ver FONT_NOMBRE_SIDEBAR_DESKTOP/
// calcularAlturaFilaSidebarDesktop en src/pages/Disponibilidad.jsx. Un
// font DISTINTO al de "Ver todas" (600 12px), con sus propios anchos —
// no se puede reusar la tabla de arriba para este caso. Cubre los
// caracteres que aparecen en los nombres reales de cabaña de los 5
// complejos hoy (confirmado contra staging) — ver
// tests/unit/disponibilidad-sidebar-cabana-altura.test.jsx para la
// validación cruzada contra medición en navegador real.
const ANCHOS_CARACTER_INTER_500_14PX = {
  ' ': 3.732421875, '2': 8.626953125, '3': 8.77734375, '4': 9.1875, '5': 8.4423828125,
  '6': 8.818359375, '7': 7.998046875, '8': 8.8115234375, '9': 8.818359375,
  A: 9.92578125, B: 9.1943359375, C: 10.267578125, D: 10.103515625, H: 10.4248046875,
  I: 3.814453125, J: 8.052734375, M: 12.7763671875, P: 8.982421875, V: 9.92578125,
  a: 7.9501953125, b: 8.654296875, c: 8.080078125, e: 8.2236328125, f: 5.3115234375,
  h: 8.421875, i: 3.52734375, j: 3.52734375, l: 3.52734375, m: 12.4345703125, n: 8.421875,
  o: 8.4560546875, p: 8.654296875, r: 5.4140625, s: 7.5400390625, t: 4.7646484375,
  u: 8.421875, w: 11.607421875, x: 7.7998046875, z: 7.8271484375,
  á: 7.9501953125, ú: 8.421875,
}

// Las claves son el string de font EXACTO que setea cada caller real
// (ver FONT_COLUMNA_NOMBRE/FONT_NOMBRE_SIDEBAR_DESKTOP en
// Disponibilidad.jsx) — hardcodeados acá tal cual, no importados,
// mismo criterio self-contained que ya tenía este mock.
const TABLAS_POR_FONT = {
  "600 12px 'Inter', system-ui, -apple-system, sans-serif": ANCHOS_CARACTER_INTER_600_12PX,
  "500 14px 'Inter', sans-serif": ANCHOS_CARACTER_INTER_500_14PX,
}

HTMLCanvasElement.prototype.getContext = function (type) {
  if (type !== '2d') return null
  return {
    font: '',
    measureText(texto) {
      const tabla = TABLAS_POR_FONT[this.font] || ANCHOS_CARACTER_INTER_600_12PX
      const width = texto
        .split('')
        .reduce((acc, c) => acc + (tabla[c] ?? ANCHO_CARACTER_FALLBACK), 0)
      return { width }
    },
  }
}

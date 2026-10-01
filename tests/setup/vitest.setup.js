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

HTMLCanvasElement.prototype.getContext = function (type) {
  if (type !== '2d') return null
  return {
    font: '',
    measureText(texto) {
      const width = texto
        .split('')
        .reduce((acc, c) => acc + (ANCHOS_CARACTER_INTER_600_12PX[c] ?? ANCHO_CARACTER_FALLBACK), 0)
      return { width }
    },
  }
}

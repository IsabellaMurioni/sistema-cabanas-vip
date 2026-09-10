// Código real importado de src/context/ComplejoContext.jsx — sin
// mocks, sin DB, sin renderizar el ComplejoProvider. Ya no hay
// reimplementaciones [MIRROR]: resolverColorCabana/resolverColoresHover
// son las funciones que el componente llama directamente.
import { describe, it, expect } from 'vitest'
import { shadeColor, resolverColorCabana, resolverColoresHover } from '../../src/context/ComplejoContext'

// Colores primario reales de cada complejo. Los 3 nuevos son los que
// se cargaron por seed en supabase/seed/001_complejos_nuevos.sql en
// este mismo branch. El de MIMMO NO se pudo confirmar contra la base
// real en esta sesión (sin acceso a DB) — se usa un valor de ejemplo
// sólo para ejercitar la función, no para verificar el dato real.
const PRIMARIOS = {
  'cabanas-vip':              '#d2ab84',
  'mimmo (valor de ejemplo, no confirmado contra la base)': '#3b82f6',
  'casas-azahar':             '#FE824C',
  'los-amigos':               '#8A6852',
  'chacras-del-mar':          '#68B999',
}

describe('shadeColor (código real)', () => {
  it('percent negativo oscurece cada canal hacia 0', () => {
    const oscuro = shadeColor('#d2ab84', -0.12)
    const val = parseInt(oscuro.replace('#', ''), 16)
    expect((val >> 16) & 0xff).toBeLessThanOrEqual(0xd2)
    expect((val >> 8) & 0xff).toBeLessThanOrEqual(0xab)
    expect(val & 0xff).toBeLessThanOrEqual(0x84)
  })

  it('percent positivo aclara cada canal hacia 255', () => {
    const claro = shadeColor('#d2ab84', 0.85)
    const val = parseInt(claro.replace('#', ''), 16)
    expect((val >> 16) & 0xff).toBeGreaterThanOrEqual(0xd2)
    expect((val >> 8) & 0xff).toBeGreaterThanOrEqual(0xab)
    expect(val & 0xff).toBeGreaterThanOrEqual(0x84)
  })

  it('percent = 0 devuelve el mismo color (normalizado a mayúsculas)', () => {
    expect(shadeColor('#d2ab84', 0)).toBe('#D2AB84')
  })

  it.each(Object.entries(PRIMARIOS))('funciona para el primario de %s sin explotar, devuelve hex válido', (_nombre, hex) => {
    for (const pct of [-0.12, 0.85, 0.60]) {
      expect(shadeColor(hex, pct)).toMatch(/^#[0-9A-F]{6}$/)
    }
  })
})

describe('resolverColorCabana (código real)', () => {
  it('devuelve el color de la cabaña si existe', () => {
    expect(resolverColorCabana([{ nombre: 'Bahama', color: '#1e3a5f' }], 'Bahama')).toBe('#1e3a5f')
  })
  it('cabaña inexistente → gris de fallback', () => {
    expect(resolverColorCabana([{ nombre: 'Bahama', color: '#1e3a5f' }], 'NoExiste')).toBe('#64748b')
  })
  it('lista de cabañas vacía → gris de fallback, no explota', () => {
    expect(resolverColorCabana([], 'Cualquiera')).toBe('#64748b')
  })
})

describe('resolverColoresHover (código real)', () => {
  it('Cabañas VIP usa los 3 valores literales hardcodeados, no shadeColor', () => {
    expect(resolverColoresHover('cabanas-vip', '#d2ab84')).toEqual({
      hover: '#c49870', filaHover: '#fff4e8', botonHover: '#ffe0c0',
    })
  })
  it('sin complejo activo (slug undefined) también usa los valores de VIP — mismo fallback que antes del primer fetch', () => {
    expect(resolverColoresHover(undefined, '#d2ab84')).toEqual({
      hover: '#c49870', filaHover: '#fff4e8', botonHover: '#ffe0c0',
    })
  })
  it('cualquier otro complejo pasa por shadeColor (código real) sobre SU primario', () => {
    const r = resolverColoresHover('casas-azahar', '#FE824C')
    expect(r.hover).toBe(shadeColor('#FE824C', -0.12))
    expect(r.filaHover).toBe(shadeColor('#FE824C', 0.85))
    expect(r.botonHover).toBe(shadeColor('#FE824C', 0.60))
  })
})

// Fase 6 — código real importado de src/context/ComplejoContext.jsx y
// src/pages/Caja.jsx, sin mocks ni DB: la lógica de qué ve cada rol
// restringido ('limitado_caja_silvia', 'limitado_reservas') en el
// sidebar (nav), en las rutas (guard) y dentro de Caja (tabs) vive en
// estas funciones puras — RLS (021_membresias_rol.sql /
// 024_membresias_rol_limitado_reservas.sql) es el bloqueo real, esto
// sólo cubre que la UI no muestre lo que la base ya le va a negar.
import { describe, it, expect } from 'vitest'
import { rolParaComplejo, esRolLimitado, navItemsVisibles, seccionVisible } from '../../src/context/ComplejoContext'
import { tabsCajaVipVisibles } from '../../src/pages/Caja'

describe('rolParaComplejo (código real)', () => {
  const membresias = [
    { complejo_id: 'vip-id',   rol: 'limitado_caja_silvia' },
    { complejo_id: 'mimmo-id', rol: 'completo' },
  ]

  it('devuelve el rol de la membresía que matchea el complejo', () => {
    expect(rolParaComplejo(membresias, 'vip-id')).toBe('limitado_caja_silvia')
    expect(rolParaComplejo(membresias, 'mimmo-id')).toBe('completo')
  })

  it('complejo sin membresía → "completo" de fallback', () => {
    expect(rolParaComplejo(membresias, 'otro-id')).toBe('completo')
  })

  it('lista de membresías vacía o undefined → "completo" de fallback, no explota', () => {
    expect(rolParaComplejo([], 'vip-id')).toBe('completo')
    expect(rolParaComplejo(undefined, 'vip-id')).toBe('completo')
  })
})

describe('esRolLimitado (código real)', () => {
  it('"limitado_caja_silvia" y "limitado_reservas" son limitados', () => {
    expect(esRolLimitado('limitado_caja_silvia')).toBe(true)
    expect(esRolLimitado('limitado_reservas')).toBe(true)
  })
  it('"completo" y undefined no son limitados', () => {
    expect(esRolLimitado('completo')).toBe(false)
    expect(esRolLimitado(undefined)).toBe(false)
  })
})

describe('navItemsVisibles (código real) — visibilidad del sidebar', () => {
  const NAV = [
    { to: '/mimmo/reservas',       label: 'Reservas' },
    { to: '/mimmo/disponibilidad', label: 'Disponibilidad' },
    { to: '/mimmo/caja',           label: 'Caja' },
    { to: '/mimmo/ganancias',      label: 'Ganancias' },
    { to: '/mimmo/precios',        label: 'Precios' },
  ]

  it('rol "completo" ve los 5 items, sin cambios', () => {
    expect(navItemsVisibles(NAV, 'completo')).toEqual(NAV)
  })

  it('rol "limitado_caja_silvia" no ve Ganancias ni Precios (Caja se mantiene)', () => {
    const visibles = navItemsVisibles(NAV, 'limitado_caja_silvia')
    expect(visibles.map((i) => i.label)).toEqual(['Reservas', 'Disponibilidad', 'Caja'])
  })

  it('rol "limitado_reservas" sólo ve Reservas y Disponibilidad — ni Caja, ni Ganancias, ni Precios', () => {
    const visibles = navItemsVisibles(NAV, 'limitado_reservas')
    expect(visibles.map((i) => i.label)).toEqual(['Reservas', 'Disponibilidad'])
  })

  it('rol undefined (sin membresía resuelta todavía) se trata como no-limitado', () => {
    expect(navItemsVisibles(NAV, undefined)).toEqual(NAV)
  })
})

describe('seccionVisible (código real) — misma fuente de verdad que usa el guard de rutas', () => {
  it('rol "completo" ve Caja, Ganancias y Precios', () => {
    expect(seccionVisible('Caja', 'completo')).toBe(true)
    expect(seccionVisible('Ganancias', 'completo')).toBe(true)
    expect(seccionVisible('Precios', 'completo')).toBe(true)
  })

  it('rol "limitado_caja_silvia" ve Caja pero no Ganancias ni Precios', () => {
    expect(seccionVisible('Caja', 'limitado_caja_silvia')).toBe(true)
    expect(seccionVisible('Ganancias', 'limitado_caja_silvia')).toBe(false)
    expect(seccionVisible('Precios', 'limitado_caja_silvia')).toBe(false)
  })

  it('rol "limitado_reservas" no ve Caja, Ganancias ni Precios', () => {
    expect(seccionVisible('Caja', 'limitado_reservas')).toBe(false)
    expect(seccionVisible('Ganancias', 'limitado_reservas')).toBe(false)
    expect(seccionVisible('Precios', 'limitado_reservas')).toBe(false)
  })

  it('rol undefined (sin membresía resuelta todavía) ve todo — mismo criterio que navItemsVisibles', () => {
    expect(seccionVisible('Caja', undefined)).toBe(true)
    expect(seccionVisible('Ganancias', undefined)).toBe(true)
  })
})

describe('tabsCajaVipVisibles (código real) — tabs dentro de Caja', () => {
  it('rol "completo" ve las 4 pestañas (Silvia/Juli/Banco/Mercado Pago)', () => {
    const tabs = tabsCajaVipVisibles('completo')
    expect(tabs.map((t) => t.v)).toEqual(['silvia', 'juli', 'banco', 'mp'])
  })

  it('rol "limitado_caja_silvia" ve únicamente la pestaña Silvia', () => {
    const tabs = tabsCajaVipVisibles('limitado_caja_silvia')
    expect(tabs.map((t) => t.v)).toEqual(['silvia'])
  })

  it('rol "limitado_reservas" no ve ninguna pestaña — no debería llegar nunca acá (RequiereSeccion.jsx bloquea /caja entera), esto es sólo defensa en profundidad', () => {
    const tabs = tabsCajaVipVisibles('limitado_reservas')
    expect(tabs).toEqual([])
  })
})

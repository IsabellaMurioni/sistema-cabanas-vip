// Fase 5.3 — aislamiento por complejo_id, contra staging real.
// Usa el usuario de test de acceso completo (membresía en los 5
// complejos). Llama a las queries REALES exportadas por cada página —
// no las reimplementa acá (eso reintroduciría el problema de "mirror"
// que Fase 5 ya eliminó).
//
// Requiere TEST_USER_EMAIL / TEST_USER_PASSWORD en .env.local. Si
// faltan, falla rápido con un error claro (ver
// tests/setup/supabaseTestClient.js) en vez de colgarse o dar falsos
// positivos.
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { getFullAccessClient } from '../setup/supabaseTestClient'
import { fetchReservasPorComplejo } from '../../src/pages/Reservas'
import { fetchMovimientosPorComplejo, fetchCierresPorComplejo } from '../../src/pages/CajaTemporada'
import { fetchMovimientosPorComplejo as fetchMovimientosGanancias } from '../../src/pages/Ganancias'
import { autotestNombre, autotestDetalle, autotestCierreNombre, autotestCodigo, getComplejoIdBySlug } from './helpers'

let client
let complejoAId // casas-azahar
let complejoBId // los-amigos

const cleanup = { reservas: [], movimientos: [], cierres: [] }

beforeAll(async () => {
  client = await getFullAccessClient()
  complejoAId = await getComplejoIdBySlug(client, 'casas-azahar')
  complejoBId = await getComplejoIdBySlug(client, 'los-amigos')
})

afterEach(async () => {
  if (cleanup.reservas.length) {
    await client.from('reservas').delete().in('id', cleanup.reservas)
    cleanup.reservas = []
  }
  if (cleanup.movimientos.length) {
    await client.from('movimientos_caja').delete().in('id', cleanup.movimientos)
    cleanup.movimientos = []
  }
  if (cleanup.cierres.length) {
    await client.from('cierres_caja').delete().in('id', cleanup.cierres)
    cleanup.cierres = []
  }
})

describe('Reservas — fetchReservasPorComplejo (código real de Reservas.jsx)', () => {
  it('reservas de complejo B nunca aparecen al listar el complejo A, y viceversa', async () => {
    const { data: rA, error: eA } = await client.from('reservas').insert({
      complejo_id: complejoAId, codigo: autotestCodigo(), nombre_apellido: autotestNombre('Filtro A'),
      cabana: 'Casa Azahar I', pax: 2, fecha_entrada: '2027-01-10', fecha_salida: '2027-01-12', monto_total: 1000,
    }).select().single()
    expect(eA).toBeNull()
    cleanup.reservas.push(rA.id)

    const { data: rB, error: eB } = await client.from('reservas').insert({
      complejo_id: complejoBId, codigo: autotestCodigo(), nombre_apellido: autotestNombre('Filtro B'),
      cabana: 'Casa', pax: 2, fecha_entrada: '2027-01-10', fecha_salida: '2027-01-12', monto_total: 1000,
    }).select().single()
    expect(eB).toBeNull()
    cleanup.reservas.push(rB.id)

    const { data: listaA } = await fetchReservasPorComplejo(client, complejoAId)
    const { data: listaB } = await fetchReservasPorComplejo(client, complejoBId)

    expect(listaA.some((r) => r.id === rA.id)).toBe(true)
    expect(listaA.some((r) => r.id === rB.id)).toBe(false)
    expect(listaB.some((r) => r.id === rB.id)).toBe(true)
    expect(listaB.some((r) => r.id === rA.id)).toBe(false)
  })
})

describe('movimientos_caja — fetchMovimientosPorComplejo (código real de CajaTemporada.jsx)', () => {
  it('movimientos de complejo B nunca aparecen al listar el complejo A, y viceversa', async () => {
    const { data: mA, error: eA } = await client.from('movimientos_caja').insert({
      complejo_id: complejoAId, fecha: '2027-02-01', tipo: 'ingreso', categoria: 'alquiler',
      detalle: autotestDetalle('Filtro A'), origen: 'manual',
      monto_depositos: 500, monto_efectivo: 0, monto_otros: 0,
    }).select().single()
    expect(eA).toBeNull()
    cleanup.movimientos.push(mA.id)

    const { data: mB, error: eB } = await client.from('movimientos_caja').insert({
      complejo_id: complejoBId, fecha: '2027-02-01', tipo: 'ingreso', categoria: 'alquiler',
      detalle: autotestDetalle('Filtro B'), origen: 'manual',
      monto_depositos: 500, monto_efectivo: 0, monto_otros: 0,
    }).select().single()
    expect(eB).toBeNull()
    cleanup.movimientos.push(mB.id)

    const { data: listaA } = await fetchMovimientosPorComplejo(client, complejoAId)
    const { data: listaB } = await fetchMovimientosPorComplejo(client, complejoBId)

    expect(listaA.some((m) => m.id === mA.id)).toBe(true)
    expect(listaA.some((m) => m.id === mB.id)).toBe(false)
    expect(listaB.some((m) => m.id === mB.id)).toBe(true)
    expect(listaB.some((m) => m.id === mA.id)).toBe(false)
  })
})

describe('cierres_caja — fetchCierresPorComplejo (código real de CajaTemporada.jsx)', () => {
  it('cierres de complejo B nunca aparecen al listar el complejo A, y viceversa', async () => {
    const { data: cA, error: eA } = await client.from('cierres_caja').insert({
      complejo_id: complejoAId, nombre: autotestCierreNombre('Filtro A'),
      fecha_desde: '2027-03-01', fecha_hasta: '2027-03-31', inicio_manual: 0,
    }).select().single()
    expect(eA).toBeNull()
    cleanup.cierres.push(cA.id)

    const { data: cB, error: eB } = await client.from('cierres_caja').insert({
      complejo_id: complejoBId, nombre: autotestCierreNombre('Filtro B'),
      fecha_desde: '2027-03-01', fecha_hasta: '2027-03-31', inicio_manual: 0,
    }).select().single()
    expect(eB).toBeNull()
    cleanup.cierres.push(cB.id)

    const { data: listaA } = await fetchCierresPorComplejo(client, complejoAId)
    const { data: listaB } = await fetchCierresPorComplejo(client, complejoBId)

    expect(listaA.some((c) => c.id === cA.id)).toBe(true)
    expect(listaA.some((c) => c.id === cB.id)).toBe(false)
    expect(listaB.some((c) => c.id === cB.id)).toBe(true)
    expect(listaB.some((c) => c.id === cA.id)).toBe(false)
  })
})

describe('Ganancias.jsx (NO-VIP) — fetchMovimientosPorComplejo, mismo rango de fechas en 2 complejos', () => {
  it('la agregación de un complejo nunca incluye movimientos del otro, aunque compartan fecha', async () => {
    const fechaCompartida = '2027-04-15'

    const { data: mA, error: eA } = await client.from('movimientos_caja').insert({
      complejo_id: complejoAId, fecha: fechaCompartida, tipo: 'ingreso', categoria: 'alquiler',
      detalle: autotestDetalle('Ganancias A'), origen: 'manual',
      monto_depositos: 7000, monto_efectivo: 0, monto_otros: 0,
    }).select().single()
    expect(eA).toBeNull()
    cleanup.movimientos.push(mA.id)

    const { data: mB, error: eB } = await client.from('movimientos_caja').insert({
      complejo_id: complejoBId, fecha: fechaCompartida, tipo: 'ingreso', categoria: 'alquiler',
      detalle: autotestDetalle('Ganancias B'), origen: 'manual',
      monto_depositos: 3000, monto_efectivo: 0, monto_otros: 0,
    }).select().single()
    expect(eB).toBeNull()
    cleanup.movimientos.push(mB.id)

    const { data: listaA } = await fetchMovimientosGanancias(client, complejoAId)
    const { data: listaB } = await fetchMovimientosGanancias(client, complejoBId)

    const sumaA = listaA.filter((m) => m.id === mA.id || m.id === mB.id)
    const sumaB = listaB.filter((m) => m.id === mA.id || m.id === mB.id)

    expect(sumaA.map((m) => m.id)).toEqual([mA.id]) // sólo el propio, nunca el de B
    expect(sumaB.map((m) => m.id)).toEqual([mB.id]) // sólo el propio, nunca el de A
  })
})

// Nota: todo lo insertado en este archivo lleva AUTOTEST_ en
// nombre_apellido/detalle/nombre según corresponda (ver helpers.js), y
// se borra por id en afterEach — no depende únicamente del script de
// limpieza masiva.

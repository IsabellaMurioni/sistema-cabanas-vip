// Fase 5.3 — RLS negativo, contra staging real. Usa el usuario de test
// limitado (membresía ÚNICAMENTE en cabanas-vip) para confirmar que el
// bloqueo pasa por la base (RLS), no sólo por el filtrado de la app —
// las queries acá pasan `.eq('complejo_id', ...)` explícito apuntando
// a un complejo ajeno, saltándose por completo la lógica de la app, y
// aun así no deberían devolver ni dejar escribir nada.
//
// Requiere TEST_USER_LIMITED_EMAIL/PASSWORD (para las pruebas en sí) y
// TEST_USER_EMAIL/PASSWORD (para la limpieza vía afterEach) en
// .env.local. Si faltan, falla rápido con un error claro.
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { getFullAccessClient, getLimitedAccessClient } from '../setup/supabaseTestClient'
import { autotestNombre, autotestDetalle, autotestCodigo, getComplejoIdBySlug } from './helpers'

let limitedClient
let fullClient
let vipId
let mimmoId

const cleanup = { reservas: [], movimientos: [], caja_silvia: [] }

beforeAll(async () => {
  fullClient = await getFullAccessClient()
  limitedClient = await getLimitedAccessClient()
  vipId = await getComplejoIdBySlug(fullClient, 'cabanas-vip')
  mimmoId = await getComplejoIdBySlug(fullClient, 'mimmo')
})

afterEach(async () => {
  // Limpieza con el cliente de acceso completo — el limitado sólo
  // podría borrar lo suyo en cabanas-vip igual, pero se usa el
  // completo acá para que esta suite no dependa de que ESO también
  // funcione (es justamente parte de lo que se está probando).
  if (cleanup.reservas.length) {
    await fullClient.from('reservas').delete().in('id', cleanup.reservas)
    cleanup.reservas = []
  }
  if (cleanup.movimientos.length) {
    await fullClient.from('movimientos_caja').delete().in('id', cleanup.movimientos)
    cleanup.movimientos = []
  }
  if (cleanup.caja_silvia.length) {
    await fullClient.from('caja_silvia').delete().in('id', cleanup.caja_silvia)
    cleanup.caja_silvia = []
  }
})

describe('Sanity — el usuario limitado SÍ puede operar dentro de su propio complejo (cabanas-vip)', () => {
  it('puede insertar y leer una fila de caja_silvia en cabanas-vip', async () => {
    // caja_silvia, no movimientos_caja: TEST_USER_LIMITED tiene
    // rol='limitado_caja_silvia' en cabanas-vip (021_membresias_rol.sql
    // / 024_membresias_rol_limitado_reservas.sql) — caja_silvia es
    // justamente la ÚNICA tabla de Caja a la que ese rol tiene acceso.
    // movimientos_caja (usado acá originalmente, en Fase 5.3, antes de
    // que `rol` existiera) ni siquiera aplica a Cabañas VIP en la
    // práctica, y desde 024 exige rol='completo' — este usuario
    // correctamente dejó de poder escribir ahí, así que ya no sirve
    // para probar "puede operar dentro de su propio complejo".
    const { data, error } = await limitedClient.from('caja_silvia').insert({
      complejo_id: vipId, fecha: '2027-05-01', detalle: autotestDetalle('RLS sanity'), ingreso_pesos: 100,
    }).select().single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    cleanup.caja_silvia.push(data.id)

    const { data: leido, error: errLeer } = await limitedClient
      .from('caja_silvia').select('*').eq('id', data.id).single()
    expect(errLeer).toBeNull()
    expect(leido.id).toBe(data.id)
  })

  it('puede insertar y leer una reserva en cabanas-vip', async () => {
    const { data, error } = await limitedClient.from('reservas').insert({
      complejo_id: vipId, codigo: autotestCodigo(), nombre_apellido: autotestNombre('RLS sanity'),
      cabana: 'Bahama', pax: 2, fecha_entrada: '2027-05-10', fecha_salida: '2027-05-12', monto_total: 1000,
    }).select().single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    cleanup.reservas.push(data.id)

    const { data: leido, error: errLeer } = await limitedClient
      .from('reservas').select('*').eq('id', data.id).single()
    expect(errLeer).toBeNull()
    expect(leido.id).toBe(data.id)
  })
})

describe('RLS bloquea SELECT a un complejo ajeno, aun con .eq(complejo_id) explícito', () => {
  it('movimientos_caja de Mimmo: 0 filas para el usuario limitado', async () => {
    const { data, error } = await limitedClient.from('movimientos_caja').select('*').eq('complejo_id', mimmoId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('reservas de Mimmo: 0 filas para el usuario limitado', async () => {
    const { data, error } = await limitedClient.from('reservas').select('*').eq('complejo_id', mimmoId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('cierres_caja de Mimmo: 0 filas para el usuario limitado', async () => {
    const { data, error } = await limitedClient.from('cierres_caja').select('*').eq('complejo_id', mimmoId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('RLS bloquea INSERT en un complejo ajeno', () => {
  it('insertar movimientos_caja con complejo_id de Mimmo es rechazado', async () => {
    const { data, error } = await limitedClient.from('movimientos_caja').insert({
      complejo_id: mimmoId, fecha: '2027-05-01', tipo: 'ingreso', categoria: 'alquiler',
      detalle: autotestDetalle('RLS insert denegado'), origen: 'manual',
      monto_depositos: 100, monto_efectivo: 0, monto_otros: 0,
    }).select()

    // Si por algún motivo NO fue rechazado, hay que poder limpiarlo
    // igual — no asumir que el error siempre está presente antes de
    // decidir si hay algo que borrar.
    if (data && data.length > 0) cleanup.movimientos.push(...data.map((r) => r.id))

    expect(error).toBeTruthy()
    expect(data == null || data.length === 0).toBe(true)
  })

  it('insertar una reserva con complejo_id de Mimmo es rechazado', async () => {
    const { data, error } = await limitedClient.from('reservas').insert({
      complejo_id: mimmoId, codigo: autotestCodigo(), nombre_apellido: autotestNombre('RLS insert denegado'),
      cabana: 'Cabaña Mimmo I', pax: 2, fecha_entrada: '2027-05-20', fecha_salida: '2027-05-22', monto_total: 1000,
    }).select()

    if (data && data.length > 0) cleanup.reservas.push(...data.map((r) => r.id))

    expect(error).toBeTruthy()
    expect(data == null || data.length === 0).toBe(true)
  })
})

// Fase 6 — RLS de rol='limitado_caja_silvia' (021_membresias_rol.sql) Y
// rol='limitado_reservas' (024_membresias_rol_limitado_reservas.sql),
// contra staging real. TEST_USER_LIMITED tiene DOS membresías:
//   - cabanas-vip, rol='limitado_caja_silvia' (como ya estaba).
//   - los-amigos,  rol='limitado_reservas'    (nueva, para este archivo).
// No hay forma de darlas de alta desde el cliente (`membresias` sólo
// tiene política de SELECT, ninguna de INSERT/UPDATE, a propósito:
// nadie debería poder auto-otorgarse una membresía). La segunda fila
// quedó dada de alta a mano, una única vez — ver el reporte de esta
// tarea para el INSERT puntual que hizo falta correr. Se eligió
// los-amigos (no mimmo, ya usado por otros archivos de esta suite) para
// no pisar ningún otro test, y reusar el mismo TEST_USER_LIMITED en vez
// de un tercer usuario — sus otros usos ya probados (reservas,
// movimientos_caja, cierres_caja vía la membresía de cabanas-vip — ver
// rls-enforcement.test.js) no se ven afectados por agregarle una
// SEGUNDA fila en un complejo distinto.
//
// Confirma que rol='limitado_caja_silvia' bloquea, a nivel de base, a
// caja_juli / caja_banco / caja_mercado_pago — incluso con
// `.eq(complejo_id, vipId)` explícito, apuntando al ÚNICO complejo
// donde este usuario sí tiene membresía — mientras sigue pudiendo
// leer/escribir reservas y caja_silvia con total normalidad (esas dos
// tablas no cambiaron: sus políticas RLS no hacen referencia a `rol`).
//
// Y que rol='limitado_reservas' bloquea, a nivel de base, TODO lo de
// Caja — movimientos_caja/cierres_caja/cierre_reconciliacion/
// cierre_reparto_ganancia (las 4 tablas NO-VIP, usando la membresía real
// en los-amigos) Y caja_silvia/caja_juli/caja_banco/caja_mercado_pago
// (las 4 de VIP — probadas con filas AUTOTEST_ apuntando al complejo_id
// de los-amigos, no al de VIP: estas 4 tablas no tienen ningún CHECK que
// las ate a un complejo puntual, así que apuntar a los-amigos ejercita
// la MISMA condición de RLS con datos que nunca existirían así en la
// vida real, sin necesitar una segunda membresía de este usuario en
// cabanas-vip, que ya está ocupada por 'limitado_caja_silvia' — un
// usuario sólo puede tener UNA fila de membresía por complejo) —
// mientras sigue pudiendo leer/escribir reservas con total normalidad
// (esa tabla no cambió, ver la consigna: "reservas stays accessible to
// any rol").
//
// Desde 025_precios_acceso_roles_limitados.sql, periodos_precios y
// precios_pax dejaron de estar en la lista de tablas bloqueadas para
// estos dos roles — tienen acceso COMPLETO (SELECT/INSERT/UPDATE/
// DELETE) ahí, scopeado por complejo_id vía membresias exactamente
// igual que 'completo'. Ver las 2 describe blocks dedicadas más abajo.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { getFullAccessClient, getLimitedAccessClient } from '../setup/supabaseTestClient'
import { autotestNombre, autotestDetalle, autotestCodigo, autotestCierreNombre, getComplejoIdBySlug } from './helpers'

let limitedClient
let fullClient
let vipId
let losAmigosId
let mimmoId // usado sólo como "complejo ajeno" (0 membresías de este usuario ahí, con ningún rol) para confirmar que el scoping por complejo_id sigue vivo incluso para Precios.
let periodoVipId // período AUTOTEST_ propio y descartable, sólo para precios_pax — nunca se toca un período real de precios de Cabañas VIP.

const cleanup = {
  caja_juli: [], caja_banco: [], caja_mercado_pago: [], caja_silvia: [], periodos_precios: [], reservas: [],
  movimientos_caja: [], cierres_caja: [],
}

beforeAll(async () => {
  fullClient = await getFullAccessClient()
  limitedClient = await getLimitedAccessClient()
  vipId = await getComplejoIdBySlug(fullClient, 'cabanas-vip')
  losAmigosId = await getComplejoIdBySlug(fullClient, 'los-amigos')
  mimmoId = await getComplejoIdBySlug(fullClient, 'mimmo')

  const { data: periodo, error } = await fullClient
    .from('periodos_precios')
    .insert({ complejo_id: vipId, nombre: autotestDetalle('periodo rol'), fecha_inicio: '2099-01-01' })
    .select()
    .single()
  if (error || !periodo) {
    throw new Error(`[rol-limitado.test.js] No se pudo crear el período AUTOTEST_ de setup para precios_pax: ${error?.message}`)
  }
  periodoVipId = periodo.id

  // Una fila real de precios_pax bajo ese período, para que el chequeo
  // de SELECT de más abajo tenga algo concreto que debería estar
  // oculto (no un simple "no hay nada, así que 0 filas no prueba nada").
  const { error: errPax } = await fullClient
    .from('precios_pax')
    .insert({ periodo_id: periodoVipId, pax: 2, precio_noche: 1, precio_semana: 1 })
  if (errPax) {
    throw new Error(`[rol-limitado.test.js] No se pudo crear la fila AUTOTEST_ de precios_pax de setup: ${errPax.message}`)
  }
})

afterAll(async () => {
  // Cascada: borrar el período se lleva puesta cualquier fila de
  // precios_pax que cuelgue de él (periodo_id ... on delete cascade).
  if (periodoVipId) {
    await fullClient.from('periodos_precios').delete().eq('id', periodoVipId)
  }
})

afterEach(async () => {
  for (const [tabla, ids] of Object.entries(cleanup)) {
    if (ids.length) {
      await fullClient.from(tabla).delete().in('id', ids)
      cleanup[tabla] = []
    }
  }
})

describe('Sanity — rol="limitado_caja_silvia" sigue con acceso total a reservas y caja_silvia', () => {
  it('puede insertar y leer una reserva en cabanas-vip', async () => {
    const { data, error } = await limitedClient.from('reservas').insert({
      complejo_id: vipId, codigo: autotestCodigo(), nombre_apellido: autotestNombre('rol sanity reserva'),
      cabana: 'Bahama', pax: 2, fecha_entrada: '2099-01-10', fecha_salida: '2099-01-12', monto_total: 1000,
    }).select().single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    cleanup.reservas.push(data.id)

    const { data: leido, error: errLeer } = await limitedClient.from('reservas').select('*').eq('id', data.id).single()
    expect(errLeer).toBeNull()
    expect(leido.id).toBe(data.id)
  })

  it('puede insertar y leer una fila de caja_silvia en cabanas-vip', async () => {
    const { data, error } = await limitedClient.from('caja_silvia').insert({
      complejo_id: vipId, fecha: '2099-01-10', detalle: autotestDetalle('rol sanity silvia'), ingreso_pesos: 100,
    }).select().single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    cleanup.caja_silvia.push(data.id)

    const { data: leido, error: errLeer } = await limitedClient.from('caja_silvia').select('*').eq('id', data.id).single()
    expect(errLeer).toBeNull()
    expect(leido.id).toBe(data.id)
  })
})

describe('RLS bloquea SELECT de caja_juli/caja_banco/caja_mercado_pago para rol="limitado_caja_silvia", aun con .eq(complejo_id) explícito al propio complejo', () => {
  it('caja_juli: 0 filas para el usuario limitado, aunque exista una real', async () => {
    const { data: creada, error: errCrear } = await fullClient.from('caja_juli').insert({
      complejo_id: vipId, fecha: '2099-01-10', seccion: 'main', tipo_main: 'ingreso',
      detalle: autotestDetalle('rol select bloqueado juli'), importe: 50,
    }).select().single()
    expect(errCrear).toBeNull()
    cleanup.caja_juli.push(creada.id)

    const { data, error } = await limitedClient.from('caja_juli').select('*').eq('complejo_id', vipId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('caja_banco: 0 filas para el usuario limitado, aunque exista una real', async () => {
    const { data: creada, error: errCrear } = await fullClient.from('caja_banco').insert({
      complejo_id: vipId, fecha: '2099-01-10', detalle: autotestDetalle('rol select bloqueado banco'), ingreso: 50,
    }).select().single()
    expect(errCrear).toBeNull()
    cleanup.caja_banco.push(creada.id)

    const { data, error } = await limitedClient.from('caja_banco').select('*').eq('complejo_id', vipId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('caja_mercado_pago: 0 filas para el usuario limitado, aunque exista una real', async () => {
    const { data: creada, error: errCrear } = await fullClient.from('caja_mercado_pago').insert({
      complejo_id: vipId, fecha: '2099-01-10', detalle: autotestDetalle('rol select bloqueado mp'), ingreso: 50,
    }).select().single()
    expect(errCrear).toBeNull()
    cleanup.caja_mercado_pago.push(creada.id)

    const { data, error } = await limitedClient.from('caja_mercado_pago').select('*').eq('complejo_id', vipId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('RLS bloquea INSERT de caja_juli/caja_banco/caja_mercado_pago para rol="limitado_caja_silvia", aun apuntando al propio complejo', () => {
  it('insertar en caja_juli es rechazado', async () => {
    const { data, error } = await limitedClient.from('caja_juli').insert({
      complejo_id: vipId, fecha: '2099-01-11', seccion: 'main', tipo_main: 'ingreso',
      detalle: autotestDetalle('rol insert denegado juli'), importe: 50,
    }).select()
    if (data && data.length > 0) cleanup.caja_juli.push(...data.map((r) => r.id))
    expect(error).toBeTruthy()
    expect(data == null || data.length === 0).toBe(true)
  })

  it('insertar en caja_banco es rechazado', async () => {
    const { data, error } = await limitedClient.from('caja_banco').insert({
      complejo_id: vipId, fecha: '2099-01-11', detalle: autotestDetalle('rol insert denegado banco'), ingreso: 50,
    }).select()
    if (data && data.length > 0) cleanup.caja_banco.push(...data.map((r) => r.id))
    expect(error).toBeTruthy()
    expect(data == null || data.length === 0).toBe(true)
  })

  it('insertar en caja_mercado_pago es rechazado', async () => {
    const { data, error } = await limitedClient.from('caja_mercado_pago').insert({
      complejo_id: vipId, fecha: '2099-01-11', detalle: autotestDetalle('rol insert denegado mp'), ingreso: 50,
    }).select()
    if (data && data.length > 0) cleanup.caja_mercado_pago.push(...data.map((r) => r.id))
    expect(error).toBeTruthy()
    expect(data == null || data.length === 0).toBe(true)
  })
})

describe('rol="limitado_caja_silvia" tiene acceso COMPLETO a Precios en cabanas-vip (025_precios_acceso_roles_limitados.sql)', () => {
  it('puede ver (SELECT) el período AUTOTEST_ de setup y su fila de precios_pax', async () => {
    const { data: periodos, error: errP } = await limitedClient.from('periodos_precios').select('*').eq('id', periodoVipId)
    expect(errP).toBeNull()
    expect(periodos).toHaveLength(1)

    const { data: precios, error: errPP } = await limitedClient.from('precios_pax').select('*').eq('periodo_id', periodoVipId)
    expect(errPP).toBeNull()
    expect(precios.length).toBeGreaterThan(0)
  })

  it('puede insertar (INSERT) un nuevo período en cabanas-vip', async () => {
    const { data, error } = await limitedClient.from('periodos_precios').insert({
      complejo_id: vipId, nombre: autotestDetalle('periodo silvia insert'), fecha_inicio: '2099-05-01',
    }).select().single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    cleanup.periodos_precios.push(data.id)
  })

  it('puede insertar (INSERT) una fila de precios_pax bajo el período AUTOTEST_ de setup', async () => {
    const { data, error } = await limitedClient.from('precios_pax').insert({
      periodo_id: periodoVipId, pax: 4, precio_noche: 999, precio_semana: 999,
    }).select().single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    // Sin cleanup propio: cascadea con el período AUTOTEST_ de setup en el afterAll de arriba.
  })

  it('puede actualizar (UPDATE) una fila de precios_pax existente', async () => {
    const { data: fila } = await fullClient.from('precios_pax').select('id').eq('periodo_id', periodoVipId).eq('pax', 2).single()
    const { data, error } = await limitedClient.from('precios_pax').update({ precio_noche: 12345 }).eq('id', fila.id).select().single()
    expect(error).toBeNull()
    expect(data.precio_noche).toBe(12345)
  })

  it('puede borrar (DELETE) un período de precios propio', async () => {
    const { data: nuevo, error: errCrear } = await fullClient.from('periodos_precios').insert({
      complejo_id: vipId, nombre: autotestDetalle('periodo silvia delete'), fecha_inicio: '2099-06-01',
    }).select().single()
    expect(errCrear).toBeNull()
    // Registrado ANTES de intentar el delete: si limitedClient no llega
    // a poder borrarlo (ej. este test corriendo antes de que la
    // migración 025 esté aplicada), el afterEach de arriba lo limpia
    // igual — nunca queda AUTOTEST_ colgado por un delete que falló.
    cleanup.periodos_precios.push(nuevo.id)

    const { error } = await limitedClient.from('periodos_precios').delete().eq('id', nuevo.id)
    expect(error).toBeNull()

    const { data: verif } = await fullClient.from('periodos_precios').select('id').eq('id', nuevo.id)
    expect(verif).toEqual([])
  })

  it('sigue SIN acceso a Precios de un complejo ajeno (mimmo) — el scoping por complejo_id sigue vivo', async () => {
    const { data: creado, error: errCrear } = await fullClient.from('periodos_precios').insert({
      complejo_id: mimmoId, nombre: autotestDetalle('periodo ajeno silvia'), fecha_inicio: '2099-07-01',
    }).select().single()
    expect(errCrear).toBeNull()
    cleanup.periodos_precios.push(creado.id)

    const { data, error } = await limitedClient.from('periodos_precios').select('*').eq('id', creado.id)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('Sanity — rol="limitado_reservas" sigue con acceso total a reservas (en los-amigos)', () => {
  it('puede insertar y leer una reserva en los-amigos', async () => {
    const { data, error } = await limitedClient.from('reservas').insert({
      complejo_id: losAmigosId, codigo: autotestCodigo(), nombre_apellido: autotestNombre('rol reservas sanity'),
      cabana: 'Casa', pax: 2, fecha_entrada: '2099-01-10', fecha_salida: '2099-01-12', monto_total: 1000,
    }).select().single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    cleanup.reservas.push(data.id)

    const { data: leido, error: errLeer } = await limitedClient.from('reservas').select('*').eq('id', data.id).single()
    expect(errLeer).toBeNull()
    expect(leido.id).toBe(data.id)
  })
})

describe('RLS bloquea rol="limitado_reservas" en las 4 tablas NO-VIP de Caja (movimientos_caja/cierres_caja/cierre_reconciliacion/cierre_reparto_ganancia), en los-amigos', () => {
  it('movimientos_caja: SELECT 0 filas aunque exista una real, e INSERT rechazado', async () => {
    const { data: creado, error: errCrear } = await fullClient.from('movimientos_caja').insert({
      complejo_id: losAmigosId, fecha: '2099-01-10', tipo: 'ingreso', categoria: 'alquiler',
      detalle: autotestDetalle('rol reservas select bloqueado movcaja'), origen: 'manual',
      monto_depositos: 100, monto_efectivo: 0, monto_otros: 0,
    }).select().single()
    expect(errCrear).toBeNull()
    cleanup.movimientos_caja.push(creado.id)

    const { data: vistos, error: errSelect } = await limitedClient.from('movimientos_caja').select('*').eq('complejo_id', losAmigosId)
    expect(errSelect).toBeNull()
    expect(vistos).toEqual([])

    const { data: insertado, error: errInsert } = await limitedClient.from('movimientos_caja').insert({
      complejo_id: losAmigosId, fecha: '2099-01-11', tipo: 'ingreso', categoria: 'alquiler',
      detalle: autotestDetalle('rol reservas insert denegado movcaja'), origen: 'manual',
      monto_depositos: 100, monto_efectivo: 0, monto_otros: 0,
    }).select()
    if (insertado && insertado.length > 0) cleanup.movimientos_caja.push(...insertado.map((r) => r.id))
    expect(errInsert).toBeTruthy()
    expect(insertado == null || insertado.length === 0).toBe(true)
  })

  it('cierres_caja: SELECT 0 filas aunque exista uno real, e INSERT rechazado', async () => {
    const { data: creado, error: errCrear } = await fullClient.from('cierres_caja').insert({
      complejo_id: losAmigosId, nombre: autotestCierreNombre('rol reservas select bloqueado'),
      fecha_desde: '2099-01-01', fecha_hasta: '2099-01-31', inicio_manual: 0,
    }).select().single()
    expect(errCrear).toBeNull()
    cleanup.cierres_caja.push(creado.id)

    const { data: vistos, error: errSelect } = await limitedClient.from('cierres_caja').select('*').eq('complejo_id', losAmigosId)
    expect(errSelect).toBeNull()
    expect(vistos).toEqual([])

    const { data: insertado, error: errInsert } = await limitedClient.from('cierres_caja').insert({
      complejo_id: losAmigosId, nombre: autotestCierreNombre('rol reservas insert denegado'),
      fecha_desde: '2099-02-01', fecha_hasta: '2099-02-28', inicio_manual: 0,
    }).select()
    if (insertado && insertado.length > 0) cleanup.cierres_caja.push(...insertado.map((r) => r.id))
    expect(errInsert).toBeTruthy()
    expect(insertado == null || insertado.length === 0).toBe(true)
  })

  it('cierre_reconciliacion: SELECT 0 filas e INSERT rechazado, sobre un cierre real ya creado', async () => {
    const { data: cierre, error: errCierre } = await fullClient.from('cierres_caja').insert({
      complejo_id: losAmigosId, nombre: autotestCierreNombre('rol reservas reconciliacion'),
      fecha_desde: '2099-03-01', fecha_hasta: '2099-03-31', inicio_manual: 0,
    }).select().single()
    expect(errCierre).toBeNull()
    cleanup.cierres_caja.push(cierre.id)

    const { error: errCrear } = await fullClient.from('cierre_reconciliacion').insert({
      complejo_id: losAmigosId, cierre_id: cierre.id, concepto: 'Efectivo', monto: 100,
    })
    expect(errCrear).toBeNull()

    const { data: vistos, error: errSelect } = await limitedClient.from('cierre_reconciliacion').select('*').eq('complejo_id', losAmigosId)
    expect(errSelect).toBeNull()
    expect(vistos).toEqual([])

    const { data: insertado, error: errInsert } = await limitedClient.from('cierre_reconciliacion').insert({
      complejo_id: losAmigosId, cierre_id: cierre.id, concepto: 'Banco', monto: 50,
    }).select()
    expect(errInsert).toBeTruthy()
    expect(insertado == null || insertado.length === 0).toBe(true)
    // Sin cleanup propio: cascadea con el cierre de arriba (cierre_id ... on delete cascade).
  })

  it('cierre_reparto_ganancia: SELECT 0 filas e INSERT rechazado, sobre un cierre real ya creado', async () => {
    const { data: cierre, error: errCierre } = await fullClient.from('cierres_caja').insert({
      complejo_id: losAmigosId, nombre: autotestCierreNombre('rol reservas reparto'),
      fecha_desde: '2099-04-01', fecha_hasta: '2099-04-30', inicio_manual: 0,
    }).select().single()
    expect(errCierre).toBeNull()
    cleanup.cierres_caja.push(cierre.id)

    const { error: errCrear } = await fullClient.from('cierre_reparto_ganancia').insert({
      complejo_id: losAmigosId, cierre_id: cierre.id, persona: 'Socio 1', monto: 100,
    })
    expect(errCrear).toBeNull()

    const { data: vistos, error: errSelect } = await limitedClient.from('cierre_reparto_ganancia').select('*').eq('complejo_id', losAmigosId)
    expect(errSelect).toBeNull()
    expect(vistos).toEqual([])

    const { data: insertado, error: errInsert } = await limitedClient.from('cierre_reparto_ganancia').insert({
      complejo_id: losAmigosId, cierre_id: cierre.id, persona: 'Socio 2', monto: 50,
    }).select()
    expect(errInsert).toBeTruthy()
    expect(insertado == null || insertado.length === 0).toBe(true)
    // Sin cleanup propio: cascadea con el cierre de arriba.
  })
})

describe('RLS bloquea rol="limitado_reservas" en las 4 tablas de Caja de VIP también (caja_silvia incluida)', () => {
  // Estas 4 tablas no tienen ningún CHECK que las ate a un complejo_id
  // puntual — apuntar a los-amigos (donde este usuario SÍ tiene una
  // membresía real, con rol='limitado_reservas') ejercita exactamente
  // la misma condición de RLS que se aplicaría en cabanas-vip, sin
  // necesitar una segunda fila de este usuario ahí (ya ocupada por
  // 'limitado_caja_silvia' — un usuario sólo puede tener una fila de
  // membresía por complejo).
  it('caja_silvia: bloqueada para rol="limitado_reservas" — a diferencia de "limitado_caja_silvia", que SÍ la ve', async () => {
    const { data: creada, error: errCrear } = await fullClient.from('caja_silvia').insert({
      complejo_id: losAmigosId, fecha: '2099-01-10', detalle: autotestDetalle('rol reservas bloqueado silvia'), ingreso_pesos: 100,
    }).select().single()
    expect(errCrear).toBeNull()
    cleanup.caja_silvia.push(creada.id)

    const { data: vistos, error: errSelect } = await limitedClient.from('caja_silvia').select('*').eq('complejo_id', losAmigosId)
    expect(errSelect).toBeNull()
    expect(vistos).toEqual([])

    const { data: insertado, error: errInsert } = await limitedClient.from('caja_silvia').insert({
      complejo_id: losAmigosId, fecha: '2099-01-11', detalle: autotestDetalle('rol reservas insert denegado silvia'), ingreso_pesos: 50,
    }).select()
    if (insertado && insertado.length > 0) cleanup.caja_silvia.push(...insertado.map((r) => r.id))
    expect(errInsert).toBeTruthy()
    expect(insertado == null || insertado.length === 0).toBe(true)
  })

  it('caja_juli: bloqueada para rol="limitado_reservas"', async () => {
    const { data: creada, error: errCrear } = await fullClient.from('caja_juli').insert({
      complejo_id: losAmigosId, fecha: '2099-01-10', seccion: 'main', tipo_main: 'ingreso',
      detalle: autotestDetalle('rol reservas bloqueado juli'), importe: 50,
    }).select().single()
    expect(errCrear).toBeNull()
    cleanup.caja_juli.push(creada.id)

    const { data: vistos, error: errSelect } = await limitedClient.from('caja_juli').select('*').eq('complejo_id', losAmigosId)
    expect(errSelect).toBeNull()
    expect(vistos).toEqual([])
  })

  it('caja_banco: bloqueada para rol="limitado_reservas"', async () => {
    const { data: creada, error: errCrear } = await fullClient.from('caja_banco').insert({
      complejo_id: losAmigosId, fecha: '2099-01-10', detalle: autotestDetalle('rol reservas bloqueado banco'), ingreso: 50,
    }).select().single()
    expect(errCrear).toBeNull()
    cleanup.caja_banco.push(creada.id)

    const { data: vistos, error: errSelect } = await limitedClient.from('caja_banco').select('*').eq('complejo_id', losAmigosId)
    expect(errSelect).toBeNull()
    expect(vistos).toEqual([])
  })

  it('caja_mercado_pago: bloqueada para rol="limitado_reservas"', async () => {
    const { data: creada, error: errCrear } = await fullClient.from('caja_mercado_pago').insert({
      complejo_id: losAmigosId, fecha: '2099-01-10', detalle: autotestDetalle('rol reservas bloqueado mp'), ingreso: 50,
    }).select().single()
    expect(errCrear).toBeNull()
    cleanup.caja_mercado_pago.push(creada.id)

    const { data: vistos, error: errSelect } = await limitedClient.from('caja_mercado_pago').select('*').eq('complejo_id', losAmigosId)
    expect(errSelect).toBeNull()
    expect(vistos).toEqual([])
  })
})

describe('rol="limitado_reservas" tiene acceso COMPLETO a Precios en los-amigos (025_precios_acceso_roles_limitados.sql)', () => {
  // Período AUTOTEST_ propio de esta describe (no el de VIP, ya usado
  // por el bloque de 'limitado_caja_silvia' más arriba) — este usuario
  // sólo tiene membresía con rol='limitado_reservas' en los-amigos.
  let periodoLosAmigosId

  beforeAll(async () => {
    const { data, error } = await fullClient.from('periodos_precios').insert({
      complejo_id: losAmigosId, nombre: autotestDetalle('periodo reservas setup'), fecha_inicio: '2099-01-01',
    }).select().single()
    if (error || !data) {
      throw new Error(`[rol-limitado.test.js] No se pudo crear el período AUTOTEST_ de setup en los-amigos: ${error?.message}`)
    }
    periodoLosAmigosId = data.id

    const { error: errPax } = await fullClient.from('precios_pax').insert({
      periodo_id: periodoLosAmigosId, pax: 2, precio_noche: 1, precio_semana: 1,
    })
    if (errPax) {
      throw new Error(`[rol-limitado.test.js] No se pudo crear la fila AUTOTEST_ de precios_pax de setup en los-amigos: ${errPax.message}`)
    }
  })

  afterAll(async () => {
    // Cascada: se lleva puesta cualquier fila de precios_pax colgando de él.
    if (periodoLosAmigosId) {
      await fullClient.from('periodos_precios').delete().eq('id', periodoLosAmigosId)
    }
  })

  it('puede ver (SELECT) el período AUTOTEST_ de setup y su fila de precios_pax', async () => {
    const { data: periodos, error: errP } = await limitedClient.from('periodos_precios').select('*').eq('id', periodoLosAmigosId)
    expect(errP).toBeNull()
    expect(periodos).toHaveLength(1)

    const { data: precios, error: errPP } = await limitedClient.from('precios_pax').select('*').eq('periodo_id', periodoLosAmigosId)
    expect(errPP).toBeNull()
    expect(precios.length).toBeGreaterThan(0)
  })

  it('puede insertar (INSERT) un nuevo período en los-amigos', async () => {
    const { data, error } = await limitedClient.from('periodos_precios').insert({
      complejo_id: losAmigosId, nombre: autotestDetalle('periodo reservas insert'), fecha_inicio: '2099-05-01',
    }).select().single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    cleanup.periodos_precios.push(data.id)
  })

  it('puede insertar (INSERT) una fila de precios_pax bajo el período AUTOTEST_ de setup', async () => {
    const { data, error } = await limitedClient.from('precios_pax').insert({
      periodo_id: periodoLosAmigosId, pax: 4, precio_noche: 999, precio_semana: 999,
    }).select().single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    // Sin cleanup propio: cascadea con el período AUTOTEST_ de setup en el afterAll de esta describe.
  })

  it('puede actualizar (UPDATE) una fila de precios_pax existente', async () => {
    const { data: fila } = await fullClient.from('precios_pax').select('id').eq('periodo_id', periodoLosAmigosId).eq('pax', 2).single()
    const { data, error } = await limitedClient.from('precios_pax').update({ precio_noche: 54321 }).eq('id', fila.id).select().single()
    expect(error).toBeNull()
    expect(data.precio_noche).toBe(54321)
  })

  it('puede borrar (DELETE) un período de precios propio', async () => {
    const { data: nuevo, error: errCrear } = await fullClient.from('periodos_precios').insert({
      complejo_id: losAmigosId, nombre: autotestDetalle('periodo reservas delete'), fecha_inicio: '2099-06-01',
    }).select().single()
    expect(errCrear).toBeNull()
    // Registrado ANTES de intentar el delete — mismo motivo que el test
    // equivalente de 'limitado_caja_silvia' más arriba.
    cleanup.periodos_precios.push(nuevo.id)

    const { error } = await limitedClient.from('periodos_precios').delete().eq('id', nuevo.id)
    expect(error).toBeNull()

    const { data: verif } = await fullClient.from('periodos_precios').select('id').eq('id', nuevo.id)
    expect(verif).toEqual([])
  })

  it('sigue SIN acceso a Precios de un complejo ajeno (mimmo) — el scoping por complejo_id sigue vivo', async () => {
    const { data: creado, error: errCrear } = await fullClient.from('periodos_precios').insert({
      complejo_id: mimmoId, nombre: autotestDetalle('periodo ajeno reservas'), fecha_inicio: '2099-07-01',
    }).select().single()
    expect(errCrear).toBeNull()
    cleanup.periodos_precios.push(creado.id)

    const { data, error } = await limitedClient.from('periodos_precios').select('*').eq('id', creado.id)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

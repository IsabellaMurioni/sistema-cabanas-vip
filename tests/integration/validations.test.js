// Fase 5.3 — validaciones DB-dependientes, contra staging real. Usa el
// usuario de test de acceso completo. Todo se crea/borra en el
// complejo "mimmo" (elegido como ejemplo de complejo NO-VIP para tener
// variedad frente a los otros suites, que usan casas-azahar/los-amigos).
//
// IMPORTANTE — hallazgo a tener en cuenta leyendo este archivo: el
// tope de sobrepago y el candado de período cerrado NO tienen ningún
// constraint a nivel de base — son 100% responsabilidad del código de
// la app (excedeSaldoReserva / cierreQueContiene-fechaEstaCerrada). El
// mínimo de "$0 combinado entre 3 campos" tampoco lo tiene (un CHECK de
// columna no puede expresar esa regla) — pero desde la migración 020,
// SÍ hay un backstop de base para valores negativos puntuales
// (monto_depositos/monto_efectivo/monto_otros >= 0 cada uno). Estos
// tests documentan cada caso explícitamente en vez de asumir qué
// protege la base — ver el reporte para el detalle.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { getFullAccessClient } from '../setup/supabaseTestClient'
import { validarMontoMovimiento } from '../../src/pages/CajaTemporada'
import { totalPagadoReserva, excedeSaldoReserva } from '../../src/lib/pagosReserva'
import { getConflicto, fetchReservasOcupadasPorCabana } from '../../src/pages/ReservaForm'
import { rangosSolapan, cierreQueContiene, fechaEstaCerrada } from '../../src/lib/cierres'
import { autotestNombre, autotestDetalle, autotestCierreNombre, autotestCodigo, getComplejoIdBySlug } from './helpers'

let client
let mimmoId
let losAmigosId

const cleanup = { reservas: [], movimientos: [], cierres: [] }

beforeAll(async () => {
  client = await getFullAccessClient()
  mimmoId = await getComplejoIdBySlug(client, 'mimmo')
  losAmigosId = await getComplejoIdBySlug(client, 'los-amigos')
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
    // cierre_reconciliacion/cierre_reparto_ganancia cascadean solos.
    await client.from('cierres_caja').delete().in('id', cleanup.cierres)
    cleanup.cierres = []
  }
})

describe('$0/monto negativo', () => {
  it('validarMontoMovimiento (código real) bloquea el intento antes de llegar a la base', () => {
    expect(validarMontoMovimiento('ingreso', 0, 0, 0).valido).toBe(false)
    expect(validarMontoMovimiento('ingreso', 0, 0.01, 0).valido).toBe(true)
  })

  it('un insert en $0 (los 3 campos) que se saltee el form se acepta igual — el mínimo "> $0" sigue siendo 100% del form, sin backstop de base (a propósito: un CHECK de columna no puede expresar "la suma de 3 campos > 0")', async () => {
    const { data, error } = await client.from('movimientos_caja').insert({
      complejo_id: mimmoId, fecha: '2027-06-01', tipo: 'ingreso', categoria: 'alquiler',
      detalle: autotestDetalle('Monto cero bypass'), origen: 'manual',
      monto_depositos: 0, monto_efectivo: 0, monto_otros: 0,
    }).select()
    if (data?.length) cleanup.movimientos.push(...data.map((r) => r.id))
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  // Migración 020: monto_depositos/monto_efectivo/monto_otros ahora
  // tienen un CHECK >= 0 cada uno en la base — este backstop SÍ existe
  // (a diferencia del "> $0 combinado" de arriba, que sigue siendo
  // sólo del form). Se bypasea validarMontoMovimiento a propósito,
  // insertando negativo directo con el cliente, para probar que la
  // base misma lo rechaza — no sólo la UI.
  it.each([
    ['monto_depositos', { monto_depositos: -100, monto_efectivo: 0, monto_otros: 0 }],
    ['monto_efectivo',  { monto_depositos: 0, monto_efectivo: -50, monto_otros: 0 }],
    ['monto_otros',     { monto_depositos: 0, monto_efectivo: 0, monto_otros: -25 }],
  ])('la base rechaza %s negativo con un CHECK constraint (migración 020), bypaseando validarMontoMovimiento', async (columna, montos) => {
    const { data, error } = await client.from('movimientos_caja').insert({
      complejo_id: mimmoId, fecha: '2027-06-01', tipo: 'ingreso', categoria: 'alquiler',
      detalle: autotestDetalle(`Monto negativo bypass ${columna}`), origen: 'manual',
      ...montos,
    }).select()

    // Si el insert pasó igual (ej. la migración 020 todavía no se
    // corrió en este ambiente), no hay que dejar la fila mala colgada
    // — se limpia antes de fallar el assert.
    if (data?.length) cleanup.movimientos.push(...data.map((r) => r.id))

    expect(error).toBeTruthy()
    expect(data == null || data.length === 0).toBe(true)
  })
})

describe('Sobrepago', () => {
  it('excedeSaldoReserva (código real) contra una reserva real bloquea un pago que superaría el precio', async () => {
    const precioTotal = 5000
    const { data: reserva, error } = await client.from('reservas').insert({
      complejo_id: mimmoId, codigo: autotestCodigo(), nombre_apellido: autotestNombre('Sobrepago'),
      cabana: 'Cabaña Mimmo I', pax: 2, fecha_entrada: '2027-06-10', fecha_salida: '2027-06-12',
      monto_total: precioTotal, sena1_monto: 2000,
    }).select().single()
    expect(error).toBeNull()
    cleanup.reservas.push(reserva.id)

    const { data: reservaFresca } = await client.from('reservas').select('*').eq('id', reserva.id).single()
    const totalPagado = totalPagadoReserva(reservaFresca.sena1_monto, reservaFresca.sena2_monto, reservaFresca.pago_cabana_monto)
    expect(totalPagado).toBe(2000)

    // Un pago de 2000+ que llevaría el total a 4000 → no excede.
    expect(excedeSaldoReserva(reservaFresca.monto_total, totalPagado + 2000)).toBe(false)
    // Un pago que llevaría el total a 6000 → excede los 5000 del precio.
    expect(excedeSaldoReserva(reservaFresca.monto_total, totalPagado + 4000)).toBe(true)
  })

  // Nota: no hay un test de "bypass a nivel DB" acá como en el bloque
  // de $0 — movimientos_caja no tiene ninguna columna/relación que
  // conozca el precio de una reserva, así que no hay siquiera una
  // tabla contra la cual la base podría chequear un tope. El sobrepago
  // es 100% responsabilidad del código de ReservaForm.jsx/
  // ReservaPago.jsx antes de escribir.
})

describe('Superposición de fechas de reserva', () => {
  const cabana = 'Cabaña Mimmo II'

  it('getConflicto + fetchReservasOcupadasPorCabana (código real) detectan la superposición', async () => {
    const { data: primera, error } = await client.from('reservas').insert({
      complejo_id: mimmoId, codigo: autotestCodigo(), nombre_apellido: autotestNombre('Overlap 1'),
      cabana, pax: 2, fecha_entrada: '2027-07-10', fecha_salida: '2027-07-15', monto_total: 1000,
    }).select().single()
    expect(error).toBeNull()
    cleanup.reservas.push(primera.id)

    const { data: ocupadas, error: errOcupadas } = await fetchReservasOcupadasPorCabana(client, mimmoId, cabana)
    expect(errOcupadas).toBeNull()
    expect(ocupadas.some((r) => r.id === primera.id)).toBe(true)

    // Segunda reserva (todavía NO insertada) con fechas superpuestas —
    // el conflicto se detecta ANTES de intentar guardarla, igual que
    // hace ReservaForm.jsx.
    const conflicto = getConflicto('2027-07-12', '2027-07-20', ocupadas)
    expect(conflicto).toContain('Overlap 1')
  })

  it('fechas adyacentes (recambio same-day) NO generan conflicto — se puede reservar de verdad', async () => {
    const { data: primera, error } = await client.from('reservas').insert({
      complejo_id: mimmoId, codigo: autotestCodigo(), nombre_apellido: autotestNombre('Overlap adyacente'),
      cabana, pax: 2, fecha_entrada: '2027-08-01', fecha_salida: '2027-08-05', monto_total: 1000,
    }).select().single()
    expect(error).toBeNull()
    cleanup.reservas.push(primera.id)

    const { data: ocupadas } = await fetchReservasOcupadasPorCabana(client, mimmoId, cabana)
    const conflicto = getConflicto('2027-08-05', '2027-08-08', ocupadas)
    expect(conflicto).toBe('')
  })
})

describe('Superposición de cierres', () => {
  it('rangosSolapan (código real) detecta un segundo cierre superpuesto para el mismo complejo', async () => {
    const { data: cierre1, error } = await client.from('cierres_caja').insert({
      complejo_id: mimmoId, nombre: autotestCierreNombre('Overlap cierre'),
      fecha_desde: '2027-09-01', fecha_hasta: '2027-09-30', inicio_manual: 0,
    }).select().single()
    expect(error).toBeNull()
    cleanup.cierres.push(cierre1.id)

    // Simula la validación real de CajaTemporada.jsx antes de
    // confirmar un segundo cierre: buscar si alguno de los ya
    // existentes se superpone con el rango propuesto.
    const { data: cierresExistentes } = await client.from('cierres_caja').select('*').eq('complejo_id', mimmoId)
    const propuesta = { fecha_desde: '2027-09-15', fecha_hasta: '2027-10-15' }
    const conflicto = cierresExistentes.find((c) =>
      rangosSolapan(propuesta.fecha_desde, propuesta.fecha_hasta, c.fecha_desde, c.fecha_hasta)
    )
    expect(conflicto?.id).toBe(cierre1.id)
  })
})

describe('Candado de período cerrado', () => {
  let cierreId
  const desde = '2027-11-01'
  const hasta = '2027-11-30'
  const fechaBloqueada = '2027-11-15'

  beforeAll(async () => {
    const { data, error } = await client.from('cierres_caja').insert({
      complejo_id: mimmoId, nombre: autotestCierreNombre('Candado'),
      fecha_desde: desde, fecha_hasta: hasta, inicio_manual: 0,
    }).select().single()
    expect(error).toBeNull()
    cierreId = data.id
  })

  afterAll(async () => {
    if (cierreId) await client.from('cierres_caja').delete().eq('id', cierreId)
  })

  it('cierreQueContiene (código real, guardia de CajaTemporada.jsx) marca como bloqueada una fecha del rango', async () => {
    const { data: cierres } = await client.from('cierres_caja').select('*').eq('complejo_id', mimmoId)
    const bloqueante = cierreQueContiene(cierres, fechaBloqueada)
    expect(bloqueante?.id).toBe(cierreId)
  })

  it('cierreQueContiene NO bloquea una fecha fuera del rango', async () => {
    const { data: cierres } = await client.from('cierres_caja').select('*').eq('complejo_id', mimmoId)
    expect(cierreQueContiene(cierres, '2027-12-01')).toBeNull()
  })

  it('fechaEstaCerrada (código real, pre-flight de ReservaForm.jsx/ReservaPago.jsx) también detecta el bloqueo consultando la base directamente', async () => {
    const { cierre, error } = await fechaEstaCerrada(client, mimmoId, fechaBloqueada)
    expect(error).toBeNull()
    expect(cierre?.id).toBe(cierreId)
  })

  it('un movimiento PRE-EXISTENTE cuya fecha cae en un cierre creado después también queda marcado como bloqueado (guardia de editar/borrar)', async () => {
    // Se crea el movimiento con una fecha que en ese momento estaba
    // libre, y RECIÉN DESPUÉS se cierra la caja sobre ese rango —
    // reproduce el escenario real de "cerrar caja retroactivamente
    // sobre movimientos ya cargados".
    const fechaMov = '2027-11-20'
    const { data: mov, error: errMov } = await client.from('movimientos_caja').insert({
      complejo_id: mimmoId, fecha: fechaMov, tipo: 'ingreso', categoria: 'alquiler',
      detalle: autotestDetalle('Candado edit/borrar'), origen: 'manual',
      monto_depositos: 100, monto_efectivo: 0, monto_otros: 0,
    }).select().single()
    expect(errMov).toBeNull()
    cleanup.movimientos.push(mov.id)

    const { data: cierres } = await client.from('cierres_caja').select('*').eq('complejo_id', mimmoId)
    const bloqueante = cierreQueContiene(cierres, mov.fecha)
    expect(bloqueante?.id).toBe(cierreId) // la fila queda con edición/borrado deshabilitados en la UI
  })
})

// Prioridad 1+2 — Retiros para complejos NO-VIP (movimientos_caja,
// tipo='retiro', ver 022_movimientos_caja_tipo_retiro.sql). Requiere esa
// migración corrida en el ambiente contra el que corre este test — si
// todavía no se corrió, el insert de "retiro válido" de más abajo falla
// con la base rechazando el tipo (esperado, no es un bug: documenta
// justamente que el tipo nuevo todavía no está habilitado).
describe('Retiros (movimientos_caja, tipo="retiro")', () => {
  it('$0/negativo: validarMontoMovimiento (código real) bloquea el intento antes de llegar a la base, igual que para el resto de los tipos', () => {
    expect(validarMontoMovimiento('retiro', 0, 0, 0).valido).toBe(false)
    expect(validarMontoMovimiento('retiro', -100, 0, 0).valido).toBe(false)
    expect(validarMontoMovimiento('retiro', 500, 0, 0).valido).toBe(true)
  })

  it('un retiro válido se inserta y queda scopeado por complejo_id — invisible desde otro complejo', async () => {
    const { data, error } = await client.from('movimientos_caja').insert({
      complejo_id: mimmoId, fecha: '2027-06-05', tipo: 'retiro',
      detalle: autotestDetalle('Retiro válido'), origen: 'manual',
      monto_depositos: 0, monto_efectivo: 500, monto_otros: 0,
    }).select().single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    cleanup.movimientos.push(data.id)

    // Visible en mimmo (su propio complejo)...
    const { data: enMimmo } = await client.from('movimientos_caja').select('*').eq('id', data.id).eq('complejo_id', mimmoId)
    expect(enMimmo).toHaveLength(1)

    // ...pero invisible si se filtra por un complejo ajeno (los-amigos),
    // aunque el id de la fila sea el mismo — mismo filtrado explícito
    // por complejo_id que ya usa el resto de esta tabla.
    const { data: enLosAmigos } = await client.from('movimientos_caja').select('*').eq('id', data.id).eq('complejo_id', losAmigosId)
    expect(enLosAmigos).toEqual([])
  })

  it('la base rechaza monto_efectivo negativo en un retiro con un CHECK constraint (migración 020), bypaseando validarMontoMovimiento', async () => {
    const { data, error } = await client.from('movimientos_caja').insert({
      complejo_id: mimmoId, fecha: '2027-06-05', tipo: 'retiro',
      detalle: autotestDetalle('Retiro negativo bypass'), origen: 'manual',
      monto_depositos: 0, monto_efectivo: -500, monto_otros: 0,
    }).select()
    if (data?.length) cleanup.movimientos.push(...data.map((r) => r.id))
    expect(error).toBeTruthy()
    expect(data == null || data.length === 0).toBe(true)
  })

  describe('candado de período cerrado también aplica a un retiro', () => {
    let cierreId
    const desde = '2027-12-01'
    const hasta = '2027-12-31'
    const fechaBloqueada = '2027-12-15'

    beforeAll(async () => {
      const { data, error } = await client.from('cierres_caja').insert({
        complejo_id: mimmoId, nombre: autotestCierreNombre('Candado retiro'),
        fecha_desde: desde, fecha_hasta: hasta, inicio_manual: 0,
      }).select().single()
      expect(error).toBeNull()
      cierreId = data.id
    })

    afterAll(async () => {
      if (cierreId) await client.from('cierres_caja').delete().eq('id', cierreId)
    })

    it('fechaEstaCerrada (mismo pre-flight que Ganancias.jsx corre antes de guardar un retiro) detecta el bloqueo', async () => {
      const { cierre, error } = await fechaEstaCerrada(client, mimmoId, fechaBloqueada)
      expect(error).toBeNull()
      expect(cierre?.id).toBe(cierreId)
    })

    it('un retiro PRE-EXISTENTE cuya fecha cae en un cierre creado después también queda marcado como bloqueado', async () => {
      const { data: mov, error: errMov } = await client.from('movimientos_caja').insert({
        complejo_id: mimmoId, fecha: fechaBloqueada, tipo: 'retiro',
        detalle: autotestDetalle('Retiro candado'), origen: 'manual',
        monto_depositos: 0, monto_efectivo: 200, monto_otros: 0,
      }).select().single()
      expect(errMov).toBeNull()
      cleanup.movimientos.push(mov.id)

      const { data: cierres } = await client.from('cierres_caja').select('*').eq('complejo_id', mimmoId)
      const bloqueante = cierreQueContiene(cierres, mov.fecha)
      expect(bloqueante?.id).toBe(cierreId)
    })
  })
})

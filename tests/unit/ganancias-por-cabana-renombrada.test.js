// Código real importado de src/pages/Ganancias.jsx (agruparPorCabana)
// — sin mocks, sin DOM, sin render del componente. "Top cabañas del
// período" bucketeaba por el string crudo de r.cabana: una cabaña
// renombrada (ver 030_mimmo_los_amigos_rename_definitivo.sql) con
// reservas viejas guardadas con el nombre viejo y nuevas con el nombre
// nuevo aparecía como DOS filas distintas, partiendo en dos la
// facturación de una misma cabaña física. Fix: agruparPorCabana
// normaliza cada reserva a la cabaña ACTUAL (vía nombreActualDeCabana)
// antes de sumar — una cabaña con reservas de las dos épocas queda
// consolidada en una sola fila.
import { describe, it, expect } from 'vitest'
import { agruparPorCabana } from '../../src/pages/Ganancias'

const CABANAS_ACTIVO = [
  { nombre: 'Confort 2', nombres_anteriores: ['Confort I'] },
  { nombre: 'Mimmo I', nombres_anteriores: [] },
]

describe('agruparPorCabana (código real)', () => {
  it('reservas con nombre VIEJO y NUEVO de la MISMA cabaña se consolidan en una sola fila con el total combinado', () => {
    const reservas = [
      { cabana: 'Confort I', monto_total: 1000 }, // vieja
      { cabana: 'Confort 2', monto_total: 2000 }, // nueva
      { cabana: 'Confort I', monto_total: 500 },  // vieja de nuevo
    ]
    const resultado = agruparPorCabana(reservas, CABANAS_ACTIVO)

    expect(resultado).toHaveLength(1)
    expect(resultado[0]).toEqual({ cabana: 'Confort 2', reservas: 3, monto: 3500 })
  })

  it('cabañas distintas siguen separadas, sin mezclarse entre sí', () => {
    const reservas = [
      { cabana: 'Confort I', monto_total: 1000 },
      { cabana: 'Mimmo I', monto_total: 2000 },
    ]
    const resultado = agruparPorCabana(reservas, CABANAS_ACTIVO)

    expect(resultado).toHaveLength(2)
    const confort = resultado.find((r) => r.cabana === 'Confort 2')
    const mimmo = resultado.find((r) => r.cabana === 'Mimmo I')
    expect(confort).toEqual({ cabana: 'Confort 2', reservas: 1, monto: 1000 })
    expect(mimmo).toEqual({ cabana: 'Mimmo I', reservas: 1, monto: 2000 })
  })

  it('ordena de mayor a menor monto, igual que antes', () => {
    const reservas = [
      { cabana: 'Mimmo I', monto_total: 100 },
      { cabana: 'Confort I', monto_total: 900 },
    ]
    const resultado = agruparPorCabana(reservas, CABANAS_ACTIVO)
    expect(resultado.map((r) => r.cabana)).toEqual(['Confort 2', 'Mimmo I'])
  })

  it('una cabaña nunca renombrada sigue funcionando exactamente igual que antes (sin regresión)', () => {
    const reservas = [{ cabana: 'Mimmo I', monto_total: 100 }, { cabana: 'Mimmo I', monto_total: 200 }]
    const resultado = agruparPorCabana(reservas, CABANAS_ACTIVO)
    expect(resultado).toEqual([{ cabana: 'Mimmo I', reservas: 2, monto: 300 }])
  })

  it('sin cabanasActivo (undefined): se degrada a bucketear por el string crudo, igual que el comportamiento de antes de este fix', () => {
    const reservas = [{ cabana: 'Confort I', monto_total: 1000 }, { cabana: 'Confort 2', monto_total: 2000 }]
    const resultado = agruparPorCabana(reservas, undefined)
    // Sin catálogo para resolver alias, cada nombre crudo es su propia
    // fila — dos filas, no consolidadas (exactamente el comportamiento
    // viejo, pre-rename-fix).
    expect(resultado).toHaveLength(2)
  })

  it('una reserva multi-cabaña (cabana con "\\n") no matchea ninguna cabaña conocida y queda como su propia entrada, sin romper nada (limitación pre-existente, fuera de alcance)', () => {
    const reservas = [{ cabana: 'Confort I\nMimmo I', monto_total: 1000 }]
    const resultado = agruparPorCabana(reservas, CABANAS_ACTIVO)
    expect(resultado).toEqual([{ cabana: 'Confort I\nMimmo I', reservas: 1, monto: 1000 }])
  })

  it('sin reservas: array vacío, no explota', () => {
    expect(agruparPorCabana([], CABANAS_ACTIVO)).toEqual([])
  })
})

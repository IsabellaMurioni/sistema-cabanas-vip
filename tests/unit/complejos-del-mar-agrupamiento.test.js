// "Complejos del mar" trae cabañas/reservas de VARIOS complejos con un
// solo fetch batcheado por tipo de dato (`.in('complejo_id', [...])`),
// no un fetch por complejo — ver el header de
// src/pages/ComplejosDelMar.jsx para el por qué (misma clase de bug
// que el commit dc7e4fc, "aislamiento entre complejos", si cada
// complejo tuviera su propio setState independiente). `agruparPorComplejo`
// es la función pura que, del lado del cliente, separa esa única
// respuesta batcheada en buckets por `complejo_id` — este archivo
// prueba que esa separación es exacta: ninguna fila de un complejo
// termina en el bucket de otro, ni aunque dos cabañas de complejos
// distintos compartan el mismo `nombre`.
import { describe, it, expect } from 'vitest'
import { agruparPorComplejo, agruparCabanasPorGrupo } from '../../src/pages/ComplejosDelMar'

describe('agruparPorComplejo (código real, función pura)', () => {
  it('separa cabañas y reservas de DOS complejos en buckets propios, incluso con nombres de cabaña repetidos entre ellos', () => {
    const cabanaA = { id: 'cab-a1', complejo_id: 'complejo-a', nombre: 'Confort 2' }
    const cabanaB = { id: 'cab-b1', complejo_id: 'complejo-b', nombre: 'Confort 2' } // mismo nombre, OTRO complejo
    const reservaA = { id: 'r-a', complejo_id: 'complejo-a', cabana: 'Confort 2' }
    const reservaB = { id: 'r-b', complejo_id: 'complejo-b', cabana: 'Confort 2' }

    const { cabanasPorComplejo, reservasPorComplejo } = agruparPorComplejo(
      [cabanaA, cabanaB],
      [reservaA, reservaB]
    )

    expect(cabanasPorComplejo['complejo-a']).toEqual([cabanaA])
    expect(cabanasPorComplejo['complejo-b']).toEqual([cabanaB])
    expect(reservasPorComplejo['complejo-a']).toEqual([reservaA])
    expect(reservasPorComplejo['complejo-b']).toEqual([reservaB])

    // Ningún bucket contiene la fila del OTRO complejo — la fuga
    // cruzada que este agrupamiento existe para evitar.
    expect(cabanasPorComplejo['complejo-a']).not.toContainEqual(cabanaB)
    expect(cabanasPorComplejo['complejo-b']).not.toContainEqual(cabanaA)
    expect(reservasPorComplejo['complejo-a']).not.toContainEqual(reservaB)
    expect(reservasPorComplejo['complejo-b']).not.toContainEqual(reservaA)
  })

  it('múltiples cabañas/reservas del MISMO complejo van todas al mismo bucket, en orden', () => {
    const cabanas = [
      { id: 'c1', complejo_id: 'mimmo', nombre: 'Confort 2' },
      { id: 'c2', complejo_id: 'mimmo', nombre: 'Confort 3' },
    ]
    const { cabanasPorComplejo } = agruparPorComplejo(cabanas, [])
    expect(cabanasPorComplejo['mimmo']).toEqual(cabanas)
  })

  it('arrays vacíos → objetos vacíos, sin romper', () => {
    expect(agruparPorComplejo([], [])).toEqual({ cabanasPorComplejo: {}, reservasPorComplejo: {} })
  })
})

describe('agruparCabanasPorGrupo (código real, función pura)', () => {
  it('agrupa cabañas contiguas del mismo `grupo` en una sola sección', () => {
    const cabanas = [
      { id: '1', nombre: 'Chalet 3 Ambientes', grupo: 'MIMMO I' },
      { id: '2', nombre: 'Confort 2', grupo: 'MIMMO I' },
      { id: '3', nombre: 'Mimmo I', grupo: 'MIMMO II' },
    ]
    const secciones = agruparCabanasPorGrupo(cabanas)
    expect(secciones).toEqual([
      { grupo: 'MIMMO I', cabanas: [cabanas[0], cabanas[1]] },
      { grupo: 'MIMMO II', cabanas: [cabanas[2]] },
    ])
  })

  it('cabañas sin `grupo` (null/undefined) quedan en su propia sección sin label', () => {
    const cabanas = [
      { id: '1', nombre: 'Bahama', grupo: null },
      { id: '2', nombre: 'Bahia', grupo: null },
    ]
    const secciones = agruparCabanasPorGrupo(cabanas)
    expect(secciones).toEqual([{ grupo: null, cabanas }])
  })
})

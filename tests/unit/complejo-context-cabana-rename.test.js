// Código real importado de src/context/ComplejoContext.jsx — sin
// mocks, sin DOM. cabinMatchesName es la única fuente de verdad para
// "¿este string corresponde a ESTA cabaña?" en toda la app (ver su
// comentario ahí) — matchea por nombre ACTUAL o por cualquiera de sus
// nombres anteriores (cabanas.nombres_anteriores, agregado en
// 030_mimmo_los_amigos_rename_definitivo.sql para poder renombrar una
// cabaña sin reescribir ninguna fila de `reservas`, que guarda el
// nombre como texto libre congelado al momento de crear la reserva).
import { describe, it, expect } from 'vitest'
import { cabinMatchesName, nombreActualDeCabana, resolverColorCabana } from '../../src/context/ComplejoContext'

describe('cabinMatchesName (código real)', () => {
  const confort2 = { nombre: 'Confort 2', nombres_anteriores: ['Confort I'] }

  it('matchea el nombre ACTUAL', () => {
    expect(cabinMatchesName(confort2, 'Confort 2')).toBe(true)
  })

  it('matchea cualquiera de los nombres ANTERIORES', () => {
    expect(cabinMatchesName(confort2, 'Confort I')).toBe(true)
  })

  it('NO matchea un nombre que no es ni el actual ni ninguno de los anteriores', () => {
    expect(cabinMatchesName(confort2, 'Confort 3')).toBe(false)
    expect(cabinMatchesName(confort2, 'Confort II')).toBe(false)
  })

  it('una cabaña que NUNCA fue renombrada (nombres_anteriores vacío) sigue matcheando igual que antes', () => {
    const sinRenombrar = { nombre: 'Casa', nombres_anteriores: [] }
    expect(cabinMatchesName(sinRenombrar, 'Casa')).toBe(true)
    expect(cabinMatchesName(sinRenombrar, 'Cualquier Otro')).toBe(false)
  })

  it('no explota si nombres_anteriores es null/undefined (filas viejas antes de la migración, o complejos sin ningún rename)', () => {
    expect(cabinMatchesName({ nombre: 'Casa', nombres_anteriores: null }, 'Casa')).toBe(true)
    expect(cabinMatchesName({ nombre: 'Casa' }, 'Casa')).toBe(true)
    expect(cabinMatchesName({ nombre: 'Casa' }, 'Nombre Viejo')).toBe(false)
  })

  it('no explota con cabanaRow/nombre null o undefined', () => {
    expect(cabinMatchesName(null, 'Confort 2')).toBe(false)
    expect(cabinMatchesName(confort2, null)).toBe(false)
    expect(cabinMatchesName(undefined, undefined)).toBe(false)
  })

  it('una cabaña renombrada DOS veces (nombres_anteriores con 2 entradas) matchea las dos', () => {
    const dosVeces = { nombre: 'Confort 2', nombres_anteriores: ['Cabaña Confort I', 'Confort I'] }
    expect(cabinMatchesName(dosVeces, 'Cabaña Confort I')).toBe(true)
    expect(cabinMatchesName(dosVeces, 'Confort I')).toBe(true)
    expect(cabinMatchesName(dosVeces, 'Confort 2')).toBe(true)
  })
})

describe('nombreActualDeCabana (código real)', () => {
  const cabanasActivo = [
    { nombre: 'Confort 2', nombres_anteriores: ['Confort I'] },
    { nombre: 'Confort 3', nombres_anteriores: ['Confort II'] },
    { nombre: 'Mimmo I', nombres_anteriores: [] },
  ]

  it('un nombre ANTERIOR resuelve al nombre ACTUAL de esa cabaña', () => {
    expect(nombreActualDeCabana(cabanasActivo, 'Confort I')).toBe('Confort 2')
    expect(nombreActualDeCabana(cabanasActivo, 'Confort II')).toBe('Confort 3')
  })

  it('el nombre ACTUAL se devuelve tal cual (ya es el canónico)', () => {
    expect(nombreActualDeCabana(cabanasActivo, 'Confort 2')).toBe('Confort 2')
  })

  it('una cabaña nunca renombrada se devuelve tal cual', () => {
    expect(nombreActualDeCabana(cabanasActivo, 'Mimmo I')).toBe('Mimmo I')
  })

  it('un nombre que no matchea NINGUNA cabaña (eliminada, multi-cabaña con "\\n", dato inesperado) se devuelve SIN CAMBIOS, no explota', () => {
    expect(nombreActualDeCabana(cabanasActivo, 'Cabaña Que Ya No Existe')).toBe('Cabaña Que Ya No Existe')
    expect(nombreActualDeCabana(cabanasActivo, 'Confort I\nMimmo I')).toBe('Confort I\nMimmo I')
  })

  it('no explota sin cabanasActivo (null/undefined) ni sin nombre — se degrada al string tal cual', () => {
    expect(nombreActualDeCabana(null, 'Confort I')).toBe('Confort I')
    expect(nombreActualDeCabana(undefined, 'Confort I')).toBe('Confort I')
    expect(nombreActualDeCabana(cabanasActivo, null)).toBe(null)
    expect(nombreActualDeCabana(cabanasActivo, '')).toBe('')
  })
})

describe('resolverColorCabana (código real) — color de una cabaña renombrada, por nombre viejo o nuevo', () => {
  const cabanasActivo = [
    { nombre: 'Confort 2', color: '#B16B25', nombres_anteriores: ['Confort I'] },
    { nombre: 'Mimmo I', color: '#6B25B1', nombres_anteriores: [] },
  ]

  it('el nombre ACTUAL resuelve al color real (sin cambios vs. antes)', () => {
    expect(resolverColorCabana(cabanasActivo, 'Confort 2')).toBe('#B16B25')
  })

  it('el nombre ANTERIOR (reserva vieja) resuelve al MISMO color real, no al gris de fallback', () => {
    expect(resolverColorCabana(cabanasActivo, 'Confort I')).toBe('#B16B25')
  })

  it('una cabaña que no existe (ni actual ni anterior) cae al gris de fallback, igual que siempre', () => {
    expect(resolverColorCabana(cabanasActivo, 'Cabaña Inexistente')).toBe('#64748b')
  })
})

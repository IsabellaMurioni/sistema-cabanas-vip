// Código real importado de src/pages/ReservaForm.jsx — sin mocks, sin
// DB. getConflicto ES la función real de detección de superposición de
// fechas de reserva.
import { describe, it, expect } from 'vitest'
import { calcNoches, getMes, fechaMasReciente, getConflicto, debeEnviarEmailConfirmacion } from '../../src/pages/ReservaForm'

describe('getConflicto — superposición de fechas de reserva (código real)', () => {
  const ocupadas = [{ fecha_entrada: '2026-08-10', fecha_salida: '2026-08-15', nombre_apellido: 'García, Juan' }]

  it('exactamente el mismo rango → conflicto', () => {
    expect(getConflicto('2026-08-10', '2026-08-15', ocupadas)).toContain('García, Juan')
  })

  it('superposición parcial (entrada nueva cae adentro del rango ocupado)', () => {
    expect(getConflicto('2026-08-12', '2026-08-20', ocupadas)).toContain('García, Juan')
  })

  it('un rango contiene completamente al otro', () => {
    expect(getConflicto('2026-08-01', '2026-08-30', ocupadas)).toContain('García, Juan')
    expect(getConflicto('2026-08-11', '2026-08-14', ocupadas)).toContain('García, Juan')
  })

  it('check-in el mismo día del check-out ocupado → NO es conflicto (recambio same-day)', () => {
    expect(getConflicto('2026-08-15', '2026-08-18', ocupadas)).toBe('')
  })

  it('check-out el mismo día del check-in ocupado → NO es conflicto', () => {
    expect(getConflicto('2026-08-05', '2026-08-10', ocupadas)).toBe('')
  })

  it('completamente antes, sin tocar → sin conflicto', () => {
    expect(getConflicto('2026-08-01', '2026-08-05', ocupadas)).toBe('')
  })

  it('completamente después, sin tocar → sin conflicto', () => {
    expect(getConflicto('2026-08-20', '2026-08-25', ocupadas)).toBe('')
  })

  it('sin fechas o sin rangos ocupados → sin conflicto, no explota', () => {
    expect(getConflicto('', '2026-08-15', ocupadas)).toBe('')
    expect(getConflicto('2026-08-10', '', ocupadas)).toBe('')
    expect(getConflicto('2026-08-10', '2026-08-15', [])).toBe('')
    expect(getConflicto('2026-08-10', '2026-08-15', null)).toBe('')
  })
})

describe('calcNoches (código real)', () => {
  it('calcula noches entre dos fechas', () => {
    expect(calcNoches('2026-08-10', '2026-08-15')).toBe(5)
  })
  it('mismo día → 0 noches', () => {
    expect(calcNoches('2026-08-10', '2026-08-10')).toBe(0)
  })
  it('fecha de salida antes que entrada → nunca negativo (clamp a 0)', () => {
    expect(calcNoches('2026-08-15', '2026-08-10')).toBe(0)
  })
  it('sin alguna de las dos fechas → 0', () => {
    expect(calcNoches('', '2026-08-10')).toBe(0)
    expect(calcNoches('2026-08-10', '')).toBe(0)
  })
})

describe('getMes (código real)', () => {
  it('devuelve el nombre del mes en español', () => {
    expect(getMes('2026-08-15')).toBe('Agosto')
    expect(getMes('2026-01-01')).toBe('Enero')
    expect(getMes('2026-12-31')).toBe('Diciembre')
  })
  it('fecha vacía → string vacío', () => {
    expect(getMes('')).toBe('')
  })
})

describe('fechaMasReciente (código real)', () => {
  it('devuelve la más reciente entre varias fechas cargadas', () => {
    expect(fechaMasReciente('2026-08-01', '2026-08-15', '2026-07-20')).toBe('2026-08-15')
  })
  it('ignora las vacías/undefined y usa la más reciente de las que sí están', () => {
    expect(fechaMasReciente('', '2026-08-01', undefined)).toBe('2026-08-01')
  })
  it('una sola fecha cargada → esa misma', () => {
    expect(fechaMasReciente('2026-05-05', '', '')).toBe('2026-05-05')
  })
  it('ninguna fecha cargada → hoy, formato ISO', () => {
    expect(fechaMasReciente('', '', '')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// Esta es la función real que handleSubmit usa para decidir si llama a
// sendEmailConfirmacion (ver src/pages/ReservaForm.jsx) — no una
// reimplementación aparte. Una reserva a $0/sin precio nunca debe
// disparar el email de confirmación (y, por lo tanto, nunca queda con
// fecha_vencimiento seteada) — chequeo explícito e independiente de si
// el envío de email hoy funciona o no.
describe('debeEnviarEmailConfirmacion (código real) — nunca dispara el email para una reserva a $0', () => {
  it('Pendiente + email + precio > 0 → sí dispara', () => {
    expect(debeEnviarEmailConfirmacion('Pendiente', 'guest@mail.com', '15000')).toBe(true)
    expect(debeEnviarEmailConfirmacion('Pendiente', 'guest@mail.com', 15000)).toBe(true)
  })

  it('Pendiente + email + precio = 0 (string "0") → NO dispara', () => {
    expect(debeEnviarEmailConfirmacion('Pendiente', 'guest@mail.com', '0')).toBe(false)
  })

  it('Pendiente + email + precio = 0 (number 0) → NO dispara', () => {
    expect(debeEnviarEmailConfirmacion('Pendiente', 'guest@mail.com', 0)).toBe(false)
  })

  it('Pendiente + email + precio en blanco (\'\') → NO dispara (blanco = 0)', () => {
    expect(debeEnviarEmailConfirmacion('Pendiente', 'guest@mail.com', '')).toBe(false)
  })

  it('Pendiente + email + precio null/undefined → NO dispara', () => {
    expect(debeEnviarEmailConfirmacion('Pendiente', 'guest@mail.com', null)).toBe(false)
    expect(debeEnviarEmailConfirmacion('Pendiente', 'guest@mail.com', undefined)).toBe(false)
  })

  it('precio > 0 pero estado ya no es Pendiente → NO dispara (sin cambios de comportamiento previo)', () => {
    expect(debeEnviarEmailConfirmacion('Confirmada', 'guest@mail.com', 15000)).toBe(false)
  })

  it('precio > 0 y Pendiente pero sin email → NO dispara (sin cambios de comportamiento previo)', () => {
    expect(debeEnviarEmailConfirmacion('Pendiente', '', 15000)).toBe(false)
    expect(debeEnviarEmailConfirmacion('Pendiente', null, 15000)).toBe(false)
  })

  it('precio negativo (no debería pasar en la práctica, min=0 en el form) → NO dispara igual', () => {
    expect(debeEnviarEmailConfirmacion('Pendiente', 'guest@mail.com', -100)).toBe(false)
  })
})

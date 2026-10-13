// No hay forma de ejecutar SQL real contra ningún entorno desde acá
// (DDL requiere correrse a mano en el SQL Editor de Supabase — ver
// TESTING.md — y no hay ninguna connection string ni service-role key
// en este repo). Este archivo prueba dos cosas distintas:
//
//  1. Una reimplementación en JS puro de la lógica de auto-verificación
//     de 030_mimmo_los_amigos_rename_definitivo.sql (los 3 `elsif` de
//     cada bloque `do $$`) — mismo árbol de decisión, incluido el caso
//     explícitamente pedido: una fila cuyo nombre actual NO coincide
//     con el esperado se saltea y se reporta, no se renombra a ciegas.
//     Esto prueba que la LÓGICA es sólida, no que el archivo .sql se
//     ejecutó — el archivo en sí se revisó a mano línea por línea
//     contra esta misma tabla de decisión.
//
//  2. Una verificación ESTÁTICA (leyendo el texto del .sql real, no
//     una copia) de que la migración nunca toca `reservas` — ningún
//     UPDATE/INSERT/DELETE contra esa tabla, en ningún bloque — que es
//     el hard constraint explícito de esta tarea.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

// ── 1. Simulación de la lógica de auto-verificación ─────────

// Mismo árbol de decisión que cada `do $$` de la migración real,
// reimplementado acá en JS puro para poder testearlo sin una base de
// datos. `filaActual` es `{ nombre }` (la fila encontrada en esa
// posición/orden) o `null` (ninguna fila en esa posición).
function simularRenombre(filaActual, renombre) {
  if (!filaActual) {
    return { accion: 'SKIP_NO_ROW' }
  }
  if (filaActual.nombre === renombre.nuevo) {
    return { accion: 'YA_APLICADO', nombre: filaActual.nombre }
  }
  if (filaActual.nombre !== renombre.esperado) {
    return { accion: 'SKIP_MISMATCH', encontrado: filaActual.nombre, esperado: renombre.esperado }
  }
  return { accion: 'OK', nombreViejo: filaActual.nombre, nombreNuevo: renombre.nuevo }
}

describe('Lógica de auto-verificación de la migración (simulada en JS, mismo árbol de decisión que el .sql)', () => {
  const renombre = { orden: 2, esperado: 'Confort I', nuevo: 'Confort 2' }

  it('el nombre actual coincide EXACTO con el esperado → renombra (OK)', () => {
    const resultado = simularRenombre({ nombre: 'Confort I' }, renombre)
    expect(resultado).toEqual({ accion: 'OK', nombreViejo: 'Confort I', nombreNuevo: 'Confort 2' })
  })

  it('el nombre actual YA es el nuevo (migración corrida de vuelta) → no renombra, reporta "ya aplicado"', () => {
    const resultado = simularRenombre({ nombre: 'Confort 2' }, renombre)
    expect(resultado).toEqual({ accion: 'YA_APLICADO', nombre: 'Confort 2' })
  })

  it('REQUISITO EXPLÍCITO: el nombre actual NO coincide con el esperado → saltea y reporta, NO renombra a ciegas', () => {
    const resultado = simularRenombre({ nombre: 'Un Nombre Inesperado' }, renombre)
    expect(resultado).toEqual({ accion: 'SKIP_MISMATCH', encontrado: 'Un Nombre Inesperado', esperado: 'Confort I' })
  })

  it('ninguna fila en esa posición → saltea y reporta, no inserta ni asume nada', () => {
    const resultado = simularRenombre(null, renombre)
    expect(resultado).toEqual({ accion: 'SKIP_NO_ROW' })
  })

  it('una fila inesperada en UN rename no afecta la evaluación de los OTROS (cada uno es independiente)', () => {
    const renombres = [
      { orden: 2, esperado: 'Confort I', nuevo: 'Confort 2' },
      { orden: 3, esperado: 'Confort II', nuevo: 'Confort 3' },
      { orden: 4, esperado: '2 Ambientes Planta Baja I', nuevo: '2 Ambientes Planta Baja 4' },
    ]
    // orden=3 tiene un nombre inesperado — los otros dos deben seguir
    // procesándose normalmente, no abortar toda la migración.
    const filas = {
      2: { nombre: 'Confort I' },
      3: { nombre: 'Nombre Rarísimo Que Nadie Esperaba' },
      4: { nombre: '2 Ambientes Planta Baja I' },
    }
    const resultados = renombres.map((r) => simularRenombre(filas[r.orden], r))

    expect(resultados[0].accion).toBe('OK')
    expect(resultados[1].accion).toBe('SKIP_MISMATCH')
    expect(resultados[2].accion).toBe('OK')
  })
})

// ── Simulación end-to-end: las 11 cabañas reales, contra el estado de
// producción confirmado en vivo (ver el audit de esta tarea) ─────────

const RENOMBRES_MIMMO = [
  { orden: 2, esperado: 'Confort I', nuevo: 'Confort 2' },
  { orden: 3, esperado: 'Confort II', nuevo: 'Confort 3' },
  { orden: 4, esperado: '2 Ambientes Planta Baja I', nuevo: '2 Ambientes Planta Baja 4' },
  { orden: 5, esperado: '2 Ambientes Planta Baja II', nuevo: '2 Ambientes Planta Baja 5' },
  { orden: 6, esperado: '2 Ambientes Planta Alta I', nuevo: '2 Ambientes Planta Alta 6' },
  { orden: 7, esperado: '2 Ambientes Planta Alta II', nuevo: '2 Ambientes Planta Alta 7' },
  { orden: 8, esperado: 'Clásica I', nuevo: 'Clásica 8' },
  { orden: 9, esperado: 'Clásica II', nuevo: 'Clásica 9' },
]
const RENOMBRES_LOS_AMIGOS = [
  { orden: 2, esperado: 'Departamento', nuevo: 'Depto' },
  { orden: 3, esperado: 'Dúplex I', nuevo: 'Dúplex 3' },
  { orden: 4, esperado: 'Dúplex II', nuevo: 'Dúplex 4' },
]

describe('Simulación end-to-end — producción tal como la confirmó el audit en vivo', () => {
  it('MIMMO: las 8 cabañas con su nombre real de producción renombran correctamente, ninguna se saltea', () => {
    const estadoProduccion = {
      2: 'Confort I', 3: 'Confort II',
      4: '2 Ambientes Planta Baja I', 5: '2 Ambientes Planta Baja II',
      6: '2 Ambientes Planta Alta I', 7: '2 Ambientes Planta Alta II',
      8: 'Clásica I', 9: 'Clásica II',
    }
    const resultados = RENOMBRES_MIMMO.map((r) =>
      simularRenombre({ nombre: estadoProduccion[r.orden] }, r)
    )
    expect(resultados.every((r) => r.accion === 'OK')).toBe(true)
    expect(resultados.map((r) => r.nombreNuevo)).toEqual([
      'Confort 2', 'Confort 3',
      '2 Ambientes Planta Baja 4', '2 Ambientes Planta Baja 5',
      '2 Ambientes Planta Alta 6', '2 Ambientes Planta Alta 7',
      'Clásica 8', 'Clásica 9',
    ])
  })

  it('LOS AMIGOS: las 3 cabañas con su nombre real de producción renombran correctamente', () => {
    const estadoProduccion = { 2: 'Departamento', 3: 'Dúplex I', 4: 'Dúplex II' }
    const resultados = RENOMBRES_LOS_AMIGOS.map((r) =>
      simularRenombre({ nombre: estadoProduccion[r.orden] }, r)
    )
    expect(resultados.every((r) => r.accion === 'OK')).toBe(true)
    expect(resultados.map((r) => r.nombreNuevo)).toEqual(['Depto', 'Dúplex 3', 'Dúplex 4'])
  })

  it('correr la migración una SEGUNDA vez (idempotencia): todas reportan "ya aplicado", ninguna se re-renombra', () => {
    const estadoYaRenombrado = {
      2: 'Confort 2', 3: 'Confort 3',
      4: '2 Ambientes Planta Baja 4', 5: '2 Ambientes Planta Baja 5',
      6: '2 Ambientes Planta Alta 6', 7: '2 Ambientes Planta Alta 7',
      8: 'Clásica 8', 9: 'Clásica 9',
    }
    const resultados = RENOMBRES_MIMMO.map((r) =>
      simularRenombre({ nombre: estadoYaRenombrado[r.orden] }, r)
    )
    expect(resultados.every((r) => r.accion === 'YA_APLICADO')).toBe(true)
  })
})

// ── 2. Verificación estática del archivo .sql real ──────────

describe('030_mimmo_los_amigos_rename_definitivo.sql — verificación estática del archivo real', () => {
  const aqui = dirname(fileURLToPath(import.meta.url))
  const ruta = join(aqui, '../../supabase/migrations/030_mimmo_los_amigos_rename_definitivo.sql')
  const contenido = readFileSync(ruta, 'utf8')
  // Sólo el código SQL ejecutable, sin los comentarios "--" (que
  // mencionan `reservas.cabana`/`reservas` en la explicación en
  // prosa) — para no dar un falso positivo si esta misma frase
  // aparece documentando la restricción.
  const sqlEjecutable = contenido
    .split('\n')
    .map((linea) => linea.replace(/--.*$/, ''))
    .join('\n')

  it('NUNCA toca la tabla reservas — cero UPDATE/INSERT/DELETE contra ella, en ningún bloque', () => {
    expect(sqlEjecutable.toLowerCase()).not.toMatch(/\b(update|insert into|delete from)\s+reservas\b/)
  })

  it('agrega la columna nombres_anteriores a cabanas (nullable, default array vacío, no rompe filas existentes)', () => {
    expect(sqlEjecutable).toMatch(/alter table cabanas add column if not exists nombres_anteriores text\[\]/i)
  })

  it('cada UPDATE a cabanas también guarda el nombre viejo en nombres_anteriores (array_append)', () => {
    const updates = sqlEjecutable.match(/update cabanas\s+set nombre = [^;]+;/gis) || []
    expect(updates.length).toBeGreaterThan(0)
    for (const u of updates) {
      expect(u).toMatch(/array_append\(nombres_anteriores/i)
    }
  })

  it('tiene exactamente los 11 renombres "primarios" esperados (8 Mimmo + 3 Los Amigos), ni más ni menos', () => {
    const nombres = [
      ...RENOMBRES_MIMMO.map((r) => r.nuevo),
      ...RENOMBRES_LOS_AMIGOS.map((r) => r.nuevo),
    ]
    for (const nombreNuevo of nombres) {
      expect(sqlEjecutable).toContain(`"nuevo": "${nombreNuevo}"`)
    }
    // Cuenta total de pares {"orden":...,"esperado":...,"nuevo":...} en
    // TODO el archivo — 11 del Bloque 1/2 originales + 4 del Bloque 1b
    // (fix "Dos Ambientes..." agregado tras la corrida real en
    // staging, ver el describe de abajo) = 15. Confirma que no hay
    // ningún renombre de más (p. ej. "Chalet 3 Ambientes" o "Casa",
    // que NO deben tocarse en ningún bloque).
    const matches = sqlEjecutable.match(/"nuevo":\s*"/g) || []
    expect(matches).toHaveLength(15)
  })

  it('no incluye "Chalet 3 Ambientes", "Mimmo I/II/III" ni "Casa" como nombre a renombrar (esos quedan sin tocar)', () => {
    expect(sqlEjecutable).not.toMatch(/"esperado":\s*"Chalet 3 Ambientes"/)
    expect(sqlEjecutable).not.toMatch(/"esperado":\s*"Mimmo I"/)
    expect(sqlEjecutable).not.toMatch(/"esperado":\s*"Casa"/)
  })

  it('no incluye "Departamento"/"Depto" en el Bloque 1b (ese rename ya corrió OK, no se vuelve a tocar)', () => {
    // sqlEjecutable ya tiene los comentarios "--" pelados, así que no
    // se puede buscar la etiqueta "Bloque 1b:" (vive en un comentario)
    // — se usa en cambio el tag literal de los raise notice del
    // bloque, que sí es código real.
    const bloque1b = sqlEjecutable.match(/do \$\$[\s\S]*?MIMMO fix Dos Ambientes[\s\S]*?end \$\$;/)[0]
    expect(bloque1b).not.toMatch(/Departamento|Depto/)
  })
})

// ── Bloque 1b: fix de las 4 cabañas "Dos Ambientes..." ──────
// Agregado después de que la primera corrida real contra staging
// reportara estas 4 filas como SKIP (nombre real encontrado —
// "Dos Ambientes Planta Baja 4", leftover de una edición manual previa
// a esta migración — no coincidía ni con el esperado original ni con
// el nuevo). El self-check hizo exactamente lo que debía: ni corrompió
// nada ni renombró a ciegas. Bloque 1b es un segundo intento con
// `esperado` = esa forma "Dos Ambientes...", sólo para estas 4
// posiciones — ver la nota completa en el header del .sql real.
const RENOMBRES_MIMMO_DOS_AMBIENTES = [
  { orden: 4, esperado: 'Dos Ambientes Planta Baja 4', nuevo: '2 Ambientes Planta Baja 4' },
  { orden: 5, esperado: 'Dos Ambientes Planta Baja 5', nuevo: '2 Ambientes Planta Baja 5' },
  { orden: 6, esperado: 'Dos Ambientes Planta Alta 6', nuevo: '2 Ambientes Planta Alta 6' },
  { orden: 7, esperado: 'Dos Ambientes Planta Alta 7', nuevo: '2 Ambientes Planta Alta 7' },
]

describe('Bloque 1b — simulación: fix de las 4 "Dos Ambientes..." (estado real de staging tras la primera corrida)', () => {
  it('las 4 cabañas con el leftover "Dos Ambientes..." renombran correctamente a la forma "2 Ambientes..."', () => {
    const estadoStagingTrasPrimeraCorrida = {
      4: 'Dos Ambientes Planta Baja 4',
      5: 'Dos Ambientes Planta Baja 5',
      6: 'Dos Ambientes Planta Alta 6',
      7: 'Dos Ambientes Planta Alta 7',
    }
    const resultados = RENOMBRES_MIMMO_DOS_AMBIENTES.map((r) =>
      simularRenombre({ nombre: estadoStagingTrasPrimeraCorrida[r.orden] }, r)
    )
    expect(resultados.every((r) => r.accion === 'OK')).toBe(true)
    expect(resultados.map((r) => r.nombreNuevo)).toEqual([
      '2 Ambientes Planta Baja 4', '2 Ambientes Planta Baja 5',
      '2 Ambientes Planta Alta 6', '2 Ambientes Planta Alta 7',
    ])
  })

  it('en un entorno donde el Bloque 1 YA renombró correctamente (producción, nombre real original "2 Ambientes Planta Baja I" nunca tuvo el leftover "Dos Ambientes"): Bloque 1b ve el nombre ya correcto y no hace nada', () => {
    const estadoYaCorrectoViaBloque1 = {
      4: '2 Ambientes Planta Baja 4',
      5: '2 Ambientes Planta Baja 5',
      6: '2 Ambientes Planta Alta 6',
      7: '2 Ambientes Planta Alta 7',
    }
    const resultados = RENOMBRES_MIMMO_DOS_AMBIENTES.map((r) =>
      simularRenombre({ nombre: estadoYaCorrectoViaBloque1[r.orden] }, r)
    )
    expect(resultados.every((r) => r.accion === 'YA_APLICADO')).toBe(true)
  })

  it('un nombre inesperado (ni "Dos Ambientes..." ni "2 Ambientes...") se saltea y reporta, no se renombra a ciegas', () => {
    const resultado = simularRenombre({ nombre: 'Un Nombre Cualquiera' }, RENOMBRES_MIMMO_DOS_AMBIENTES[0])
    expect(resultado.accion).toBe('SKIP_MISMATCH')
  })
})

describe('Bloque 1b — verificación estática del archivo real', () => {
  const ruta2 = join(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations/030_mimmo_los_amigos_rename_definitivo.sql')
  const contenido2 = readFileSync(ruta2, 'utf8')
  const bloque1b = contenido2.match(/-- ── Bloque 1b: MIMMO[\s\S]*?end \$\$;/)[0]

  it('existe como bloque separado, no mezclado dentro del Bloque 1 original', () => {
    expect(bloque1b).toContain('do $$')
    expect(bloque1b).toMatch(/end \$\$;\s*$/)
  })

  it('toca exactamente orden 4, 5, 6 y 7 — ni más ni menos', () => {
    const ordenes = [...bloque1b.matchAll(/"orden":\s*(\d+)/g)].map((m) => Number(m[1]))
    expect(ordenes.sort()).toEqual([4, 5, 6, 7])
  })

  it('cada entrada usa "Dos Ambientes..." como esperado y "2 Ambientes..." como nuevo', () => {
    for (const r of RENOMBRES_MIMMO_DOS_AMBIENTES) {
      expect(bloque1b).toContain(`"esperado": "${r.esperado}"`)
      expect(bloque1b).toContain(`"nuevo": "${r.nuevo}"`)
    }
  })

  it('también guarda el nombre viejo en nombres_anteriores (array_append), igual que el resto de la migración', () => {
    expect(bloque1b).toMatch(/array_append\(nombres_anteriores/i)
  })

  it('no toca la tabla reservas', () => {
    expect(bloque1b.toLowerCase()).not.toMatch(/\b(update|insert into|delete from)\s+reservas\b/)
  })
})

// ============================================================
// scripts/wipe-comprobantes-storage.js
//
// Fase 6 — borra TODOS los archivos del bucket "comprobantes" en
// PRODUCCIÓN. Complementa el TRUNCATE de supabase/cutover/003_wipe_vip.sql:
// las columnas *_comprobante de reservas/caja_* guardan sólo el nombre
// de archivo como texto libre, sin ninguna foreign key real hacia
// storage.objects (verificado en 003_wipe_vip.sql) — el TRUNCATE de la
// base NO borra los archivos de Storage, hace falta este script aparte.
// Mismo split que ya dejó documentado 009_clean.sql en su momento
// ("los archivos deben eliminarse manualmente").
//
// Convención real de subida (src/components/FileUpload.jsx): nombres
// planos tipo "<timestamp>-<random>.<ext>", subidos directo a la raíz
// del bucket, sin subcarpetas — así que un solo list() (paginado)
// alcanza; si algún día aparece una subcarpeta, este script la lista
// igual (Supabase Storage la devuelve como entrada con id=null) y avisa
// en vez de fallar en silencio.
//
// ⚠️  ESTO ES PARA PRODUCCIÓN REAL. Necesita un SERVICE ROLE KEY (RLS
// no alcanza — storage.objects de este proyecto no tiene ninguna
// política de DELETE, ver migración 001 — sólo select/insert/update,
// a propósito nunca se pudo borrar comprobantes desde la app).
//
// Uso:
//   PROD_SUPABASE_URL=https://xxxx.supabase.co \
//   PROD_SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/wipe-comprobantes-storage.js              # dry-run: sólo lista
//
//   PROD_SUPABASE_URL=https://xxxx.supabase.co \
//   PROD_SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/wipe-comprobantes-storage.js --confirm     # borra de verdad
//
// Las credenciales NUNCA van hardcodeadas acá ni en ningún archivo
// committeado — se pasan por variable de entorno en el momento de
// correrlo, a mano, una única vez. Nombres PROD_* a propósito
// (distintos de VITE_SUPABASE_URL/ANON_KEY, que son de staging) para
// que sea imposible confundir este script con los de tests/dev.
// ============================================================

import { createClient } from '@supabase/supabase-js'

const BUCKET = 'comprobantes'
const PAGE_SIZE = 100

const url        = process.env.PROD_SUPABASE_URL
const serviceKey = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY
const confirmar  = process.argv.includes('--confirm')

if (!url || !serviceKey) {
  console.error(
    '[wipe-comprobantes-storage] Faltan PROD_SUPABASE_URL / PROD_SUPABASE_SERVICE_ROLE_KEY.\n' +
    'Pasalas como variables de entorno al correr este script (nunca hardcodeadas, nunca en un archivo committeado). Ver el comentario de este archivo para el uso exacto.'
  )
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

async function listarTodo() {
  const archivos = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list('', {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) {
      throw new Error(`No se pudo listar el bucket "${BUCKET}": ${error.message}`)
    }
    if (!data || data.length === 0) break
    archivos.push(...data)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return archivos
}

async function main() {
  console.log(`[wipe-comprobantes-storage] Conectando a ${url} — bucket "${BUCKET}"...`)
  const archivos = await listarTodo()

  if (archivos.length === 0) {
    console.log('[wipe-comprobantes-storage] El bucket ya está vacío. Nada para hacer.')
    return
  }

  const carpetas = archivos.filter((a) => a.id === null)
  const planos   = archivos.filter((a) => a.id !== null)

  console.log(`\n[wipe-comprobantes-storage] ${archivos.length} entradas encontradas (${planos.length} archivos, ${carpetas.length} posibles subcarpetas):\n`)
  for (const a of archivos) {
    const tipo = a.id === null ? '[carpeta?]' : '[archivo]'
    console.log(`  ${tipo} ${a.name}`)
  }

  if (carpetas.length > 0) {
    console.log(
      `\n⚠️  ${carpetas.length} entrada(s) parecen ser subcarpetas (no esperado — la convención real de subida es ` +
      `nombres planos en la raíz, ver el comentario de este archivo). Este script NO recorre subcarpetas — ` +
      `revisarlas a mano antes de confirmar el borrado, si aparece alguna arriba.`
    )
  }

  if (!confirmar) {
    console.log(
      `\n[wipe-comprobantes-storage] DRY-RUN — no se borró nada. ` +
      `Volvé a correr con --confirm para borrar los ${planos.length} archivo(s) listados arriba.`
    )
    return
  }

  if (planos.length === 0) {
    console.log('\n[wipe-comprobantes-storage] No hay archivos (sólo carpetas) — nada para borrar.')
    return
  }

  console.log(`\n[wipe-comprobantes-storage] --confirm presente. Borrando ${planos.length} archivo(s)...`)
  const rutas = planos.map((a) => a.name)
  const { data: borrados, error: errBorrar } = await supabase.storage.from(BUCKET).remove(rutas)

  if (errBorrar) {
    console.error('[wipe-comprobantes-storage] ✗ Error borrando:', errBorrar.message)
    process.exit(1)
  }

  console.log(`[wipe-comprobantes-storage] ✓ ${borrados?.length ?? 0} archivo(s) borrados.`)

  const restantes = await listarTodo()
  const restantesPlanos = restantes.filter((a) => a.id !== null)
  if (restantesPlanos.length > 0) {
    console.warn(`[wipe-comprobantes-storage] ⚠️  Quedaron ${restantesPlanos.length} archivo(s) sin borrar — revisar a mano.`)
  } else {
    console.log('[wipe-comprobantes-storage] Verificado: el bucket quedó sin archivos.')
  }
}

main().catch((err) => {
  console.error('[wipe-comprobantes-storage] Error fatal:', err.message)
  process.exit(1)
})

# Testing — Fase 5

Este documento describe cómo testear la app durante Fase 5 (branch `feature/multi-complejo`).
**Todo esto corre exclusivamente contra el proyecto de Supabase de STAGING — nunca producción.**

## Entorno

Los tests reutilizan exactamente las mismas variables de entorno que ya usa la app en desarrollo
(`.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), que en este repo apuntan a staging.
No existe ningún `.env.production` ni service-role key en este repo, y no debería crearse uno para
tests — si algún día hace falta apuntar a otro proyecto, hacerlo explícito y visible, nunca como
default silencioso.

Los tests de integración/E2E necesitan además una sesión autenticada, porque las políticas RLS de
este proyecto siempre exigen `auth.uid()` — la anon key sola no alcanza para leer ni escribir nada.
Hay **dos** usuarios de prueba de staging, cada uno con sus credenciales en `.env.local` (nunca
hardcodeadas ni committeadas):

- **`TEST_USER_EMAIL` / `TEST_USER_PASSWORD`** — membresía en **los 5 complejos**. Usado por casi
  todo: filtrado por `complejo_id`, validaciones DB-dependientes, y para limpiar (`afterEach`) lo
  que crean otros tests, incluidos los del usuario limitado.
- **`TEST_USER_LIMITED_EMAIL` / `TEST_USER_LIMITED_PASSWORD`** — membresía **únicamente en
  cabanas-vip**. Usado por `tests/integration/rls-enforcement.test.js`, para probar que RLS bloquea
  a nivel de base — no sólo el filtrado de la app — cuando este usuario intenta leer/escribir en un
  complejo ajeno. **Desde Fase 6, esa misma fila de `membresias` tiene además `rol =
  'limitado_caja_silvia'`** (ver `021_membresias_rol.sql`), así que también sirve para
  `tests/integration/rol-limitado.test.js` — confirma el bloqueo de RLS por `rol` dentro de SU
  PROPIO complejo (caja_juli/caja_banco/caja_mercado_pago/periodos_precios/precios_pax), sin
  necesitar un tercer usuario de test. No se puede cambiar `rol` desde el cliente en cada corrida
  (`membresias` sólo tiene política de SELECT, nunca UPDATE, a propósito — nadie debería poder
  auto-promocionarse) — quedó seteado a mano, una única vez; ver el reporte de Fase 6 para el UPDATE
  puntual que hizo falta correr. Sus otros usos (reservas, movimientos_caja, cierres_caja) siguen
  funcionando igual: esas tablas son rol-independientes por diseño de esta feature.

`tests/setup/supabaseTestClient.js` expone `getFullAccessClient()` / `getLimitedAccessClient()`
(cada llamada crea una instancia de cliente nueva, autenticada como ese usuario — nunca se reutiliza
un cliente ya logueado como otro usuario, para que tests en paralelo no se pisen la sesión). Ambas
funciones fallan rápido con un error claro si a las variables de entorno correspondientes les falta
algo.

## Convención: datos de test

**Todo lo que crea un test automatizado (unit, integración o E2E) tiene que quedar identificable a
simple vista y ser fácil de barrer:**

| Tabla | Convención |
|---|---|
| `reservas` | `nombre_apellido` empieza con `"AUTOTEST_"` — ej. `"AUTOTEST_García, Juan"` |
| `movimientos_caja` (creado directo, no vía una reserva) | `detalle` empieza con `"AUTOTEST_"` |
| `cierres_caja` | `nombre` empieza con `"AUTOTEST_"` |

`tests/integration/helpers.js` tiene los helpers (`autotestNombre`, `autotestDetalle`,
`autotestCierreNombre`, `autotestCodigo`) que arman estos valores con un sufijo único por corrida,
para no colisionar con datos reales ni con otra corrida de tests.

Cada test de integración se borra a sí mismo por `id`, en su propio `afterEach`, usando el cliente
de acceso completo — **nunca depende únicamente del script de limpieza masiva** para quedar
prolijo. El script (`scripts/cleanup-test-data.js`) es la red de seguridad para lo que quede de una
corrida que falló antes de llegar a su `afterEach`.

## Correr los tests

```bash
npm test                 # unit tests (Vitest), una sola corrida — rápido, sin red ni credenciales
npm run test:watch       # unit tests en modo watch
npm run test:integration # tests de integración (Vitest, contra staging real) — ver más abajo
npm run test:e2e         # E2E (Playwright) — sin specs todavía, se agregan en un paso posterior
```

- **Unit** (`tests/unit/`, config en `vite.config.js`): 100% lógica pura, sin red ni DB. `npm test`
  nunca necesita `.env.local` ni credenciales de staging para pasar.
- **Integración** (`tests/integration/`, config separada en `vitest.integration.config.js`): pegan
  contra la base real de staging. `npm run test:integration` carga `.env.local` con
  `node --env-file=.env.local` (mismo patrón que `cleanup:test-data`) antes de lanzar Vitest con esa
  config aparte — nunca corren como parte de `npm test`, y timeout de 20s por test (red real).
- **E2E** (`tests/e2e/`, Playwright): flujo completo para Cabañas VIP (`vip.spec.js`, con login real
  por UI) y Mimmo (`mimmo.spec.js`, representativo NO-VIP), más un smoke test liviano por cada uno de
  los 3 complejos con precios de prueba (`non-vip-smoke.spec.js`). Crean datos reales en staging —
  **siempre con las convenciones `AUTOTEST_` de arriba** — y un `global-teardown` corre
  `cleanup:test-data` al final de la corrida completa, pase o falle. Un solo worker, sin paralelismo
  (`playwright.config.js`): pegan contra la misma base de staging compartida.

## Limpiar datos de test

```bash
npm run cleanup:test-data
```

(Ya carga `.env.local`, que ahora incluye `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`.) Esto corre
`scripts/cleanup-test-data.js`, que barre — de **todos** los complejos:

1. **Reservas** con `nombre_apellido` empezando en `AUTOTEST_`: borra sus comprobantes de Storage,
   sus filas asociadas en `caja_banco`/`caja_mercado_pago`/`caja_silvia` (Cabañas VIP) y finalmente
   la reserva — `movimientos_caja` (complejos NO-VIP) se borra solo, vía `ON DELETE CASCADE` de
   `reserva_id`.
2. **`movimientos_caja`** creados directamente (no vía una reserva) con `detalle` empezando en
   `AUTOTEST_`.
3. **`cierres_caja`** con `nombre` empezando en `AUTOTEST_` — `cierre_reconciliacion` y
   `cierre_reparto_ganancia` cascadean solos.

Correrlo después de cada tanda de tests de integración/E2E, y antes de cualquier demo o revisión,
para que staging no se llene de basura de test.

## Qué NO hacer

- No apuntar ningún test a producción, nunca, "para probar más rápido".
- No commitear ninguna de las 4 credenciales de usuario de test (`TEST_USER_EMAIL`,
  `TEST_USER_PASSWORD`, `TEST_USER_LIMITED_EMAIL`, `TEST_USER_LIMITED_PASSWORD`) ni ninguna otra
  credencial en ningún archivo del repo.
- No crear datos de test sin la convención `AUTOTEST_` que corresponda (ver tabla arriba).
- No asumir que `npm run cleanup:test-data` alcanzó todo si el usuario de test completo no tiene
  membresía en los 5 complejos — sin esa membresía, RLS le esconde las filas de los complejos donde
  no es miembro y el script no las va a poder borrar.
- No reimplementar a mano una query que la app ya expone (ver `src/pages/Reservas.jsx`,
  `CajaTemporada.jsx`, `Ganancias.jsx`, `ReservaForm.jsx`) para testearla "más fácil" — eso
  reintroduce el problema de mirror que Fase 5 (Parte B) ya eliminó. Si hace falta ejercitar una
  query real que hoy vive inline en un componente, extraerla como función exportada (mismo patrón
  ya usado en todo este proyecto), no duplicarla.

## Estado actual (Fase 5.3, este paso)

- ✅ Vitest configurado para unit (`vite.config.js`) e integración (`vitest.integration.config.js`,
  aparte, con más timeout) — nunca se mezclan.
- ✅ Playwright instalado y configurado (`playwright.config.js`, Chromium descargado), con los 3
  specs E2E de Fase 5.4 (`vip.spec.js`, `mimmo.spec.js`, `non-vip-smoke.spec.js`) pasando.
- ✅ `tests/setup/supabaseTestClient.js` con `getFullAccessClient()` / `getLimitedAccessClient()`.
- ✅ Script de limpieza (`scripts/cleanup-test-data.js`) extendido a reservas + movimientos_caja +
  cierres_caja.
- ✅ Unit tests de lógica pura (`tests/unit/`, sin ningún `[MIRROR]` — ver el reporte de la tarea
  anterior).
- ✅ Tests de integración (`tests/integration/`) — filtrado por `complejo_id`, RLS negativo y
  validaciones DB-dependientes. Ver el reporte de esta tarea para el estado real de ejecución (qué
  se pudo correr y verificar de punta a punta vs. qué quedó bloqueado por falta de credenciales) y
  para un hallazgo importante sobre el esquema de `movimientos_caja` que hay que resolver antes de
  confiar en estos tests contra staging.

### Bug real encontrado por `mimmo.spec.js` (Fase 5.4) — ya arreglado

`Ganancias.jsx` mostraba `Ingresos ARS`/`Gastos totales` en `$0` para complejos NO-VIP en casi
cualquier carga directa de la página, pese a haber datos reales. Causa: `complejoActivo` pasa
brevemente por un valor default (el primer complejo con membresía, `ComplejoContext.jsx`) antes de
que `Layout.jsx` lo corrija al slug real de la URL — el efecto de carga de datos de `Ganancias.jsx`
se disparaba dos veces, y si la corrida vieja (rama VIP, más lenta por sus 5 queries) resolvía
*después* de la nueva, su `.then()` pisaba el estado ya correcto. Arreglado agregando el mismo guard
`cancelado` que ya usa `ComplejoContext.jsx` (líneas 62/69/85-87), simétrico en las dos ramas del
efecto de `Ganancias.jsx`.

## Roles restringidos dentro de un complejo (Fase 6)

`membresias.rol` (`021_membresias_rol.sql`) — hoy sólo `'completo'` (default, todo lo de siempre) y
`'limitado_caja_silvia'` (Reservas + Disponibilidad + sólo la vista Caja Silvia, nada de
Ganancias/Precios/Caja Juli/Banco/Mercado Pago), bloqueado a nivel de RLS en
caja_juli/caja_banco/caja_mercado_pago/periodos_precios/precios_pax — no sólo escondido en la UI.
`tests/integration/rol-limitado.test.js` lo prueba reutilizando `TEST_USER_LIMITED` (ver arriba, su
membresía en cabanas-vip pasó a `rol='limitado_caja_silvia'`) en vez de crear un tercer usuario de
test.

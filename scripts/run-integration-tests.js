// Lanza Vitest contra tests/integration/, heredando las env vars ya
// cargadas por `node --env-file=.env.local` (con el que se invoca este
// script desde el script "test:integration" de package.json) — mismo
// patrón que scripts/cleanup-test-data.js.
import { spawnSync } from 'node:child_process'

const result = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.integration.config.js'], {
  stdio: 'inherit',
  shell: true,
})
process.exit(result.status ?? 1)

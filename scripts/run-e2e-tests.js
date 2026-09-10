// Lanza Playwright, heredando las env vars ya cargadas por
// `node --env-file=.env.local` (con el que se invoca este script desde
// el script "test:e2e" de package.json) — mismo patrón que
// scripts/run-integration-tests.js / scripts/cleanup-test-data.js.
import { spawnSync } from 'node:child_process'

const result = spawnSync('npx', ['playwright', 'test'], {
  stdio: 'inherit',
  shell: true,
})
process.exit(result.status ?? 1)

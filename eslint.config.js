import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Scripts de Node y helpers de test corren fuera del navegador (usan
    // `process`, entre otros globals de Node) — sin esto, `process` sale
    // como no-undef pese a ser código válido en su contexto real.
    files: [
      'scripts/**/*.js', 'tests/setup/**/*.js', 'tests/integration/**/*.js',
      'playwright.config.js', 'vite.config.js', 'vitest.integration.config.js',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Specs E2E corren en Node (Playwright, `process.env`) pero también
    // pasan callbacks que Playwright ejecuta DENTRO del navegador
    // (page.evaluate) — usan globals de los dos mundos en el mismo
    // archivo, así que necesitan ambos sets.
    files: ['tests/e2e/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
])

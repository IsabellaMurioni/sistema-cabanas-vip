import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Vitest config lives here (standard for Vite projects) rather than a
    // separate vitest.config.js, so it always shares the same plugins/
    // resolve settings as the app build.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup/vitest.setup.js'],
    include: ['tests/unit/**/*.test.{js,jsx}'],
  },
})

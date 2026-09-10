// Vitest global setup — runs before every test file.
//
// Loaded via vite.config.js's `test.setupFiles`. Adds jest-dom's DOM
// matchers (toBeInTheDocument, etc.) for when integration tests that
// render components are added in a later step. Part B's unit tests are
// pure-logic and don't need this, but it costs nothing to have ready.
import '@testing-library/jest-dom/vitest'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/testSetup.ts'],
    // Without this, vitest's default include glob also picks up compiled
    // *.test.js under dist/ (a gitignored build artifact) — found live
    // when a stale dist/ build ran its own old test copies alongside the
    // real src/ ones and failed on behavior since changed in src/.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})

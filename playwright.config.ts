import { defineConfig } from '@playwright/test'

/**
 * Browser smoke tests (`npm run e2e`), kept apart from the Vitest unit tests.
 * Headless Chromium renders WebGL through SwiftShader at a frame or two a
 * second, and the game counts at most 0.25 s per frame, so the game runs at
 * about a quarter speed here: the timeouts are long, and tests speed the
 * game up or set the store directly rather than wait.
 */
const PORT = 5199

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  // One browser at a time: software WebGL is CPU-bound.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader'] },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})

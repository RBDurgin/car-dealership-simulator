import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Dev container: listen on all interfaces so the forwarded port is reachable from the host.
  server: { host: true, port: 5173, strictPort: true },
  build: {
    rolldownOptions: {
      output: {
        // three.js, R3F and drei change only on an upgrade, so they're cached apart
        // from the game's own code, which changes with every release.
        codeSplitting: {
          groups: [
            {
              name: 'vendor-three',
              test: /node_modules[\\/](three|three-stdlib|@react-three)[\\/]/,
            },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/state/testSetup.ts'],
  },
})

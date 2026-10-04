import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Dev container: listen on all interfaces so the forwarded port is reachable from the host.
  server: { host: true, port: 5173, strictPort: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})

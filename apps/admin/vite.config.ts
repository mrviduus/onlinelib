import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 81,
    host: true,
    allowedHosts: ['textstack.dev', 'localhost', 'admin.localhost'],
    proxy: {
      '/api': {
        target: 'http://api:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  // `vite preview` is what the container runs in prod (Dockerfile switched
  // from `vite dev` to `vite build` + `vite preview`). preview is a separate
  // server config block — `server.*` above does not apply to it. /api proxy
  // isn't needed here because nginx handles it upstream in production.
  preview: {
    port: 81,
    host: true,
    allowedHosts: ['textstack.dev', 'localhost', 'admin.localhost'],
  },
})

import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@database': fileURLToPath(new URL('./src/database', import.meta.url)),
      '@sync': fileURLToPath(new URL('./src/sync', import.meta.url)),
      '@services': fileURLToPath(new URL('./src/services', import.meta.url)),
      '@state': fileURLToPath(new URL('./src/state', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    // Source maps are opt-in: shipping them inside the app bundle exposes the
    // full source and inflates the package. Use SOURCE_MAPS=true to debug a build.
    sourcemap: process.env.SOURCE_MAPS === 'true',
  },
})

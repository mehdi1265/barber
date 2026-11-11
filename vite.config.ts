import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '@features': new URL('./src/features', import.meta.url).pathname,
      '@shared': new URL('./src/shared', import.meta.url).pathname,
      '@database': new URL('./src/database', import.meta.url).pathname,
      '@sync': new URL('./src/sync', import.meta.url).pathname,
      '@services': new URL('./src/services', import.meta.url).pathname,
      '@state': new URL('./src/state', import.meta.url).pathname,
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})

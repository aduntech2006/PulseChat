import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  define: {
    // ✅ This ensures Axios fetch adapter works correctly in Vite
    global: 'globalThis',
    'process.env': {},  // ✅ Prevents process.env undefined errors
  },
})

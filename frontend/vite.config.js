import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // En dev : proxy les appels /api vers FastAPI (localhost:8000)
  server: {
    proxy: {
      '/api': 'http://localhost:8000'
    }
  },
  build: {
    outDir: 'dist',
    // Le build sera servi par FastAPI en production
  }
})

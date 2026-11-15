import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.js'] },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return
          if (id.includes('/@supabase/')) return 'supabase'
          if (id.includes('/react-router/') || id.includes('/@remix-run/')) return 'router'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react'
          if (id.includes('/lucide-react/')) return 'icons'
        },
      },
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const NGROK_URL = 'https://7cee-2409-40f4-2c-57ca-4c4e-16b3-409b-a46b.ngrok-free.app'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: NGROK_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      },
    },
  },
})

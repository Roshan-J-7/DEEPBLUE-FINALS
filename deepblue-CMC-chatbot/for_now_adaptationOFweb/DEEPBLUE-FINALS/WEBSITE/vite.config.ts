import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const NGROK_URL = 'https://4e75-2401-4900-4de4-a0b8-806a-3414-3ac4-e1ff.ngrok-free.app'

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

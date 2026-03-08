import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_URL = 'http://16.16.121.165:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: API_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/gtts': {
        target: 'https://translate.google.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gtts/, ''),
      },
    },
  },
})

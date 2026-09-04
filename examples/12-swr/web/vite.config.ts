import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/rpc': {
        target: 'http://127.0.0.1:3112',
        changeOrigin: true,
      },
    },
  },
})

import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/rpc': {
        target: 'http://127.0.0.1:3108',
        changeOrigin: true,
      },
    },
  },
})

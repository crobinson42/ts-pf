import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@ts-pf/protocol': new URL('./src/index.ts', import.meta.url).pathname,
    },
  },
})

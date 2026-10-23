import { defineConfig } from 'vitest/config'
import { selfAlias } from '../../vitest.shared.js'

export default defineConfig({
  resolve: { alias: selfAlias(import.meta.url) },
  test: {
    typecheck: {
      enabled: true,
      include: ['tests/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
})

import { defineConfig } from 'vitest/config'

// Root entry for `npx vitest list` / `npm run test:root`. `npm test` stays
// turbo-driven (builds first); this config expects `dist` to exist already.
// Examples are listed explicitly so `examples/README.md` is never read as a
// config file.
export default defineConfig({
  test: {
    projects: [
      'packages/*/vitest.config.ts',
      'examples/codegen/vitest.config.ts',
      'examples/hello/vitest.config.ts',
      'examples/message/vitest.config.ts',
      'examples/plugins/vitest.config.ts',
      'examples/stream/vitest.config.ts',
    ],
  },
})

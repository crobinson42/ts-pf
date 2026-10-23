// Refresh server/catalog.json and client/src/contract.d.ts from the live
// contract: the smoke test writes both when UPDATE=1. This wrapper sets the
// variable in-process so `npm run generate` works on every shell.
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const exampleRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const vitest = fileURLToPath(import.meta.resolve('vitest/vitest.mjs'))

const result = spawnSync(
  process.execPath,
  [vitest, 'run', 'tests/smoke.test.ts'],
  {
    cwd: exampleRoot,
    stdio: 'inherit',
    env: { ...process.env, UPDATE: '1' },
  },
)
process.exit(result.status ?? 1)

import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('each file in usecases exports one use case', async () => {
  const directory = fileURLToPath(new URL('../src/usecases/', import.meta.url))
  const files = (await readdir(directory)).filter((name) =>
    name.endsWith('.ts'),
  )
  expect(files.length).toBeGreaterThan(0)
  for (const file of files) {
    const name = file.replace(/\.ts$/, '')
    const imported = (await import(`../src/usecases/${name}.ts`)) as Record<
      string,
      unknown
    >
    const values = Object.values(imported)
    expect(values, file).toHaveLength(1)
    const useCase = values[0] as { kind?: string; summary?: string }
    expect(useCase.kind, file).toBe('use-case')
    expect(useCase.summary?.length, file).toBeGreaterThan(0)
  }
})

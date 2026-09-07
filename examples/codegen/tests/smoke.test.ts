import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { asResult } from '@ts-pf/client'
import { emit } from '@ts-pf/codegen'
import { createPlanetClient } from '@ts-pf/example-codegen-client'
import worker from '@ts-pf/example-codegen-server'
import { spec } from '@ts-pf/example-codegen-server/catalog'
import { describe, expect, it } from 'vitest'

const exampleRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = join(exampleRoot, 'server', 'catalog.json')
const dtsPath = join(exampleRoot, 'client', 'src', 'contract.d.ts')
const clientPkgPath = join(exampleRoot, 'client', 'package.json')
const clientSrcPath = join(exampleRoot, 'client', 'src')

const forbiddenDeps = [
  '@ts-pf/example-codegen-server',
  '@ts-pf/server',
  '@ts-pf/docs',
  '@ts-pf/codegen',
] as const

const fetchImpl: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : new Request(input, init)
  return worker.fetch(req)
}

describe('codegen example', () => {
  it('keeps the client package isolated from the live contract', () => {
    const pkg = JSON.parse(readFileSync(clientPkgPath, 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    for (const dep of forbiddenDeps) {
      expect(pkg.dependencies).not.toHaveProperty(dep)
      expect(pkg.devDependencies ?? {}).not.toHaveProperty(dep)
    }
    for (const name of readdirSync(clientSrcPath)) {
      if (!name.endsWith('.ts') || name.endsWith('.d.ts')) {
        continue
      }
      const text = readFileSync(join(clientSrcPath, name), 'utf8')
      for (const dep of forbiddenDeps) {
        expect(text).not.toContain(dep)
      }
      expect(text).not.toMatch(/from ['"][^'"]*\/server/)
    }
  })

  it('keeps catalog.json and contract.d.ts in sync with catalog() / emit()', () => {
    const dts = emit(spec)
    const json = `${JSON.stringify(spec, null, 2)}\n`
    if (process.env.UPDATE === '1') {
      writeFileSync(catalogPath, json)
      writeFileSync(dtsPath, dts)
    }
    expect(JSON.parse(readFileSync(catalogPath, 'utf8'))).toEqual(spec)
    expect(readFileSync(dtsPath, 'utf8')).toBe(dts)
  })

  it('serves catalog.json outside FetchHandler', async () => {
    const response = await worker.fetch(
      new Request('http://127.0.0.1/catalog.json'),
    )
    expect(response.ok).toBe(true)
    expect(await response.json()).toEqual(spec)
  })

  it('lists, finds, creates, and narrows NOT_FOUND from the generated Contract', async () => {
    const client = createPlanetClient(fetchImpl)

    const listed = await client.planet.list()
    expect(listed).toEqual(
      expect.arrayContaining([
        { id: 1, name: 'Earth' },
        { id: 2, name: 'Mars' },
      ]),
    )
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })

    const missing = await asResult(client.planet.find({ id: 999 }))
    expect(missing.ok).toBe(false)
    if (!missing.ok && missing.error.code === 'NOT_FOUND') {
      expect(missing.error.data.id).toBe(999)
    } else {
      expect.fail('expected NOT_FOUND')
    }

    expect(await client.planet.create({ name: 'Venus' })).toEqual({
      id: 3,
      name: 'Venus',
    })
  })
})

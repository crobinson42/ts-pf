import { emitFiles } from '@ts-pf/codegen'
import { procedure, router } from '@ts-pf/contract'
import { catalog, docs, type ProcedureCatalog } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { catalogHash } from '../src/hash.js'
import { fileStem } from '../src/names.js'
import { planetCatalog } from './planet-catalog.js'
import { typecheckDtsDir } from './typecheck-dts.js'

function byPath(files: ReadonlyArray<{ path: string; contents: string }>) {
  return new Map(files.map((file) => [file.path, file.contents]))
}

describe('fileStem', () => {
  it('joins segments with a dot and encodes a dot inside a segment', () => {
    expect(fileStem(['planet', 'find'])).toBe('planet.find')
    expect(fileStem(['planet.find'])).toBe('planet%2Efind')
  })

  it('keeps an index segment as a flat filename', () => {
    expect(fileStem(['planet', 'index'])).toBe('planet.index')
  })

  it('escapes stems that would take a reserved filename', () => {
    expect(fileStem(['contract'])).toBe('contract~')
    expect(fileStem(['_phantom'])).toBe('_phantom~')
    expect(fileStem(['CON'])).toBe('CON~')
    expect(fileStem(['com1'])).toBe('com1~')
  })

  it('percent-encodes non-ascii as UTF-8', () => {
    expect(fileStem(['café'])).toBe('caf%C3%A9')
  })

  it('throws on an empty segment and an over-long path', () => {
    expect(() => fileStem(['planet', ''])).toThrow(
      /Empty path segment in planet\//,
    )
    expect(() => fileStem(['a'.repeat(196)])).toThrow(
      /Generated path is too long/,
    )
    expect(fileStem(['a'.repeat(195)])).toBe('a'.repeat(195))
  })
})

describe('emitFiles', () => {
  it('splits planet into an entry, a group index, and one file per procedure', () => {
    const spec = planetCatalog()
    const files = byPath(emitFiles(spec))
    expect([...files.keys()]).toEqual([
      'contract.d.ts',
      '_phantom.d.ts',
      'planet.chat.d.ts',
      'planet.d.ts',
      'planet.find.d.ts',
      'planet.list.d.ts',
    ])

    const entry = files.get('contract.d.ts') ?? ''
    expect(entry).toContain(` * catalogHash: ${catalogHash(spec)}`)
    expect(entry).toContain("planet: import('./planet.js').Planet")
    expect(entry).not.toContain('ContractProcedure')

    const group = files.get('planet.d.ts') ?? ''
    expect(group).toContain("find: import('./planet.find.js').PlanetFind")
    expect(group).toContain("list: import('./planet.list.js').PlanetList")
    expect(group).toContain("chat: import('./planet.chat.js').PlanetChat")
    expect(group).not.toContain('{ id: number }')

    const find = files.get('planet.find.d.ts') ?? ''
    expect(find).toContain('export type PlanetFindInput = { id: number }')
    expect(find).toContain(
      'export type PlanetFindOutput = { id: number; name: string }',
    )
    expect(find).toContain('data: Phantom<{ id: number }>')
    expect(find).toContain("import type { Phantom } from './_phantom.js'")
    expect(find).toContain(`export type PlanetFind = ContractProcedure<
  PlanetFindInput,
  PlanetFindOutput,
  PlanetFindErrors
>`)
    expect(find).not.toContain('catalogHash')

    expect(files.get('planet.list.d.ts')).not.toContain('Phantom')
    expect(files.get('planet.list.d.ts')).not.toContain('Errors')
    expect(files.get('planet.chat.d.ts')).toContain(
      'export type PlanetChatOutput = AsyncIterable<{ token: string }>',
    )
    expect(files.get('_phantom.d.ts')).toContain('export type Phantom<T>')
    expect(files.get('_phantom.d.ts')).not.toContain('catalogHash')
  })

  it('nests group indexes and keeps a procedure named index flat', () => {
    const spec = catalog(
      router({
        admin: {
          users: {
            list: procedure.output(z.string()),
            index: procedure.output(z.number()),
          },
          audit: procedure.output(z.boolean()),
        },
      }),
    )
    const files = byPath(emitFiles(spec))
    expect(files.get('admin.d.ts')).toContain(
      "users: import('./admin.users.js').AdminUsers",
    )
    expect(files.get('admin.d.ts')).toContain(
      "audit: import('./admin.audit.js').AdminAudit",
    )
    expect(files.get('admin.users.d.ts')).toContain(
      "index: import('./admin.users.index.js').AdminUsersIndex",
    )
    expect(files.has('admin.users.index.d.ts')).toBe(true)
    expect([...files.keys()].some((path) => path.includes('/'))).toBe(false)
  })

  it('escapes a root procedure named contract and a dotted key', () => {
    const spec = catalog(
      router({
        contract: procedure.output(z.string()),
        'planet.find': procedure.output(z.number()),
        planetFind: procedure.output(z.boolean()),
      }),
    )
    const files = byPath(emitFiles(spec))
    const entry = files.get('contract.d.ts') ?? ''
    expect(entry).toContain("contract: import('./contract~.js').Contract")
    expect(entry).toContain(
      "'planet.find': import('./planet%2Efind.js').PlanetFind",
    )
    expect(entry).toContain("planetFind: import('./planetFind.js').PlanetFind")
    expect(files.has('contract~.d.ts')).toBe(true)
    expect(files.has('planet%2Efind.d.ts')).toBe(true)
  })

  it('omits Phantom when no error has data', () => {
    const spec = catalog(
      router({
        ping: procedure.errors({ GONE: { status: 410, message: 'gone' } }),
      }),
    )
    const files = byPath(emitFiles(spec))
    expect(files.has('_phantom.d.ts')).toBe(false)
    const ping = files.get('ping.d.ts') ?? ''
    expect(ping).not.toContain('Phantom')
    expect(ping).toContain('export type PingErrors = {')
    expect(ping).toContain('status: 410')
    expect(ping).not.toContain('data:')
  })

  it('prints JSDoc on the group property and above the procedure type', () => {
    const spec = catalog(
      router({
        planet: {
          find: procedure
            .meta(docs({ description: 'Find a planet by id' }))
            .meta({ kind: 'query' })
            .input(z.object({ id: z.number() })),
        },
      }),
    )
    const files = byPath(emitFiles(spec, { banner: false }))
    expect(files.get('planet.d.ts')).toContain(`  /**
   * Find a planet by id
   */
  find: import('./planet.find.js').PlanetFind`)
    expect(files.get('planet.find.d.ts')).toContain(`/**
 * Find a planet by id
 */
export type PlanetFind = ContractProcedure<`)
    expect(files.get('planet.find.d.ts')).not.toContain('kind')
    expect(files.get('contract.d.ts')).not.toContain('catalogHash')
    expect(files.get('contract.d.ts')).toContain(
      'Generated by @ts-pf/codegen. Do not edit.',
    )
  })

  it('honors name and throws like emit on a bad catalog', () => {
    const spec = planetCatalog()
    expect(emitFiles(spec, { name: 'Api' })[0]?.contents).toContain(
      'export type Api = {',
    )
    const unavailable = catalog(
      router({ ping: procedure.output({ not: 'a schema' }) }),
    )
    expect(() => emitFiles(unavailable, { failOnUnavailable: true })).toThrow(
      /Unavailable schema at ping output/,
    )
    const empty: ProcedureCatalog = {
      ...spec,
      procedures: [{ path: [], key: '', meta: {}, errors: [] }],
    }
    expect(() => emitFiles(empty)).toThrow(/Empty procedure path/)
    expect(() =>
      emitFiles({ ...spec, catalogVersion: 2 } as unknown as ProcedureCatalog),
    ).toThrow(/Unsupported catalogVersion/)
  })

  it('is deterministic', () => {
    const spec = planetCatalog()
    expect(emitFiles(spec)).toEqual(emitFiles(spec))
  })

  it('typechecks as createClient<Contract> with NOT_FOUND narrowing', () => {
    const files = new Map(
      emitFiles(planetCatalog()).map((file) => [file.path, file.contents]),
    )
    files.set(
      'consumer.ts',
      `import { asResult, createClient, type Link } from '@ts-pf/client'
import type { Contract } from './contract.js'

const link: Link = {
  call: () => Promise.reject(new Error('not called')) as ReturnType<Link['call']>,
}
const client = createClient<Contract>(link)

export async function check(): Promise<number> {
  const rows: { id: number; name: string }[] = await client.planet.list()
  const stream: AsyncIterable<{ token: string }> = await client.planet.chat({
    prompt: 'hi',
  })
  for await (const item of stream) {
    item.token
  }
  const result = await asResult(client.planet.find({ id: 1 }))
  if (!result.ok && result.error.code === 'NOT_FOUND') {
    const id: number = result.error.data.id
    return id + rows.length
  }
  return rows.length
}
`,
    )
    expect(typecheckDtsDir(files, 'consumer.ts')).toEqual([])
  })
})

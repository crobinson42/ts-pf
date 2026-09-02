import { catalog } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'
import { contract } from '../src/contract.js'
import { toMarkdown } from '../src/markdown.js'

describe('10-docs', () => {
  it('builds a JSON-serializable catalog from the contract', () => {
    const spec = catalog(contract, { prefix: '/rpc' })
    expect(spec.procedures.map((p) => p.key)).toEqual([
      'planet/list',
      'planet/find',
      'planet/create',
    ])
    expect(
      spec.procedures.find((p) => p.key === 'planet/find')?.docs?.description,
    ).toMatch(/planet/i)
    expect(JSON.parse(JSON.stringify(spec)).catalogVersion).toBe(1)
  })

  it('renders markdown from the catalog in userland', () => {
    const md = toMarkdown(catalog(contract, { prefix: '/rpc' }))
    expect(md).toContain('POST /rpc/planet/find')
    expect(md).toContain('NOT_FOUND')
  })
})

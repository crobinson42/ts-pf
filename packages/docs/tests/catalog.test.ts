import { procedure, router } from '@ts-pf/contract'
import { PROTOCOL_HEADER, PROTOCOL_VERSION } from '@ts-pf/protocol'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { catalog } from '../src/catalog.js'
import { docs } from '../src/docs.js'

describe('catalog', () => {
  const contract = router({
    planet: {
      find: procedure
        .meta(docs({ description: 'Find a planet by id' }))
        .meta({ auth: true })
        .input(z.object({ id: z.number() }))
        .output(z.object({ id: z.number(), name: z.string() }))
        .errors({ NOT_FOUND: { status: 404, message: 'Missing' } }),
      list: procedure.output(z.array(z.object({ id: z.number() }))),
      hidden: procedure
        .meta(docs({ hidden: true, description: 'internal' }))
        .output(z.string()),
    },
  })

  it('lists procedures with path, docs, errors, and protocol snapshot', () => {
    const result = catalog(contract, { prefix: '/rpc', schemas: false })
    expect(result.catalogVersion).toBe(1)
    expect(result.protocol).toEqual({
      name: 'ts-pf',
      version: PROTOCOL_VERSION,
      header: { name: PROTOCOL_HEADER, value: PROTOCOL_VERSION },
      method: 'POST',
    })
    expect(result.prefix).toBe('/rpc')
    expect(result.procedures.map((p) => p.key)).toEqual([
      'planet/find',
      'planet/list',
    ])
    const find = result.procedures[0]
    expect(find).toMatchObject({
      path: ['planet', 'find'],
      key: 'planet/find',
      href: '/rpc/planet/find',
      docs: { description: 'Find a planet by id' },
      meta: {
        docs: { description: 'Find a planet by id' },
        auth: true,
      },
      errors: [{ code: 'NOT_FOUND', status: 404, message: 'Missing' }],
    })
    expect(find).not.toHaveProperty('input')
    expect(find).not.toHaveProperty('output')
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  it('skips hidden procedures unless filter includes them', () => {
    const shown = catalog(contract, { schemas: false })
    expect(shown.procedures.map((p) => p.key)).not.toContain('planet/hidden')

    const all = catalog(contract, {
      schemas: false,
      filter: () => true,
    })
    expect(all.procedures.map((p) => p.key)).toContain('planet/hidden')
  })

  it('omits href when prefix is not set', () => {
    const result = catalog(contract, { schemas: false })
    expect(result.procedures[0]).not.toHaveProperty('href')
    expect(result).not.toHaveProperty('prefix')
  })

  it('includes protocol error codes once, not per procedure', () => {
    const result = catalog(contract, { schemas: false })
    expect(result.protocolErrors.map((e) => e.code)).toEqual([
      'BAD_REQUEST',
      'VALIDATION',
      'NOT_FOUND',
      'INTERNAL',
      'METHOD_NOT_ALLOWED',
      'PAYLOAD_TOO_LARGE',
    ])
  })
})

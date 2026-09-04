import { procedure, router } from '@ts-pf/contract'
import { PROTOCOL_HEADER } from '@ts-pf/http'
import { PROTOCOL_VERSION } from '@ts-pf/protocol'
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
    const validation = result.protocolErrors.find(
      (e) => e.code === 'VALIDATION',
    )
    expect(validation?.data?.kind).toBe('json')
    if (validation?.data?.kind === 'json') {
      expect(validation.data.jsonSchema).toMatchObject({
        type: 'object',
        required: ['issues'],
        properties: {
          issues: {
            type: 'array',
            items: {
              type: 'object',
              required: ['message', 'path'],
            },
          },
        },
      })
    }
    for (const err of result.protocolErrors) {
      if (err.code !== 'VALIDATION') {
        expect(err).not.toHaveProperty('data')
      }
    }
  })

  it('attaches JSON Schema for input, output, and error data', () => {
    const withErrorData = router({
      planet: {
        find: procedure
          .input(z.object({ id: z.number() }))
          .output(z.object({ id: z.number(), name: z.string() }))
          .errors({
            NOT_FOUND: {
              status: 404,
              data: z.object({ id: z.number() }),
            },
          }),
      },
    })
    const result = catalog(withErrorData)
    const find = result.procedures.find((p) => p.key === 'planet/find')
    expect(find?.input?.kind).toBe('json')
    expect(find?.output?.kind).toBe('json')
    if (find?.input?.kind === 'json') {
      expect(find.input.jsonSchema).toMatchObject({
        type: 'object',
        properties: { id: { type: 'number' } },
      })
    }
    expect(find?.errors[0]?.data?.kind).toBe('json')
  })

  it('marks ts-pf stream schemas as kind stream without converting the iterable', async () => {
    const { stream } = await import('@ts-pf/stream')
    const streamed = router({
      chat: procedure.output(stream(z.object({ token: z.string() }))),
    })
    const result = catalog(streamed)
    const output = result.procedures[0]?.output
    expect(output?.kind).toBe('stream')
    if (output?.kind === 'stream') {
      expect(output.vendor).toBe('ts-pf')
      expect(output.item?.kind).toBe('json')
      if (output.item?.kind === 'json') {
        expect(output.item.jsonSchema).toMatchObject({
          type: 'object',
          properties: { token: { type: 'string' } },
        })
      }
    }
  })

  it('omits stream item when the brand is missing', () => {
    const branded = {
      '~standard': {
        version: 1,
        vendor: 'ts-pf',
        validate: async () => ({ value: undefined }),
      },
    }
    const streamed = router({
      chat: procedure.output(branded),
    })
    const result = catalog(streamed)
    expect(result.procedures[0]?.output).toEqual({
      kind: 'stream',
      vendor: 'ts-pf',
    })
  })

  it('records unavailable when a schema has no converter', () => {
    const odd = router({
      ping: procedure.output({ not: 'a schema' }),
    })
    const result = catalog(odd)
    expect(result.procedures[0]?.output).toMatchObject({
      kind: 'unavailable',
    })
  })
})

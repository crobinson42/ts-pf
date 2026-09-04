import { procedure, router } from '@ts-pf/contract'
import { catalog, docs } from '@ts-pf/docs'
import Type from 'typebox'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { openapi } from '../src/openapi.js'

const planet = router({
  planet: {
    list: procedure
      .meta(docs({ description: 'List planets' }))
      .output(z.array(z.object({ id: z.number(), name: z.string() }))),
    find: procedure
      .meta(
        docs({
          description: 'Find a planet by id',
          summary: 'Find planet',
          tags: ['planets'],
        }),
      )
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({
        NOT_FOUND: {
          status: 404,
          message: 'Missing',
          data: z.object({ id: z.number() }),
        },
      }),
    create: procedure
      .meta(docs({ description: 'Create a planet', deprecated: true }))
      .input(Type.Object({ name: Type.String() }))
      .output(Type.Object({ id: Type.Number(), name: Type.String() })),
    hidden: procedure.meta(docs({ hidden: true })).output(z.string()),
  },
  ping: procedure,
})

describe('openapi', () => {
  const spec = openapi(catalog(planet, { prefix: '/rpc' }), {
    info: {
      title: 'Planet API',
      version: '1.0.0',
      description: 'RPC',
    },
    servers: [{ url: 'https://api.example.com' }],
  })

  it('builds paths, operationIds, tags, and the protocol header', () => {
    expect(Object.keys(spec.paths)).toEqual([
      '/rpc/planet/list',
      '/rpc/planet/find',
      '/rpc/planet/create',
      '/rpc/ping',
    ])
    expect(spec.paths['/rpc/planet/find']?.post?.operationId).toBe(
      'planet.find',
    )
    expect(spec.paths['/rpc/planet/find']?.post?.tags).toEqual(['planets'])
    expect(spec.paths['/rpc/planet/list']?.post?.tags).toEqual(['planet'])
    expect(spec.paths['/rpc/ping']?.post?.tags).toBeUndefined()
    expect(spec.tags).toEqual([{ name: 'planet' }, { name: 'planets' }])
    expect(spec.paths['/rpc/planet/find']?.post?.parameters).toEqual([
      { $ref: '#/components/parameters/TsPfProtocol' },
    ])
    expect(spec.components.parameters?.TsPfProtocol).toMatchObject({
      name: 'x-ts-pf-protocol',
      in: 'header',
      required: true,
      schema: { type: 'string', const: '1' },
    })
    expect(spec.jsonSchemaDialect).toBe(
      'https://json-schema.org/draft/2020-12/schema',
    )
    expect(spec.info).toEqual({
      title: 'Planet API',
      version: '1.0.0',
      description: 'RPC',
    })
    expect(spec.servers).toEqual([{ url: 'https://api.example.com' }])
  })

  it('omits hidden procedures via the catalog', () => {
    expect(spec.paths).not.toHaveProperty('/rpc/planet/hidden')
  })

  it('marks deprecated from docs()', () => {
    expect(spec.paths['/rpc/planet/create']?.post?.deprecated).toBe(true)
    expect(spec.paths['/rpc/planet/find']?.post).not.toHaveProperty(
      'deprecated',
    )
  })

  it('wraps declared error data on the matching HTTP status', () => {
    const find = spec.paths['/rpc/planet/find']?.post
    expect(find?.responses['404']?.description).toBe('Missing')
    expect(
      find?.responses['404']?.content?.['application/json']?.schema,
    ).toEqual({ $ref: '#/components/schemas/planet.find.Error.NOT_FOUND' })
    const errorSchema = spec.components.schemas['planet.find.Error.NOT_FOUND']
    expect(JSON.stringify(errorSchema)).toContain('"const":"NOT_FOUND"')
    expect(JSON.stringify(errorSchema)).toContain('"data"')
  })

  it('attaches matched-POST protocol errors and skips 404/405 protocol codes', () => {
    const find = spec.paths['/rpc/planet/find']?.post
    expect(find?.responses['400']).toBeDefined()
    expect(find?.responses['422']).toBeDefined()
    expect(find?.responses['413']).toBeDefined()
    expect(find?.responses['500']).toBeDefined()
    expect(find?.responses['405']).toBeUndefined()
    const list = spec.paths['/rpc/planet/list']?.post
    expect(list?.responses['422']).toBeUndefined()
    expect(list?.responses['404']).toBeUndefined()
  })

  it('omits protocol errors when protocolErrors is false', () => {
    const slim = openapi(catalog(planet, { prefix: '/rpc' }), {
      info: { title: 'Planet API', version: '1' },
      protocolErrors: false,
    })
    const find = slim.paths['/rpc/planet/find']?.post
    expect(find?.responses['404']).toBeDefined()
    expect(find?.responses['400']).toBeUndefined()
    expect(find?.responses['422']).toBeUndefined()
    expect(find?.responses['500']).toBeUndefined()
    expect(slim.components.schemas).not.toHaveProperty('TsPf.Error.VALIDATION')
  })

  it('keeps no-input request bodies optional and no-output success as ok only', () => {
    const ping = spec.paths['/rpc/ping']?.post
    expect(ping?.requestBody?.required).toBeUndefined()
    const request = spec.components.schemas['ping.Request']
    expect(request).toMatchObject({
      properties: { input: { type: 'null' } },
    })
    expect(request).not.toHaveProperty('required')
    const success = spec.components.schemas['ping.Success']
    expect(success).toMatchObject({
      required: ['ok'],
      properties: { ok: { const: true } },
    })
  })

  it('still emits an operation when a schema is unavailable', () => {
    const odd = openapi(
      catalog(router({ ping: procedure.output({ not: 'a schema' }) })),
      { info: { title: 'X', version: '1' } },
    )
    expect(odd.paths['/ping']?.post).toBeDefined()
    const success = odd.components.schemas['ping.Success']
    expect(JSON.stringify(success)).toMatch(/unavailable/i)
  })

  it('adds multipart only when opted in, on unary JSON requests', () => {
    const withFiles = openapi(catalog(planet, { prefix: '/rpc' }), {
      info: { title: 'Planet API', version: '1' },
      multipart: true,
    })
    expect(
      spec.paths['/rpc/planet/find']?.post?.requestBody?.content,
    ).not.toHaveProperty('multipart/form-data')
    expect(
      withFiles.paths['/rpc/planet/find']?.post?.requestBody?.content,
    ).toHaveProperty('multipart/form-data')
  })

  it('round-trips through JSON', () => {
    expect(JSON.parse(JSON.stringify(spec))).toEqual(spec)
  })

  it('throws on missing info and unknown catalog versions', () => {
    const cat = catalog(planet)
    expect(() => openapi(cat, { info: { title: '', version: '1' } })).toThrow(
      /title/,
    )
    expect(() =>
      openapi(
        { ...cat, catalogVersion: 2 as 1 },
        {
          info: { title: 'X', version: '1' },
        },
      ),
    ).toThrow(/catalogVersion/)
  })

  it('uses href when prefix is set and /{key} when it is not', () => {
    const noPrefix = openapi(catalog(planet), {
      info: { title: 'Planet API', version: '1' },
    })
    expect(noPrefix.paths).toHaveProperty('/planet/find')
    expect(noPrefix.paths).not.toHaveProperty('/rpc/planet/find')
  })
})

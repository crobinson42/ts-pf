import { procedure, router } from '@ts-pf/contract'
import { catalog } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { openapi } from '../src/openapi.js'

describe('RPC-shaped OpenAPI (not REST)', () => {
  const spec = openapi(
    catalog(
      router({
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
      }),
      { prefix: '/rpc' },
    ),
    { info: { title: 'Planet API', version: '1.0.0' } },
  )

  it('is OpenAPI 3.1.0', () => {
    expect(spec.openapi).toBe('3.1.0')
  })

  it('emits POST only', () => {
    for (const item of Object.values(spec.paths)) {
      expect(item.post).toBeDefined()
      expect(item).not.toHaveProperty('get')
      expect(item).not.toHaveProperty('put')
      expect(item).not.toHaveProperty('patch')
      expect(item).not.toHaveProperty('delete')
    }
  })

  it('does not emit path or query parameters', () => {
    for (const item of Object.values(spec.paths)) {
      const params = item.post?.parameters ?? []
      for (const param of params) {
        if ('$ref' in param) {
          continue
        }
        expect(param.in).not.toBe('path')
        expect(param.in).not.toBe('query')
      }
    }
  })

  it('wraps input in the RPC envelope, not as path params', () => {
    const request = spec.components.schemas['planet.find.Request'] as {
      properties?: { input?: unknown; id?: unknown }
    }
    expect(request.properties).toHaveProperty('input')
    expect(request.properties).not.toHaveProperty('id')
    expect(Object.keys(spec.paths)).toEqual(['/rpc/planet/find'])
  })

  it('wraps failures as { ok, error.code } without error.status', () => {
    const failure = spec.components.schemas['planet.find.Error.NOT_FOUND'] as {
      properties?: {
        ok?: unknown
        error?: { properties?: { code?: unknown; status?: unknown } }
      }
    }
    expect(failure.properties).toHaveProperty('ok')
    expect(failure.properties?.error?.properties).toHaveProperty('code')
    expect(failure.properties?.error?.properties).not.toHaveProperty('status')
  })
})

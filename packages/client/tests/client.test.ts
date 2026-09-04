import {
  asResult,
  createClient,
  isLocalFailure,
  type Link,
} from '@ts-pf/client'
import { procedure, router } from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  planet: {
    list: procedure.output(
      z.array(z.object({ id: z.number(), name: z.string() })),
    ),
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      }),
  },
})

function memoryLink(): Link {
  return {
    call(path, input) {
      if (path.join('.') === 'planet.list') {
        return Promise.resolve([{ id: 1, name: 'Earth' }])
      }
      const id = (input as { id: number }).id
      if (id < 0) {
        return Promise.reject(
          new PFError({
            code: 'NOT_FOUND',
            status: 404,
            data: { id },
            message: 'NOT_FOUND',
          }),
        )
      }
      return Promise.resolve({ id, name: 'Earth' })
    },
  }
}

describe('createClient', () => {
  const client = createClient<typeof contract>(memoryLink())

  it('calls a nested procedure over Link', async () => {
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
  })

  it('calls a no-input procedure', async () => {
    expect(await client.planet.list()).toEqual([{ id: 1, name: 'Earth' }])
  })

  it('asResult() returns a result union', async () => {
    const result = await asResult(client.planet.find({ id: -1 }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND')
    }
  })

  it('asResult preserves ClientError narrowing', async () => {
    const result = await asResult(client.planet.find({ id: -1 }))
    expect(result.ok).toBe(false)
    if (!result.ok && result.error.code === 'NOT_FOUND') {
      expectTypeOf(result.error.data).toEqualTypeOf<{ id: number }>()
      expect(result.error.data).toEqual({ id: -1 })
    }
  })
})

describe('isLocalFailure', () => {
  it('is true only for PFError with local true', () => {
    expect(
      isLocalFailure(new PFError({ code: 'INTERNAL', status: 0, local: true })),
    ).toBe(true)
    expect(isLocalFailure(new PFError({ code: 'INTERNAL', status: 0 }))).toBe(
      false,
    )
    expect(isLocalFailure(new PFError({ code: 'INTERNAL', status: 500 }))).toBe(
      false,
    )
    expect(
      isLocalFailure(new PFError({ code: 'NOT_FOUND', status: 404 })),
    ).toBe(false)
    expect(isLocalFailure(new Error('fetch failed'))).toBe(false)
  })

  it('narrows local to true', () => {
    const error: unknown = new PFError({
      code: 'INTERNAL',
      status: 0,
      local: true,
      message: 'fetch failed',
    })
    if (isLocalFailure(error)) {
      expectTypeOf(error.local).toEqualTypeOf<true>()
      expectTypeOf(error.code).toEqualTypeOf<string>()
    }
  })
})

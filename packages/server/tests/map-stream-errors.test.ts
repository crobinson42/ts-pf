import { procedure, router } from '@ts-pf/contract'
import { isPFError, PFError } from '@ts-pf/protocol'
import {
  createImplementer,
  createLocalClient,
  mapStreamErrors,
} from '@ts-pf/server'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

class QuotaExceeded extends Error {
  constructor(readonly retryAfter: unknown) {
    super('quota exceeded')
  }
}

/** The documented mapper: keep `PFError`s, map domain errors, else keep. */
function mapError(error: unknown): unknown {
  if (isPFError(error)) {
    return error
  }
  if (error instanceof QuotaExceeded) {
    return new PFError({
      code: 'LIMIT',
      message: 'Slow down',
      data: { retryAfter: error.retryAfter },
    })
  }
  return error
}

/** An iterator that records calls; `next()` stays pending until released. */
function controlledSource() {
  const calls: string[] = []
  let release: (() => void) | undefined
  const source: AsyncIterable<number> = {
    [Symbol.asyncIterator]() {
      calls.push('iterator')
      return {
        next() {
          calls.push('next')
          return new Promise<IteratorResult<number>>((resolve) => {
            release = () => resolve({ done: false, value: 1 })
          })
        },
        async return() {
          calls.push('return')
          release?.()
          return { done: true, value: undefined }
        },
      }
    },
  }
  return { source, calls }
}

describe('mapStreamErrors', () => {
  it('returns a non-iterable value unchanged', () => {
    const value = { id: 1 }
    expect(mapStreamErrors(value, mapError)).toBe(value)
    expect(mapStreamErrors(undefined, mapError)).toBeUndefined()
    expectTypeOf(mapStreamErrors(value, mapError)).toEqualTypeOf<{
      id: number
    }>()
  })

  it('maps a throw from the source and throws what fn returns', async () => {
    async function* source() {
      yield 1
      throw new QuotaExceeded(5)
    }
    const items: number[] = []
    const run = async () => {
      for await (const item of mapStreamErrors(source(), mapError)) {
        items.push(item)
      }
    }
    await expect(run()).rejects.toMatchObject({
      code: 'LIMIT',
      data: { retryAfter: 5 },
    })
    expect(items).toEqual([1])
  })

  it('passes a value fn returns unchanged through as is', async () => {
    const error = new PFError({ code: 'VALIDATION', message: 'Bad item' })
    async function* source() {
      yield 1
      throw error
    }
    const it = mapStreamErrors(source(), mapError)[Symbol.asyncIterator]()
    await it.next()
    await expect(it.next()).rejects.toBe(error)
  })

  it('forwards return() before the first next()', async () => {
    const { source, calls } = controlledSource()
    const it = mapStreamErrors(source, mapError)[Symbol.asyncIterator]()
    await expect(it.return?.()).resolves.toEqual({
      done: true,
      value: undefined,
    })
    expect(calls).toEqual(['iterator', 'return'])
  })

  it('forwards return() during a pending next(), once', async () => {
    const { source, calls } = controlledSource()
    const it = mapStreamErrors(source, mapError)[Symbol.asyncIterator]()
    const pending = it.next()
    await it.return?.()
    await it.return?.()
    await pending
    expect(calls).toEqual(['iterator', 'next', 'return'])
  })
})

describe('mapStreamErrors in a .use() middleware', () => {
  const contract = router({
    find: procedure.input(z.object({ id: z.number() })).errors({
      LIMIT: { status: 429, data: z.object({ retryAfter: z.number() }) },
    }),
    tokens: procedure.errors({
      LIMIT: { status: 429, data: z.object({ retryAfter: z.number() }) },
    }),
  })
  const impl = createImplementer(contract)
  const mapping = impl.middleware(async ({ next }) => {
    try {
      return mapStreamErrors(await next(), mapError)
    } catch (error) {
      throw mapError(error)
    }
  })

  function client(retryAfter: unknown) {
    const app = impl.use(mapping).router({
      find: impl.find.handler(async () => {
        throw new QuotaExceeded(retryAfter)
      }),
      tokens: impl.tokens.handler(async function* () {
        yield 'a'
        throw new QuotaExceeded(retryAfter)
      }),
    })
    return createLocalClient(app, { context: {} })
  }

  async function drain(iterable: unknown): Promise<unknown[]> {
    const items: unknown[] = []
    for await (const item of iterable as AsyncIterable<unknown>) {
      items.push(item)
    }
    return items
  }

  it('maps a unary throw to the declared error', async () => {
    await expect(client(5).find({ id: 1 })).rejects.toMatchObject({
      code: 'LIMIT',
      data: { retryAfter: 5 },
    })
  })

  it('keeps an input VALIDATION failure as is', async () => {
    await expect(client(5).find({ id: 'x' } as never)).rejects.toMatchObject({
      code: 'VALIDATION',
    })
  })

  it('maps a mid-stream throw to the declared error with checked data', async () => {
    const iterable = await client(5).tokens()
    await expect(drain(iterable)).rejects.toMatchObject({
      code: 'LIMIT',
      data: { retryAfter: 5 },
    })
  })

  it('finalizes a mapped error whose data does not match into INTERNAL', async () => {
    const iterable = await client('soon').tokens()
    await expect(drain(iterable)).rejects.toMatchObject({
      code: 'INTERNAL',
      message: 'Internal server error',
    })
  })

  it('without the mapping, the domain error is not a declared code', async () => {
    const app = impl.router({
      find: impl.find.handler(async () => ({})),
      tokens: impl.tokens.handler(async function* () {
        yield 'a'
        throw new QuotaExceeded(5)
      }),
    })
    const iterable = await createLocalClient(app, { context: {} }).tokens()
    await expect(drain(iterable)).rejects.toBeInstanceOf(QuotaExceeded)
  })
})

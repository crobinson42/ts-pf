import { isAsyncIterable } from '@ts-pf/protocol'
import { describe, expect, expectTypeOf, it } from 'vitest'

describe('isAsyncIterable', () => {
  it('accepts async generators and hand-rolled async iterables', () => {
    async function* gen() {
      yield 1
    }
    expect(isAsyncIterable(gen())).toBe(true)
    expect(
      isAsyncIterable({
        [Symbol.asyncIterator]() {
          return {
            next: async () => ({ done: true as const, value: undefined }),
          }
        },
      }),
    ).toBe(true)
    const fn = Object.assign(() => {}, {
      async *[Symbol.asyncIterator]() {
        yield 1
      },
    })
    expect(isAsyncIterable(fn)).toBe(true)
  })

  it('treats a ReadableStream as async-iterable (Node and modern browsers)', () => {
    expect(isAsyncIterable(new ReadableStream<Uint8Array>())).toBe(true)
  })

  it('rejects values that cannot drive for await', () => {
    expect(isAsyncIterable({})).toBe(false)
    expect(isAsyncIterable({ [Symbol.asyncIterator]: 42 })).toBe(false)
    expect(isAsyncIterable([1, 2, 3])).toBe(false)
    expect(isAsyncIterable('abc')).toBe(false)
    expect(isAsyncIterable(null)).toBe(false)
    expect(isAsyncIterable(undefined)).toBe(false)
    expect(isAsyncIterable(1)).toBe(false)
    expect(isAsyncIterable(new Blob(['x']))).toBe(false)
    expect(isAsyncIterable(new FormData())).toBe(false)
  })

  it('narrows to AsyncIterable<unknown>', () => {
    const value: unknown = undefined
    if (isAsyncIterable(value)) {
      expectTypeOf(value).toEqualTypeOf<AsyncIterable<unknown>>()
    }
  })
})

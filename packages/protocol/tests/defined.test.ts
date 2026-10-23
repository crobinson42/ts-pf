import { defined } from '@ts-pf/protocol'
import { describe, expect, expectTypeOf, it } from 'vitest'

describe('defined', () => {
  it('drops undefined-valued keys and keeps the rest', () => {
    const signal = new AbortController().signal
    const result = defined({ a: 1, b: undefined, c: null, d: signal, e: '' })
    expect(result).toEqual({ a: 1, c: null, d: signal, e: '' })
    expect('b' in result).toBe(false)
  })

  it('returns a new object and leaves the input untouched', () => {
    const input = { a: 1, b: undefined }
    const result = defined(input)
    expect(result).not.toBe(input)
    expect(input).toEqual({ a: 1, b: undefined })
  })

  it('fits an exactOptionalPropertyTypes option bag when spread', () => {
    const signal: AbortSignal | undefined = undefined
    const opts: { path: string[]; signal?: AbortSignal } = {
      path: ['a'],
      ...defined({ signal }),
    }
    expect(opts).toEqual({ path: ['a'] })
    expectTypeOf(defined({ signal })).toExtend<{ signal?: AbortSignal }>()
    expectTypeOf(defined({ n: 1, s: signal })).toExtend<{
      n: number
      s?: AbortSignal
    }>()
  })
})

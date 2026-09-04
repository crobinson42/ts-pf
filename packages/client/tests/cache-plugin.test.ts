import { CachePlugin, intercept, type Link } from '@ts-pf/client'
import { localFailure } from '@ts-pf/protocol'
import { describe, expect, it } from 'vitest'

function asyncInput(): AsyncIterable<number> {
  return {
    async *[Symbol.asyncIterator]() {
      yield 1
    },
  }
}

function asyncOutput(): AsyncIterable<number> {
  return {
    async *[Symbol.asyncIterator]() {
      yield 1
    },
  }
}

describe('CachePlugin', () => {
  it('returns a cached hit within ttl without calling next again', async () => {
    let calls = 0
    const link: Link = {
      call() {
        calls++
        return Promise.resolve({ id: 1 })
      },
    }
    const wrapped = intercept(link, {
      plugins: [new CachePlugin({ ttl: 60_000 })],
    })
    expect(await wrapped.call(['echo'], { id: 1 })).toEqual({ id: 1 })
    expect(await wrapped.call(['echo'], { id: 1 })).toEqual({ id: 1 })
    expect(calls).toBe(1)
  })

  it('misses after ttl expires', async () => {
    let calls = 0
    const link: Link = {
      call() {
        calls++
        return Promise.resolve({ n: calls })
      },
    }
    const wrapped = intercept(link, {
      plugins: [new CachePlugin({ ttl: 1 })],
    })
    expect(await wrapped.call(['echo'], { id: 1 })).toEqual({ n: 1 })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(await wrapped.call(['echo'], { id: 1 })).toEqual({ n: 2 })
    expect(calls).toBe(2)
  })

  it('does not cache errors', async () => {
    let calls = 0
    const err = localFailure('Network error')
    const link: Link = {
      call() {
        calls++
        if (calls === 1) {
          return Promise.reject(err)
        }
        return Promise.resolve('ok')
      },
    }
    const wrapped = intercept(link, {
      plugins: [new CachePlugin({ ttl: 60_000 })],
    })
    await expect(wrapped.call(['echo'], { id: 1 })).rejects.toBe(err)
    expect(await wrapped.call(['echo'], { id: 1 })).toBe('ok')
    expect(calls).toBe(2)
  })

  it('skips AsyncIterable input', async () => {
    let calls = 0
    const link: Link = {
      call() {
        calls++
        return Promise.resolve('ok')
      },
    }
    const wrapped = intercept(link, {
      plugins: [new CachePlugin({ ttl: 60_000 })],
    })
    expect(await wrapped.call(['echo'], asyncInput())).toBe('ok')
    expect(await wrapped.call(['echo'], asyncInput())).toBe('ok')
    expect(calls).toBe(2)
  })

  it('does not cache AsyncIterable output', async () => {
    let calls = 0
    const link: Link = {
      call() {
        calls++
        return Promise.resolve(asyncOutput())
      },
    }
    const wrapped = intercept(link, {
      plugins: [new CachePlugin({ ttl: 60_000 })],
    })
    const first = await wrapped.call(['echo'], { id: 1 })
    const second = await wrapped.call(['echo'], { id: 1 })
    expect(Symbol.asyncIterator in (first as object)).toBe(true)
    expect(Symbol.asyncIterator in (second as object)).toBe(true)
    expect(calls).toBe(2)
  })

  it('skips when a custom key returns undefined', async () => {
    let calls = 0
    const link: Link = {
      call() {
        calls++
        return Promise.resolve('ok')
      },
    }
    const wrapped = intercept(link, {
      plugins: [new CachePlugin({ ttl: 60_000, key: () => undefined })],
    })
    expect(await wrapped.call(['echo'], { id: 1 })).toBe('ok')
    expect(await wrapped.call(['echo'], { id: 1 })).toBe('ok')
    expect(calls).toBe(2)
  })
})

import {
  intercept,
  isLocalFailure,
  type Link,
  RetryPlugin,
} from '@ts-pf/client'
import { localFailure, PFError } from '@ts-pf/protocol'
import { describe, expect, it } from 'vitest'

function asyncInput(): AsyncIterable<number> {
  return {
    async *[Symbol.asyncIterator]() {
      yield 1
    },
  }
}

describe('RetryPlugin', () => {
  it('retries localFailure 3 times then succeeds on the 4th try', async () => {
    let calls = 0
    const link: Link = {
      call() {
        calls++
        if (calls < 4) {
          return Promise.reject(localFailure('Network error'))
        }
        return Promise.resolve('ok')
      },
    }
    const wrapped = intercept(link, { plugins: [new RetryPlugin()] })
    expect(await wrapped.call(['echo'], { n: 1 })).toBe('ok')
    expect(calls).toBe(4)
  })

  it('does not retry a declared PFError NOT_FOUND', async () => {
    let calls = 0
    const err = new PFError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'NOT_FOUND',
    })
    const link: Link = {
      call() {
        calls++
        return Promise.reject(err)
      },
    }
    const wrapped = intercept(link, { plugins: [new RetryPlugin()] })
    await expect(wrapped.call(['echo'], { n: 1 })).rejects.toBe(err)
    expect(calls).toBe(1)
  })

  it('does not retry an aborted signal', async () => {
    const ac = new AbortController()
    ac.abort()
    let calls = 0
    const err = localFailure('Request aborted')
    const link: Link = {
      call() {
        calls++
        return Promise.reject(err)
      },
    }
    const wrapped = intercept(link, { plugins: [new RetryPlugin()] })
    await expect(wrapped.call(['echo'], { n: 1 }, ac.signal)).rejects.toBe(err)
    expect(calls).toBe(1)
  })

  it('does not retry AsyncIterable input', async () => {
    let calls = 0
    const err = localFailure('Network error')
    const link: Link = {
      call() {
        calls++
        return Promise.reject(err)
      },
    }
    const wrapped = intercept(link, { plugins: [new RetryPlugin()] })
    await expect(wrapped.call(['echo'], asyncInput())).rejects.toBe(err)
    expect(calls).toBe(1)
  })

  it('uses a custom retry predicate', async () => {
    const err = new Error('flaky')
    let calls = 0
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
      plugins: [new RetryPlugin({ retry: (error) => error === err })],
    })
    expect(await wrapped.call(['echo'], { n: 1 })).toBe('ok')
    expect(calls).toBe(2)
  })

  it('invokes delay with the attempt number', async () => {
    const attempts: number[] = []
    let calls = 0
    const link: Link = {
      call() {
        calls++
        if (calls < 3) {
          return Promise.reject(localFailure('Network error'))
        }
        return Promise.resolve('ok')
      },
    }
    const wrapped = intercept(link, {
      plugins: [
        new RetryPlugin({
          delay: (attempt) => {
            attempts.push(attempt)
            return 0
          },
        }),
      ],
    })
    expect(await wrapped.call(['echo'], { n: 1 })).toBe('ok')
    expect(attempts).toEqual([1, 2])
    expect(calls).toBe(3)
  })

  it('rejects with localFailure if the signal aborts during delay', async () => {
    const ac = new AbortController()
    let calls = 0
    const link: Link = {
      call() {
        calls++
        return Promise.reject(localFailure('Network error'))
      },
    }
    const wrapped = intercept(link, {
      plugins: [
        new RetryPlugin({
          delay: () => {
            queueMicrotask(() => ac.abort('stopped'))
            return 20
          },
        }),
      ],
    })
    const error = await wrapped.call(['echo'], { n: 1 }, ac.signal).then(
      () => {
        throw new Error('expected abort')
      },
      (reason) => reason,
    )
    expect(isLocalFailure(error)).toBe(true)
    expect((error as Error).message).toBe('Request aborted')
    expect(calls).toBe(1)
  })

  it('does not retry when the signal aborts before the next attempt with delay 0', async () => {
    const ac = new AbortController()
    let calls = 0
    const link: Link = {
      call() {
        calls++
        ac.abort()
        return Promise.reject(localFailure('Network error'))
      },
    }
    const wrapped = intercept(link, { plugins: [new RetryPlugin()] })
    await expect(wrapped.call(['echo'], { n: 1 }, ac.signal)).rejects.toSatisfy(
      isLocalFailure,
    )
    expect(calls).toBe(1)
  })
})

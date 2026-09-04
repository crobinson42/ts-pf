import {
  intercept,
  type Link,
  onError,
  onFinish,
  onStart,
  onSuccess,
} from '@ts-pf/client'
import { describe, expect, it } from 'vitest'

function memoryLink(onCall: () => unknown): Link {
  return {
    call() {
      return Promise.resolve(onCall())
    },
  }
}

describe('event helpers', () => {
  it('onStart runs before the call', async () => {
    const order: string[] = []
    const link = memoryLink(() => {
      order.push('call')
      return 'ok'
    })
    const wrapped = intercept(link, {
      interceptors: [
        onStart(() => {
          order.push('start')
        }),
      ],
    })
    expect(await wrapped.call(['echo'], { n: 1 })).toBe('ok')
    expect(order).toEqual(['start', 'call'])
  })

  it('onSuccess runs with the output', async () => {
    let seen: unknown
    const link = memoryLink(() => ({ id: 1 }))
    const wrapped = intercept(link, {
      interceptors: [
        onSuccess((_ctx, output) => {
          seen = output
        }),
      ],
    })
    expect(await wrapped.call(['echo'], { n: 1 })).toEqual({ id: 1 })
    expect(seen).toEqual({ id: 1 })
  })

  it('onError runs on throw and the throw still propagates', async () => {
    const err = new Error('boom')
    let seen: unknown
    const link: Link = {
      call() {
        return Promise.reject(err)
      },
    }
    const wrapped = intercept(link, {
      interceptors: [
        onError((_ctx, error) => {
          seen = error
        }),
      ],
    })
    await expect(wrapped.call(['echo'], { n: 1 })).rejects.toBe(err)
    expect(seen).toBe(err)
  })

  it('onError on failure does not swallow the original error even if onError throws', async () => {
    const original = new Error('original')
    const wrapped = intercept(
      {
        call() {
          return Promise.reject(original)
        },
      },
      {
        interceptors: [
          onError(() => {
            throw new Error('observer')
          }),
        ],
      },
    )
    await expect(wrapped.call(['echo'], { n: 1 })).rejects.toBe(original)
  })

  it('onFinish runs on success and failure', async () => {
    const results: unknown[] = []
    const finish = onFinish((_ctx, result) => {
      results.push(result)
    })
    const ok = intercept(
      memoryLink(() => 'ok'),
      {
        interceptors: [finish],
      },
    )
    expect(await ok.call(['echo'], { n: 1 })).toBe('ok')
    const err = new Error('boom')
    const fail = intercept(
      {
        call() {
          return Promise.reject(err)
        },
      },
      { interceptors: [finish] },
    )
    await expect(fail.call(['echo'], { n: 1 })).rejects.toBe(err)
    expect(results).toEqual([
      { ok: true, output: 'ok' },
      { ok: false, error: err },
    ])
  })

  it('onFinish on failure does not swallow the original error even if onFinish throws', async () => {
    const original = new Error('original')
    const wrapped = intercept(
      {
        call() {
          return Promise.reject(original)
        },
      },
      {
        interceptors: [
          onFinish(() => {
            throw new Error('finish')
          }),
        ],
      },
    )
    await expect(wrapped.call(['echo'], { n: 1 })).rejects.toBe(original)
  })
})

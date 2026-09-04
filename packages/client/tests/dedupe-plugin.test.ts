import {
  DedupePlugin,
  intercept,
  isLocalFailure,
  type Link,
} from '@ts-pf/client'
import { describe, expect, it } from 'vitest'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function asyncInput(): AsyncIterable<number> {
  return {
    async *[Symbol.asyncIterator]() {
      yield 1
    },
  }
}

describe('DedupePlugin', () => {
  it('shares one next() across two concurrent identical calls', async () => {
    let calls = 0
    const d = deferred<string>()
    const link: Link = {
      call() {
        calls++
        return d.promise
      },
    }
    const wrapped = intercept(link, { plugins: [new DedupePlugin()] })
    const p1 = wrapped.call(['echo'], { id: 1 })
    const p2 = wrapped.call(['echo'], { id: 1 })
    expect(calls).toBe(1)
    d.resolve('ok')
    expect(await p1).toBe('ok')
    expect(await p2).toBe('ok')
  })

  it('does not share different inputs', async () => {
    let calls = 0
    const first = deferred<string>()
    const second = deferred<string>()
    const link: Link = {
      call(_path, input) {
        calls++
        return (input as { id: number }).id === 1
          ? first.promise
          : second.promise
      },
    }
    const wrapped = intercept(link, { plugins: [new DedupePlugin()] })
    const p1 = wrapped.call(['echo'], { id: 1 })
    const p2 = wrapped.call(['echo'], { id: 2 })
    expect(calls).toBe(2)
    first.resolve('a')
    second.resolve('b')
    expect(await p1).toBe('a')
    expect(await p2).toBe('b')
  })

  it('does not dedupe AsyncIterable input', async () => {
    let calls = 0
    const first = deferred<string>()
    const second = deferred<string>()
    const link: Link = {
      call() {
        calls++
        return calls === 1 ? first.promise : second.promise
      },
    }
    const wrapped = intercept(link, { plugins: [new DedupePlugin()] })
    const p1 = wrapped.call(['echo'], asyncInput())
    const p2 = wrapped.call(['echo'], asyncInput())
    expect(calls).toBe(2)
    first.resolve('a')
    second.resolve('b')
    expect(await p1).toBe('a')
    expect(await p2).toBe('b')
  })

  it('aborts shared work when the last waiter aborts', async () => {
    let calls = 0
    let seenSignal: AbortSignal | undefined
    const d = deferred<string>()
    const link: Link = {
      call(_path, _input, signal) {
        calls++
        seenSignal = signal
        if (signal) {
          signal.addEventListener('abort', () => {
            d.reject(new Error('aborted'))
          })
        }
        return d.promise
      },
    }
    const wrapped = intercept(link, { plugins: [new DedupePlugin()] })
    const ac1 = new AbortController()
    const ac2 = new AbortController()
    const p1 = wrapped.call(['echo'], { id: 1 }, ac1.signal)
    const p2 = wrapped.call(['echo'], { id: 1 }, ac2.signal)
    expect(calls).toBe(1)
    ac1.abort()
    ac2.abort()
    await expect(p1).rejects.toSatisfy(isLocalFailure)
    await expect(p2).rejects.toSatisfy(isLocalFailure)
    expect(seenSignal?.aborted).toBe(true)
  })

  it('does not abort shared work while a waiter remains', async () => {
    let calls = 0
    let seenSignal: AbortSignal | undefined
    const d = deferred<string>()
    const link: Link = {
      call(_path, _input, signal) {
        calls++
        seenSignal = signal
        return d.promise
      },
    }
    const wrapped = intercept(link, { plugins: [new DedupePlugin()] })
    const ac = new AbortController()
    const p1 = wrapped.call(['echo'], { id: 1 }, ac.signal)
    const p2 = wrapped.call(['echo'], { id: 1 })
    expect(calls).toBe(1)
    ac.abort()
    await expect(p1).rejects.toSatisfy(isLocalFailure)
    expect(seenSignal?.aborted).toBe(false)
    d.resolve('ok')
    expect(await p2).toBe('ok')
  })

  it('starts new work after the in-flight call settles', async () => {
    let calls = 0
    const first = deferred<string>()
    const second = deferred<string>()
    const link: Link = {
      call() {
        calls++
        return calls === 1 ? first.promise : second.promise
      },
    }
    const wrapped = intercept(link, { plugins: [new DedupePlugin()] })
    const p1 = wrapped.call(['echo'], { id: 1 })
    const p2 = wrapped.call(['echo'], { id: 1 })
    expect(calls).toBe(1)
    first.resolve('one')
    expect(await p1).toBe('one')
    expect(await p2).toBe('one')
    const p3 = wrapped.call(['echo'], { id: 1 })
    expect(calls).toBe(2)
    second.resolve('two')
    expect(await p3).toBe('two')
  })

  it('starts new work after the last waiter aborts', async () => {
    let calls = 0
    const first = deferred<string>()
    const second = deferred<string>()
    const link: Link = {
      call(_path, _input, signal) {
        calls++
        if (calls === 1) {
          signal?.addEventListener('abort', () => {
            first.reject(new Error('aborted'))
          })
          return first.promise
        }
        return second.promise
      },
    }
    const wrapped = intercept(link, { plugins: [new DedupePlugin()] })
    const ac = new AbortController()
    const p1 = wrapped.call(['echo'], { id: 1 }, ac.signal)
    ac.abort()
    await expect(p1).rejects.toSatisfy(isLocalFailure)
    const p2 = wrapped.call(['echo'], { id: 1 })
    expect(calls).toBe(2)
    second.resolve('fresh')
    expect(await p2).toBe('fresh')
  })

  it('rejects an already-aborted joiner without aborting others', async () => {
    let calls = 0
    const d = deferred<string>()
    const link: Link = {
      call() {
        calls++
        return d.promise
      },
    }
    const wrapped = intercept(link, { plugins: [new DedupePlugin()] })
    const p1 = wrapped.call(['echo'], { id: 1 })
    const ac = new AbortController()
    ac.abort()
    const p2 = wrapped.call(['echo'], { id: 1 }, ac.signal)
    await expect(p2).rejects.toSatisfy(isLocalFailure)
    expect(calls).toBe(1)
    d.resolve('ok')
    expect(await p1).toBe('ok')
  })
})

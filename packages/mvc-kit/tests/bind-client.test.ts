import { localFailure, PFError } from '@ts-pf/protocol'
import { describe, expect, it, vi } from 'vitest'
import { bindClient } from '../src/bind-client.js'

function hostWith(signal: AbortSignal) {
  return { disposeSignal: signal }
}

function bound<C extends object>(
  client: C,
  host: { disposeSignal: AbortSignal },
) {
  return bindClient(client as never, host) as C
}

describe('bindClient', () => {
  it('injects host.disposeSignal on a void-input call', async () => {
    const list = vi.fn(async (..._args: unknown[]) => ['ok'])
    const client = {
      planet: { list, find: vi.fn(async (..._args: unknown[]) => {}) },
    }
    const hostSignal = AbortSignal.timeout(10_000)
    const rpc = bound(client, hostWith(hostSignal))

    await expect(rpc.planet.list()).resolves.toEqual(['ok'])
    expect(list).toHaveBeenCalledOnce()
    expect(list).toHaveBeenCalledWith({ signal: hostSignal })
  })

  it('injects host.disposeSignal as the second arg on an input call', async () => {
    const find = vi.fn(async (..._args: unknown[]) => ({ id: 1 }))
    const client = {
      planet: { list: vi.fn(async (..._args: unknown[]) => []), find },
    }
    const hostSignal = AbortSignal.timeout(10_000)
    const rpc = bound(client, hostWith(hostSignal))

    await expect(rpc.planet.find({ id: 1 })).resolves.toEqual({ id: 1 })
    expect(find).toHaveBeenCalledWith({ id: 1 }, { signal: hostSignal })
  })

  it('lets a caller-provided signal win on void and input calls', async () => {
    const list = vi.fn(async (..._args: unknown[]) => [])
    const find = vi.fn(async (..._args: unknown[]) => ({ id: 1 }))
    const client = { planet: { list, find } }
    const hostSignal = AbortSignal.timeout(10_000)
    const pending = AbortSignal.timeout(5_000)
    const rpc = bound(client, hostWith(hostSignal))

    await rpc.planet.list({ signal: pending })
    await rpc.planet.find({ id: 1 }, { signal: pending })

    expect(list).toHaveBeenCalledWith({ signal: pending })
    expect(find).toHaveBeenCalledWith({ id: 1 }, { signal: pending })
  })

  it('reads disposeSignal at call time, not bind time', async () => {
    const list = vi.fn(async (..._args: unknown[]) => [])
    const client = { planet: { list } }
    let current = new AbortController()
    const host = {
      get disposeSignal() {
        return current.signal
      },
    }
    const rpc = bound(client, host)
    const first = current.signal
    await rpc.planet.list()
    expect(list).toHaveBeenLastCalledWith({ signal: first })

    current.abort()
    current = new AbortController()
    const second = current.signal
    await rpc.planet.list()
    expect(list).toHaveBeenLastCalledWith({ signal: second })
    expect(second).not.toBe(first)
  })

  it('caches nested router identity', () => {
    const client = { planet: { list: vi.fn(), find: vi.fn() } }
    const rpc = bound(client, hostWith(AbortSignal.timeout(1)))
    expect(rpc.planet).toBe(rpc.planet)
  })

  it('throws TypeError when calling a router node', () => {
    const client = { planet: { list: vi.fn() } }
    const rpc = bound(client, hostWith(AbortSignal.timeout(1)))
    expect(() => (rpc as unknown as { planet: () => void }).planet()).toThrow(
      TypeError,
    )
  })

  it('resolves with the inner value', async () => {
    const find = vi.fn((..._args: unknown[]) => Promise.resolve({ id: 1 }))
    const client = { planet: { find } }
    const rpc = bound(client, hostWith(AbortSignal.timeout(1)))
    await expect(rpc.planet.find({ id: 1 })).resolves.toEqual({ id: 1 })
  })

  it('returns a non-promise result as is', () => {
    const sync = vi.fn((..._args: unknown[]) => 42)
    const rpc = bound({ sync }, hostWith(AbortSignal.timeout(1)))
    expect(rpc.sync()).toBe(42)
  })
})

describe('bindClient error status for mvc-kit', () => {
  async function thrownBy(client: object, call: (rpc: never) => unknown) {
    const rpc = bindClient(client as never, hostWith(AbortSignal.timeout(1)))
    return await Promise.resolve(call(rpc as never)).then(
      () => {
        throw new Error('expected rejection')
      },
      (reason: unknown) => reason,
    )
  }

  it('hands mvc-kit a copy with status 400 when the PFError has none', async () => {
    const cause = new Error('upstream')
    const original = new PFError({
      code: 'TEAPOT',
      message: 'short and stout',
      data: { x: 1 },
      cause,
    })
    const client = { brew: vi.fn(async () => Promise.reject(original)) }
    const error = (await thrownBy(client, (rpc: { brew: () => unknown }) =>
      rpc.brew(),
    )) as PFError

    expect(error).toBeInstanceOf(PFError)
    expect(error).not.toBe(original)
    expect(error.status).toBe(400)
    expect(error.code).toBe('TEAPOT')
    expect(error.message).toBe('short and stout')
    expect(error.data).toEqual({ x: 1 })
    expect(error.cause).toBe(cause)
    expect(error.toJSON()).toEqual(original.toJSON())
    expect(original.status).toBeUndefined()
  })

  it('keeps a PFError that already has a finite status', async () => {
    const original = new PFError({ code: 'NOT_FOUND', status: 404 })
    const client = { find: vi.fn(async () => Promise.reject(original)) }
    const error = await thrownBy(client, (rpc: { find: () => unknown }) =>
      rpc.find(),
    )
    expect(error).toBe(original)
  })

  it('keeps local failures as they are (status 0 is finite)', async () => {
    const original = localFailure('Request aborted')
    const client = { list: vi.fn(async () => Promise.reject(original)) }
    const error = await thrownBy(client, (rpc: { list: () => unknown }) =>
      rpc.list(),
    )
    expect(error).toBe(original)
    expect((error as PFError).status).toBe(0)
    expect((error as PFError).local).toBe(true)
  })

  it('passes non-PFError throws through untouched', async () => {
    const typeError = new TypeError('boom')
    const nodeError = Object.assign(new Error('nope'), { code: 'ERR_X' })
    const client = {
      a: vi.fn(async () => Promise.reject(typeError)),
      b: vi.fn(async () => Promise.reject(nodeError)),
    }
    expect(await thrownBy(client, (rpc: { a: () => unknown }) => rpc.a())).toBe(
      typeError,
    )
    expect(await thrownBy(client, (rpc: { b: () => unknown }) => rpc.b())).toBe(
      nodeError,
    )
    expect('status' in nodeError).toBe(false)
  })

  it('maps a mid-stream PFError thrown by an async iterable output', async () => {
    const original = new PFError({ code: 'LIMIT', message: 'slow down' })
    async function* tokens() {
      yield 1
      throw original
    }
    const client = { chat: vi.fn(async () => tokens()) }
    const rpc = bindClient(client as never, hostWith(AbortSignal.timeout(1)))
    const items: unknown[] = []
    const error = await (async () => {
      for await (const item of await (
        rpc as unknown as { chat: () => Promise<AsyncIterable<unknown>> }
      ).chat()) {
        items.push(item)
      }
    })().then(
      () => {
        throw new Error('expected rejection')
      },
      (reason: unknown) => reason as PFError,
    )
    expect(items).toEqual([1])
    expect(error).toBeInstanceOf(PFError)
    expect(error.code).toBe('LIMIT')
    expect(error.status).toBe(400)
    expect(original.status).toBeUndefined()
  })
})

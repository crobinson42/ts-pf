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

  it('returns the inner promise without wrapping', async () => {
    const inner = Promise.resolve({ id: 1 })
    const find = vi.fn((..._args: unknown[]) => inner)
    const client = { planet: { find } }
    const rpc = bound(client, hostWith(AbortSignal.timeout(1)))
    expect(rpc.planet.find({ id: 1 })).toBe(inner)
  })
})

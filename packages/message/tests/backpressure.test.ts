import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DRAIN_TIMEOUT,
  DEFAULT_HIGH_WATER_MARK,
  DrainWaiter,
  resolveBackpressure,
  type StallInfo,
} from '../src/backpressure.js'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

describe('resolveBackpressure', () => {
  it('applies the defaults: 1 MiB, 30 s, a console.warn onStall', () => {
    const resolved = resolveBackpressure()
    expect(resolved.highWaterMark).toBe(1024 * 1024)
    expect(resolved.highWaterMark).toBe(DEFAULT_HIGH_WATER_MARK)
    expect(resolved.drainTimeout).toBe(30_000)
    expect(resolved.drainTimeout).toBe(DEFAULT_DRAIN_TIMEOUT)
    expect(typeof resolved.onStall).toBe('function')

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      if (resolved.onStall !== false) {
        resolved.onStall({
          path: ['planet', 'chat'],
          id: '7',
          waitedMs: 0,
          action: 'paused',
        })
        resolved.onStall({
          path: ['planet', 'chat'],
          id: '7',
          waitedMs: 30_001,
          action: 'aborted',
        })
      }
      // a pause is normal flow control: only the abort is logged by default
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]?.[0])).toContain('planet.chat')
      expect(String(warn.mock.calls[0]?.[0])).toContain('30001 ms')
      expect(String(warn.mock.calls[0]?.[0])).toContain('aborted')
    } finally {
      warn.mockRestore()
    }
  })

  it('is the identity on an already resolved object (false stays false)', () => {
    const once = resolveBackpressure({
      highWaterMark: 10,
      drainTimeout: 0,
      onStall: false,
    })
    expect(resolveBackpressure(once)).toEqual(once)
  })

  it('accepts Infinity for highWaterMark and 0 for drainTimeout', () => {
    expect(
      resolveBackpressure({ highWaterMark: Infinity, drainTimeout: 0 }),
    ).toMatchObject({ highWaterMark: Infinity, drainTimeout: 0 })
  })

  it('rejects a negative or NaN highWaterMark with a TypeError naming it', () => {
    expect(() => resolveBackpressure({ highWaterMark: -1 })).toThrow(
      /backpressure\.highWaterMark/,
    )
    expect(() => resolveBackpressure({ highWaterMark: Number.NaN })).toThrow(
      TypeError,
    )
  })

  it('rejects a non-finite or negative drainTimeout', () => {
    expect(() => resolveBackpressure({ drainTimeout: Infinity })).toThrow(
      /backpressure\.drainTimeout/,
    )
    expect(() => resolveBackpressure({ drainTimeout: -5 })).toThrow(TypeError)
  })

  it('rejects an onStall that is neither a function nor false', () => {
    expect(() =>
      resolveBackpressure({ onStall: 'log' as unknown as false }),
    ).toThrow(/backpressure\.onStall/)
  })
})

describe('DrainWaiter', () => {
  const call = { path: ['planet', 'chat'], id: '3' }

  it("fires onStall('paused') once across waits and resolves 'drained'", async () => {
    const stalls: StallInfo[] = []
    const waiter = new DrainWaiter(
      resolveBackpressure({
        drainTimeout: 1000,
        onStall: (info) => {
          stalls.push(info)
        },
      }),
      call,
    )

    expect(await waiter.wait(Promise.resolve())).toBe('drained')
    expect(await waiter.wait(Promise.resolve())).toBe('drained')
    expect(stalls).toEqual([
      { path: ['planet', 'chat'], id: '3', waitedMs: 0, action: 'paused' },
    ])
  })

  it("resolves 'timeout' and fires onStall('aborted') when the drain is late", async () => {
    const stalls: StallInfo[] = []
    const waiter = new DrainWaiter(
      resolveBackpressure({
        drainTimeout: 20,
        onStall: (info) => {
          stalls.push(info)
        },
      }),
      call,
    )

    const never = new Promise<void>(() => {})
    expect(await waiter.wait(never)).toBe('timeout')
    expect(stalls.map((info) => info.action)).toEqual(['paused', 'aborted'])
    expect(stalls[1]?.waitedMs).toBeGreaterThanOrEqual(15)
    expect(stalls[1]?.path).toEqual(['planet', 'chat'])
  })

  it("resolves 'cancelled' on cancel() and a later drain is ignored", async () => {
    const waiter = new DrainWaiter(
      resolveBackpressure({ drainTimeout: 1000, onStall: false }),
      call,
    )
    let release!: () => void
    const drained = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = waiter.wait(drained)
    waiter.cancel()
    expect(await pending).toBe('cancelled')
    release()
    await sleep(0)
  })

  it('drainTimeout 0 waits without a timer', async () => {
    const stalls: StallInfo[] = []
    const waiter = new DrainWaiter(
      resolveBackpressure({
        drainTimeout: 0,
        onStall: (info) => {
          stalls.push(info)
        },
      }),
      call,
    )
    let release!: () => void
    const drained = new Promise<void>((resolve) => {
      release = resolve
    })
    let outcome: string | undefined
    void waiter.wait(drained).then((value) => {
      outcome = value
    })
    await sleep(30)
    expect(outcome).toBeUndefined()
    release()
    await sleep(0)
    expect(outcome).toBe('drained')
    expect(stalls.map((info) => info.action)).toEqual(['paused'])
  })

  it("a rejected drain promise still resolves 'drained' (the session closes it)", async () => {
    const waiter = new DrainWaiter(
      resolveBackpressure({ drainTimeout: 1000, onStall: false }),
      call,
    )
    expect(await waiter.wait(Promise.reject(new Error('pipe')))).toBe('drained')
  })

  it("a throwing onStall on 'paused' neither throws out of wait() nor changes the outcome", async () => {
    const waiter = new DrainWaiter(
      resolveBackpressure({
        drainTimeout: 1000,
        onStall: () => {
          throw new Error('paused logger exploded')
        },
      }),
      call,
    )
    expect(await waiter.wait(Promise.resolve())).toBe('drained')
  })

  it("a throwing onStall on 'aborted' still settles the wait as 'timeout' and raises nothing", async () => {
    const uncaught: unknown[] = []
    const onUncaught = (error: unknown): void => {
      uncaught.push(error)
    }
    process.on('uncaughtException', onUncaught)
    try {
      const waiter = new DrainWaiter(
        resolveBackpressure({
          drainTimeout: 20,
          onStall: (info) => {
            if (info.action === 'aborted') {
              throw new Error('aborted logger exploded')
            }
          },
        }),
        call,
      )
      expect(await waiter.wait(new Promise<void>(() => {}))).toBe('timeout')
      await sleep(5)
      expect(uncaught).toEqual([])
    } finally {
      process.off('uncaughtException', onUncaught)
    }
  })

  it('a second concurrent wait is an invariant violation and throws', async () => {
    const waiter = new DrainWaiter(
      resolveBackpressure({ drainTimeout: 0, onStall: false }),
      call,
    )
    let release!: () => void
    const first = waiter.wait(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )
    expect(() => waiter.wait(Promise.resolve())).toThrow(/already pending/)
    release()
    expect(await first).toBe('drained')
    expect(await waiter.wait(Promise.resolve())).toBe('drained')
  })
})

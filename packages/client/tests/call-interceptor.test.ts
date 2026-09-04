import {
  applyPlugins,
  type CallInterceptor,
  type CallPlugin,
  createClient,
  intercept,
  type Link,
} from '@ts-pf/client'
import { procedure, router } from '@ts-pf/contract'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  echo: procedure.input(z.unknown()).output(z.unknown()),
})

function memoryLink(onCall?: (args: unknown[]) => unknown): Link {
  return {
    call(...args) {
      const result = onCall?.(args)
      return Promise.resolve(result === undefined ? args[1] : result)
    },
  }
}

describe('intercept', () => {
  it('runs interceptors in array order with [0] outermost', async () => {
    const order: string[] = []
    const outer: CallInterceptor = async (ctx) => {
      order.push('outer-before')
      const output = await ctx.next()
      order.push('outer-after')
      return output
    }
    const inner: CallInterceptor = async (ctx) => {
      order.push('inner-before')
      const output = await ctx.next()
      order.push('inner-after')
      return output
    }
    const link = memoryLink(() => {
      order.push('call')
      return 'ok'
    })
    const wrapped = intercept(link, { interceptors: [outer, inner] })
    expect(await wrapped.call(['echo'], { n: 1 })).toBe('ok')
    expect(order).toEqual([
      'outer-before',
      'inner-before',
      'call',
      'inner-after',
      'outer-after',
    ])
  })

  it('returns the same Link when plugins and interceptors are empty', () => {
    const link = memoryLink()
    expect(intercept(link)).toBe(link)
    expect(intercept(link, {})).toBe(link)
    expect(intercept(link, { plugins: [], interceptors: [] })).toBe(link)
  })

  it('lets the next interceptor see next({ input }) and next({ signal })', async () => {
    const controller = new AbortController()
    let innerInput: unknown
    let innerSignal: AbortSignal | undefined
    let leafInput: unknown
    let leafSignal: AbortSignal | undefined
    const link: Link = {
      call(_path, input, signal) {
        leafInput = input
        leafSignal = signal
        return Promise.resolve(input)
      },
    }
    const wrapped = intercept(link, {
      interceptors: [
        (ctx) =>
          ctx.next({ input: { swapped: true }, signal: controller.signal }),
        (ctx) => {
          innerInput = ctx.input
          innerSignal = ctx.signal
          return ctx.next()
        },
      ],
    })
    await wrapped.call(['echo'], { original: true })
    expect(innerInput).toEqual({ swapped: true })
    expect(innerSignal).toBe(controller.signal)
    expect(leafInput).toEqual({ swapped: true })
    expect(leafSignal).toBe(controller.signal)
  })

  it('does not let interceptors mutate the path passed to Link.call', async () => {
    let seenPath: string[] | undefined
    const originalPath = ['echo']
    const link: Link = {
      call(path) {
        seenPath = path
        return Promise.resolve('ok')
      },
    }
    const wrapped = intercept(link, {
      interceptors: [
        (ctx) => {
          ctx.path.push('mutated')
          return ctx.next()
        },
      ],
    })
    await wrapped.call(originalPath, { n: 1 })
    expect(seenPath).toEqual(['echo'])
    expect(originalPath).toEqual(['echo'])
  })

  it('forwards next({ input }) to Link.call', async () => {
    let seen: unknown
    const link = memoryLink((args) => {
      seen = args[1]
      return args[1]
    })
    const wrapped = intercept(link, {
      interceptors: [(ctx) => ctx.next({ input: { swapped: true } })],
    })
    await wrapped.call(['echo'], { original: true })
    expect(seen).toEqual({ swapped: true })
  })

  it('forwards signal when present and omits it when absent', async () => {
    const arities: number[] = []
    const link: Link = {
      call(...args) {
        arities.push(args.length)
        return Promise.resolve(args.length)
      },
    }
    const wrapped = intercept(link, {
      interceptors: [(ctx) => ctx.next()],
    })
    await wrapped.call(['echo'], { n: 1 })
    const controller = new AbortController()
    await wrapped.call(['echo'], { n: 1 }, controller.signal)
    expect(arities).toEqual([2, 3])
  })

  it('does not mutate the original link', async () => {
    const seen: unknown[] = []
    const original = memoryLink((args) => {
      seen.push(args[1])
      return args[1]
    })
    const wrapped = intercept(original, {
      interceptors: [(ctx) => ctx.next({ input: 'wrapped' })],
    })
    expect(wrapped).not.toBe(original)
    expect(await wrapped.call(['echo'], 'client')).toBe('wrapped')
    expect(await original.call(['echo'], 'direct')).toBe('direct')
    expect(seen).toEqual(['wrapped', 'direct'])
  })

  it('allows an interceptor to short-circuit without calling next', async () => {
    const link = memoryLink(() => {
      throw new Error('should not be called')
    })
    const wrapped = intercept(link, {
      interceptors: [async () => 'short-circuit'],
    })
    expect(await wrapped.call(['echo'], { n: 1 })).toBe('short-circuit')
  })
})

describe('applyPlugins', () => {
  it('concatenates plugin interceptors then explicit interceptors', () => {
    const pluginA: CallInterceptor = (ctx) => ctx.next()
    const pluginB: CallInterceptor = (ctx) => ctx.next()
    const extra: CallInterceptor = (ctx) => ctx.next()
    const plugins: CallPlugin[] = [
      { name: 'a', intercept: pluginA },
      { name: 'b', intercept: pluginB },
    ]
    const result = applyPlugins(plugins, [extra])
    expect(result).toEqual([pluginA, pluginB, extra])
    expect(applyPlugins(plugins)).toEqual([pluginA, pluginB])
    expect(applyPlugins([])).toEqual([])
  })
})

describe('createClient plugins', () => {
  it('composes a plugin then an interceptor', async () => {
    const order: string[] = []
    const plugin: CallPlugin = {
      name: 'plugin',
      intercept: async (ctx) => {
        order.push('plugin')
        return ctx.next()
      },
    }
    const interceptor: CallInterceptor = async (ctx) => {
      order.push('interceptor')
      return ctx.next()
    }
    const client = createClient<typeof contract>(memoryLink(), {
      plugins: [plugin],
      interceptors: [interceptor],
    })
    await client.echo({ n: 1 })
    expect(order).toEqual(['plugin', 'interceptor'])
  })
})

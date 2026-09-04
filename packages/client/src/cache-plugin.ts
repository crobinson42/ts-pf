import type { CallInterceptor } from './call-interceptor.js'
import type { CallPlugin } from './plugin.js'

export type CachePluginOptions = {
  ttl: number
  key?: (ctx: { path: string[]; input: unknown }) => string | undefined
  store?: {
    get(key: string): { value: unknown; expires: number } | undefined
    set(key: string, entry: { value: unknown; expires: number }): void
    delete?(key: string): void
  }
}

type CacheStore = NonNullable<CachePluginOptions['store']>
type CacheEntry = { value: unknown; expires: number }

export class CachePlugin implements CallPlugin {
  readonly name = 'cache'
  readonly intercept: CallInterceptor
  private readonly ttl: number
  private readonly keyFn:
    | ((ctx: { path: string[]; input: unknown }) => string | undefined)
    | undefined
  private readonly store: CacheStore

  constructor(options: CachePluginOptions) {
    this.ttl = options.ttl
    this.keyFn = options.key
    this.store = options.store ?? memoryStore()
    this.intercept = (ctx) => this.interceptCall(ctx)
  }

  private async interceptCall(
    ctx: Parameters<CallInterceptor>[0],
  ): Promise<unknown> {
    if (isAsyncIterable(ctx.input)) {
      return ctx.next()
    }
    const key = this.resolveKey(ctx)
    if (key === undefined) {
      return ctx.next()
    }
    const cached = this.store.get(key)
    if (cached && cached.expires > Date.now()) {
      return cached.value
    }
    if (cached) {
      this.store.delete?.(key)
    }
    const output = await ctx.next()
    if (isAsyncIterable(output)) {
      return output
    }
    this.store.set(key, { value: output, expires: Date.now() + this.ttl })
    return output
  }

  private resolveKey(ctx: {
    path: string[]
    input: unknown
  }): string | undefined {
    if (this.keyFn) {
      return this.keyFn(ctx)
    }
    return defaultKey(ctx.path, ctx.input)
  }
}

function defaultKey(path: string[], input: unknown): string | undefined {
  if (isAsyncIterable(input)) {
    return undefined
  }
  try {
    return JSON.stringify([path, input])
  } catch {
    return undefined
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  )
}

function memoryStore(): CacheStore {
  const map = new Map<string, CacheEntry>()
  return {
    get(key) {
      const entry = map.get(key)
      if (entry && entry.expires <= Date.now()) {
        map.delete(key)
        return undefined
      }
      return entry
    },
    set(key, entry) {
      const now = Date.now()
      for (const [storedKey, stored] of map) {
        if (stored.expires <= now) {
          map.delete(storedKey)
        }
      }
      map.set(key, entry)
    },
    delete(key) {
      map.delete(key)
    },
  }
}

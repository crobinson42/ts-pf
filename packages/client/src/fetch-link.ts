import {
  JSONCodec,
  PFError,
  PROTOCOL_HEADER,
  PROTOCOL_VERSION,
  type PFResultPromise,
  type RpcCodec,
} from '@ts-pf/protocol'
import { runInterceptors, type Interceptor } from './interceptors.js'

export interface Link {
  call(path: string[], input: unknown, signal?: AbortSignal): PFResultPromise<unknown, PFError>
}

export class FetchLink implements Link {
  private readonly url: string
  private readonly headers: HeadersInit | (() => HeadersInit | Promise<HeadersInit>) | undefined
  private readonly fetchFn: typeof fetch
  private readonly interceptors: Interceptor[]
  private readonly codec: RpcCodec

  constructor(opts: {
    url: string
    headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
    fetch?: typeof fetch
    interceptors?: Interceptor[]
    codec?: RpcCodec
  }) {
    this.url = opts.url
    this.headers = opts.headers
    this.fetchFn = opts.fetch ?? fetch
    this.interceptors = opts.interceptors ?? []
    this.codec = opts.codec ?? new JSONCodec()
  }

  call(path: string[], input: unknown, signal?: AbortSignal): PFResultPromise<unknown, PFError> {
    return this.callInner(path, input, signal) as PFResultPromise<unknown, PFError>
  }

  private async callInner(path: string[], input: unknown, signal?: AbortSignal): Promise<unknown> {
    const url = joinUrl(this.url, path)
    const headers = new Headers(
      typeof this.headers === 'function' ? await this.headers() : this.headers,
    )
    headers.set('content-type', 'application/json')
    headers.set(PROTOCOL_HEADER, PROTOCOL_VERSION)

    const init: RequestInit = {
      method: 'POST',
      headers,
      body: this.codec.encodeRequest({ input }),
    }
    if (signal) {
      init.signal = signal
    }
    const request = new Request(url, init)

    let response: Response
    try {
      response = await runInterceptors(this.interceptors, request, (req) => this.fetchFn(req))
    } catch (error) {
      if (error instanceof PFError) {
        throw error
      }
      throw new PFError({
        code: 'INTERNAL',
        status: 0,
        message: error instanceof Error ? error.message : 'Network error',
      })
    }

    const text = await response.text()
    let decoded
    try {
      decoded = this.codec.decodeResponse(text)
    } catch {
      throw new PFError({
        code: 'INTERNAL',
        status: response.status,
        message: 'Invalid response',
      })
    }

    if (!decoded.ok) {
      throw new PFError({
        code: decoded.error.code,
        status: response.status,
        message: decoded.error.message,
        ...(decoded.error.data !== undefined ? { data: decoded.error.data } : {}),
      })
    }
    return decoded.output
  }
}

function joinUrl(base: string, segments: string[]): string {
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base
  if (segments.length === 0) {
    return trimmed
  }
  return `${trimmed}/${segments.join('/')}`
}

import {
  isPFError,
  JSONCodec,
  PFError,
  type PFResultPromise,
  PROTOCOL_HEADER,
  PROTOCOL_VERSION,
  type RpcBodySource,
  type RpcCodec,
  type RpcEncodedBody,
  type RpcResponse,
} from '@ts-pf/protocol'
import { type Interceptor, runInterceptors } from './interceptors.js'

export interface Link {
  call(
    path: string[],
    input: unknown,
    signal?: AbortSignal,
  ): PFResultPromise<unknown, PFError>
}

export class FetchLink implements Link {
  private readonly url: string
  private readonly headers:
    | HeadersInit
    | (() => HeadersInit | Promise<HeadersInit>)
    | undefined
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
    this.fetchFn = (opts.fetch ?? globalThis.fetch).bind(globalThis)
    this.interceptors = opts.interceptors ?? []
    this.codec = opts.codec ?? new JSONCodec()
  }

  call(
    path: string[],
    input: unknown,
    signal?: AbortSignal,
  ): PFResultPromise<unknown, PFError> {
    return this.callInner(path, input, signal) as PFResultPromise<
      unknown,
      PFError
    >
  }

  private async callInner(
    path: string[],
    input: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const url = joinUrl(this.url, path)
    const headers = new Headers(
      typeof this.headers === 'function' ? await this.headers() : this.headers,
    )
    headers.set(PROTOCOL_HEADER, PROTOCOL_VERSION)

    const encoded = await this.codec.encodeRequest({ input })
    applyEncodedHeaders(headers, encoded)

    const init: RequestInit & { duplex?: 'half' } = {
      method: 'POST',
      headers,
      body: encoded.body,
    }
    if (signal) {
      init.signal = signal
    }
    if (encoded.body instanceof ReadableStream) {
      init.duplex = 'half'
    }
    const request = new Request(url, init)

    let response: Response
    try {
      response = await runInterceptors(this.interceptors, request, (req) =>
        this.fetchFn(req),
      )
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

    let decoded: RpcResponse
    try {
      decoded = await this.codec.decodeResponse(bodySource(response))
    } catch (error) {
      if (isPFError(error)) {
        throw error
      }
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
        ...(decoded.error.data !== undefined
          ? { data: decoded.error.data }
          : {}),
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

function bodySource(response: Response): RpcBodySource {
  return {
    contentType: response.headers.get('content-type'),
    text: () => response.text(),
    formData: () => response.formData(),
    body: () => response.body,
  }
}

function applyEncodedHeaders(headers: Headers, encoded: RpcEncodedBody): void {
  if (encoded.body instanceof FormData) {
    headers.delete('content-type')
    return
  }
  headers.set('content-type', encoded.contentType)
}

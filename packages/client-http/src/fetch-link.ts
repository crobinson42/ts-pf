import type { Link } from '@ts-pf/client'
import {
  JSONCodec,
  PROTOCOL_HEADER,
  type RpcBodySource,
  type RpcCodec,
  type RpcEncodedBody,
} from '@ts-pf/http'
import {
  isPFError,
  localFailure,
  PFError,
  type PFResultPromise,
  PROTOCOL_VERSION,
  type RpcResponse,
} from '@ts-pf/protocol'
import { type Interceptor, runInterceptors } from './interceptors.js'

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
      if (isAbortFailure(error, signal)) {
        throw localFailure('Request aborted', error)
      }
      throw localFailure(
        error instanceof Error ? error.message : 'Network error',
        error,
      )
    }

    // A response from another wire major may carry an envelope this codec
    // cannot read: do not touch the body. It did come from a server, so this
    // is not a local failure (not retried by default); it is shaped like the
    // non-RPC decode failure below.
    const version = protocolVersion(response)
    if (version === 'mismatch') {
      throw new PFError({
        code: 'INTERNAL',
        status: response.status,
        message: `Unsupported protocol version (${PROTOCOL_HEADER}: ${response.headers.get(PROTOCOL_HEADER)})`,
        cause: response,
      })
    }

    let decoded: RpcResponse
    try {
      decoded = await this.codec.decodeResponse(bodySource(response))
    } catch (error) {
      if (isPFError(error) && version === 'match') {
        throw error
      }
      throw new PFError({
        code: 'INTERNAL',
        status: response.status,
        message:
          version === 'match'
            ? 'Invalid response'
            : `Non-RPC response (HTTP ${response.status})`,
        cause: error,
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

function isAbortFailure(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true
  }
  return error instanceof Error && error.name === 'AbortError'
}

/** `x-ts-pf-protocol` on the response: absent (proxy, non-RPC), ours, or another major. */
function protocolVersion(response: Response): 'absent' | 'match' | 'mismatch' {
  const value = response.headers.get(PROTOCOL_HEADER)
  if (value === null) {
    return 'absent'
  }
  return value.trim() === PROTOCOL_VERSION ? 'match' : 'mismatch'
}

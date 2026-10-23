import {
  JSONCodec,
  type RpcBodySource,
  type RpcCodec,
  type RpcEncodedBody,
} from '@ts-pf/http'
import {
  isAsyncIterable,
  PFError,
  type RpcFailure,
  type RpcRequest,
  type RpcResponse,
  toWireError,
} from '@ts-pf/protocol'
import { StreamCodec } from '@ts-pf/stream'
import { encodeSse, readSseEvents, SSE_CONTENT_TYPE } from './sse.js'

/** Envelope items only: a `ReadableStream` is bytes, not items (as in `@ts-pf/stream`). */
function isItemStream(value: unknown): value is AsyncIterable<unknown> {
  return (
    isAsyncIterable(value) &&
    !(typeof ReadableStream !== 'undefined' && value instanceof ReadableStream)
  )
}

/** In-band failure after the stream started: an unknown throw is `INTERNAL`. */
function failureLine(error: unknown): string {
  const failure: RpcFailure = { ok: false, error: toWireError(error) }
  return JSON.stringify(failure)
}

function mime(contentType: string | null): string {
  if (contentType == null || contentType === '') {
    return ''
  }
  return contentType.split(';')[0]?.trim().toLowerCase() ?? ''
}

function isSseContentType(contentType: string | null): boolean {
  return mime(contentType) === SSE_CONTENT_TYPE
}

function jsonSource(text: string): RpcBodySource {
  return {
    contentType: 'application/json',
    text: async () => text,
    formData: async () => new FormData(),
    body: () => null,
  }
}

async function jsonText(encoded: RpcEncodedBody): Promise<string> {
  if (typeof encoded.body === 'string') {
    return encoded.body
  }
  throw new Error('SseCodec inner codec must produce a JSON string')
}

function badRequest(message: string): PFError {
  return new PFError({ code: 'BAD_REQUEST', status: 400, message })
}

function assertItem(value: unknown): void {
  if (isItemStream(value)) {
    throw badRequest('Nested streams are not supported')
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    throw badRequest('File values are not supported in streams')
  }
}

export class SseCodec implements RpcCodec {
  private readonly inner: RpcCodec
  private readonly stream: StreamCodec
  private readonly keepAliveMs: number

  constructor(options?: { inner?: RpcCodec; keepAliveMs?: number }) {
    this.inner = options?.inner ?? new JSONCodec()
    this.stream = new StreamCodec({ inner: this.inner })
    this.keepAliveMs = options?.keepAliveMs ?? 15_000
  }

  encodeRequest(req: RpcRequest): RpcEncodedBody | Promise<RpcEncodedBody> {
    return this.stream.encodeRequest(req)
  }

  async decodeRequest(source: RpcBodySource): Promise<RpcRequest> {
    if (isSseContentType(source.contentType)) {
      throw badRequest('SSE is not supported as a request content type')
    }
    return this.stream.decodeRequest(source)
  }

  async encodeSuccess<T>(output: T): Promise<RpcEncodedBody> {
    if (isItemStream(output)) {
      return {
        contentType: SSE_CONTENT_TYPE,
        body: encodeSse(
          output,
          async (item) => {
            assertItem(item)
            return jsonText(await this.inner.encodeSuccess(item))
          },
          failureLine,
          this.keepAliveMs,
        ),
      }
    }
    return this.stream.encodeSuccess(output)
  }

  encodeFailure(error: {
    code: string
    message: string
    data?: unknown
  }): RpcEncodedBody | Promise<RpcEncodedBody> {
    return this.stream.encodeFailure(error)
  }

  async decodeResponse<T = unknown>(
    source: RpcBodySource,
  ): Promise<RpcResponse<T>> {
    if (isSseContentType(source.contentType)) {
      const stream = source.body()
      if (!stream) {
        throw badRequest('Missing stream body')
      }
      return { ok: true, output: this.readOutputEvents(stream) as T }
    }
    return this.stream.decodeResponse(source)
  }

  private async *readOutputEvents(
    stream: ReadableStream<Uint8Array>,
  ): AsyncIterable<unknown> {
    let closed = false
    for await (const event of readSseEvents(stream)) {
      if (event.event === 'close') {
        closed = true
        return
      }
      if (event.event === 'error') {
        const decoded = await this.inner.decodeResponse(jsonSource(event.data))
        if (!decoded.ok) {
          throw new PFError({
            code: decoded.error.code,
            message: decoded.error.message,
            ...(decoded.error.data !== undefined
              ? { data: decoded.error.data }
              : {}),
          })
        }
        throw new PFError({
          code: 'INTERNAL',
          message: 'Invalid error event',
        })
      }
      if (event.event !== 'message') {
        continue
      }
      const decoded = await this.inner.decodeResponse(jsonSource(event.data))
      if (!decoded.ok) {
        throw new PFError({
          code: decoded.error.code,
          message: decoded.error.message,
          ...(decoded.error.data !== undefined
            ? { data: decoded.error.data }
            : {}),
        })
      }
      yield decoded.output
    }
    if (!closed) {
      throw new PFError({
        code: 'INTERNAL',
        message: 'Stream truncated',
      })
    }
  }
}

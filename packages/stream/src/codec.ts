import {
  type EnvelopeTextCodec,
  isJsonContentType,
  JSONCodec,
  jsonBodySource,
  mimeType,
  type RpcBodySource,
  type RpcCodec,
  type RpcEncodedBody,
} from '@ts-pf/http'
import {
  PFError,
  type RpcFailure,
  type RpcRequest,
  type RpcResponse,
  toWireError,
} from '@ts-pf/protocol'
import { isItemStream } from './item-stream.js'
import {
  badRequest,
  encodeJsonl,
  JSONL_CONTENT_TYPE,
  readJsonlLines,
} from './jsonl.js'

function isJsonlContentType(contentType: string | null): boolean {
  return mimeType(contentType) === JSONL_CONTENT_TYPE
}

function assertItem(value: unknown): void {
  if (isItemStream(value)) {
    throw badRequest('Nested streams are not supported')
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    throw badRequest('File values are not supported in streams')
  }
}

function assertNoNestedStreams(value: unknown, atRoot: boolean): void {
  if (isItemStream(value)) {
    if (!atRoot) {
      throw badRequest('Nested streams are not supported')
    }
    return
  }
  if (value === null || typeof value !== 'object') {
    return
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      assertNoNestedStreams(child, false)
    }
    return
  }
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) {
    return
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    assertNoNestedStreams(child, false)
  }
}

export class StreamCodec implements RpcCodec {
  private readonly inner: EnvelopeTextCodec

  constructor(options?: { inner?: EnvelopeTextCodec }) {
    this.inner = options?.inner ?? new JSONCodec()
  }

  async encodeRequest(req: RpcRequest): Promise<RpcEncodedBody> {
    if (isItemStream(req.input)) {
      return {
        contentType: JSONL_CONTENT_TYPE,
        body: encodeJsonl(
          req.input,
          async (item) => {
            assertItem(item)
            return (await this.inner.encodeRequest({ input: item })).body
          },
          failureLine,
        ),
      }
    }
    assertNoNestedStreams(req.input, true)
    return this.inner.encodeRequest(req)
  }

  async decodeRequest(source: RpcBodySource): Promise<RpcRequest> {
    if (isJsonlContentType(source.contentType)) {
      const stream = source.body()
      if (!stream) {
        throw badRequest('Missing stream body')
      }
      return {
        input: this.readInputLines(stream),
      }
    }
    if (!isJsonContentType(source.contentType)) {
      throw badRequest('Unsupported content type')
    }
    return this.inner.decodeRequest(source)
  }

  async encodeSuccess<T>(output: T): Promise<RpcEncodedBody> {
    if (isItemStream(output)) {
      return {
        contentType: JSONL_CONTENT_TYPE,
        body: encodeJsonl(
          output,
          async (item) => {
            assertItem(item)
            return (await this.inner.encodeSuccess(item)).body
          },
          failureLine,
        ),
      }
    }
    assertNoNestedStreams(output, true)
    return this.inner.encodeSuccess(output)
  }

  encodeFailure(error: {
    code: string
    message: string
    data?: unknown
  }): RpcEncodedBody | Promise<RpcEncodedBody> {
    return this.inner.encodeFailure(error)
  }

  async decodeResponse<T = unknown>(
    source: RpcBodySource,
  ): Promise<RpcResponse<T>> {
    if (isJsonlContentType(source.contentType)) {
      const stream = source.body()
      if (!stream) {
        throw badRequest('Missing stream body')
      }
      return { ok: true, output: this.readOutputLines(stream) as T }
    }
    if (!isJsonContentType(source.contentType)) {
      throw badRequest('Unsupported content type')
    }
    return this.inner.decodeResponse(source)
  }

  private async *readInputLines(
    stream: ReadableStream<Uint8Array>,
  ): AsyncIterable<unknown> {
    for await (const line of readJsonlLines(stream)) {
      const decoded = await this.inner.decodeRequest(jsonBodySource(line))
      yield decoded.input
    }
  }

  private async *readOutputLines(
    stream: ReadableStream<Uint8Array>,
  ): AsyncIterable<unknown> {
    for await (const line of readJsonlLines(stream)) {
      const decoded = await this.inner.decodeResponse(jsonBodySource(line))
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
  }
}

/** In-band failure after the stream started: an unknown throw is `INTERNAL`. */
function failureLine(error: unknown): string {
  const failure: RpcFailure = { ok: false, error: toWireError(error) }
  return JSON.stringify(failure)
}

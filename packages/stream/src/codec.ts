import {
  isPFError,
  JSONCodec,
  PFError,
  type RpcBodySource,
  type RpcCodec,
  type RpcEncodedBody,
  type RpcRequest,
  type RpcResponse,
} from '@ts-pf/protocol'
import { isAsyncIterable } from './is-async-iterable.js'
import {
  badRequest,
  encodeJsonl,
  JSONL_CONTENT_TYPE,
  readJsonlLines,
} from './jsonl.js'

function mime(contentType: string | null): string {
  if (contentType == null || contentType === '') {
    return ''
  }
  return contentType.split(';')[0]?.trim().toLowerCase() ?? ''
}

function isJsonContentType(contentType: string | null): boolean {
  const type = mime(contentType)
  return type === '' || type === 'application/json'
}

function isJsonlContentType(contentType: string | null): boolean {
  return mime(contentType) === JSONL_CONTENT_TYPE
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
  throw new Error('StreamCodec inner codec must produce a JSON string')
}

function assertItem(value: unknown): void {
  if (isAsyncIterable(value)) {
    throw badRequest('Nested streams are not supported')
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    throw badRequest('File values are not supported in streams')
  }
}

function assertNoNestedStreams(value: unknown, atRoot: boolean): void {
  if (isAsyncIterable(value)) {
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
  private readonly inner: RpcCodec

  constructor(options?: { inner?: RpcCodec }) {
    this.inner = options?.inner ?? new JSONCodec()
  }

  async encodeRequest(req: RpcRequest): Promise<RpcEncodedBody> {
    if (isAsyncIterable(req.input)) {
      return {
        contentType: JSONL_CONTENT_TYPE,
        body: encodeJsonl(
          req.input,
          async (item) => {
            assertItem(item)
            return jsonText(await this.inner.encodeRequest({ input: item }))
          },
          (error) => this.failureLine(error),
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
    if (isAsyncIterable(output)) {
      return {
        contentType: JSONL_CONTENT_TYPE,
        body: encodeJsonl(
          output,
          async (item) => {
            assertItem(item)
            return jsonText(await this.inner.encodeSuccess(item))
          },
          (error) => this.failureLine(error),
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
      const decoded = await this.inner.decodeRequest(jsonSource(line))
      yield decoded.input
    }
  }

  private async *readOutputLines(
    stream: ReadableStream<Uint8Array>,
  ): AsyncIterable<unknown> {
    for await (const line of readJsonlLines(stream)) {
      const decoded = await this.inner.decodeResponse(jsonSource(line))
      if (!decoded.ok) {
        throw new PFError({
          code: decoded.error.code,
          status: 200,
          message: decoded.error.message,
          ...(decoded.error.data !== undefined
            ? { data: decoded.error.data }
            : {}),
        })
      }
      yield decoded.output
    }
  }

  private failureLine(error: unknown): string {
    if (isPFError(error)) {
      const payload: { code: string; message: string; data?: unknown } = {
        code: error.code,
        message: error.message,
      }
      if (error.data !== undefined) {
        payload.data = error.data
      }
      return JSON.stringify({ ok: false, error: payload })
    }
    return JSON.stringify({
      ok: false,
      error: { code: 'INTERNAL', message: 'Internal server error' },
    })
  }
}

import type { RpcRequest, RpcResponse } from '@ts-pf/protocol'

export const PROTOCOL_HEADER = 'x-ts-pf-protocol'

export interface RpcEncodedBody {
  readonly contentType: string
  readonly body: string | Blob | FormData | ReadableStream<Uint8Array> | null
}

/** An `RpcEncodedBody` whose body is text: one envelope that fits in a string. */
export interface RpcEncodedText extends RpcEncodedBody {
  readonly body: string
}

export interface RpcBodySource {
  readonly contentType: string | null
  text(): Promise<string>
  formData(): Promise<FormData>
  body(): ReadableStream<Uint8Array> | null
}

export interface RpcCodec {
  encodeRequest(req: RpcRequest): RpcEncodedBody | Promise<RpcEncodedBody>
  decodeRequest(source: RpcBodySource): RpcRequest | Promise<RpcRequest>
  encodeSuccess<T>(output: T): RpcEncodedBody | Promise<RpcEncodedBody>
  encodeFailure(error: {
    code: string
    message: string
    data?: unknown
  }): RpcEncodedBody | Promise<RpcEncodedBody>
  decodeResponse<T = unknown>(
    source: RpcBodySource,
  ): RpcResponse<T> | Promise<RpcResponse<T>>
}

/**
 * An `RpcCodec` whose encoded bodies are strings. This is the `inner` role of
 * the wrapping codecs (`MultipartCodec`, `StreamCodec`, `SseCodec`): they
 * embed one envelope per multipart part, JSONL line, or SSE event, so the
 * inner codec must give them text, not a `Blob` or a stream. `JSONCodec`
 * implements it. Handlers and links still take any `RpcCodec`.
 */
export interface EnvelopeTextCodec extends RpcCodec {
  encodeRequest(req: RpcRequest): RpcEncodedText | Promise<RpcEncodedText>
  encodeSuccess<T>(output: T): RpcEncodedText | Promise<RpcEncodedText>
  encodeFailure(error: {
    code: string
    message: string
    data?: unknown
  }): RpcEncodedText | Promise<RpcEncodedText>
}

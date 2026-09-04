import type { RpcRequest, RpcResponse } from '@ts-pf/protocol'

export const PROTOCOL_HEADER = 'x-ts-pf-protocol'

export interface RpcEncodedBody {
  readonly contentType: string
  readonly body: string | Blob | FormData | ReadableStream<Uint8Array> | null
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

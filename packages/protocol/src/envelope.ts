export const PROTOCOL_VERSION = '1'
export const PROTOCOL_HEADER = 'x-ts-pf-protocol'

export type RpcRequest = { input?: unknown }

export type RpcSuccess<T = unknown> = { ok: true; output: T }

export type RpcFailure = {
  ok: false
  error: { code: string; message: string; data?: unknown }
}

export type RpcResponse<T = unknown> = RpcSuccess<T> | RpcFailure

export interface PFResultPromise<T, E> extends Promise<T> {
  readonly '~pfError'?: E
}

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

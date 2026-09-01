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

export interface RpcCodec {
  encodeRequest(req: RpcRequest): string
  decodeRequest(body: string): RpcRequest
  encodeSuccess<T>(output: T): string
  encodeFailure(error: {
    code: string
    message: string
    data?: unknown
  }): string
  decodeResponse<T = unknown>(body: string): RpcResponse<T>
}

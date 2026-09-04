export const PROTOCOL_VERSION = '1'

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

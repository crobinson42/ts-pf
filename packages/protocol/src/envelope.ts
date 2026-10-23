/**
 * Wire major: `v` on message `hello` / `hello-ok`. The HTTP header
 * `x-ts-pf-protocol` carries its decimal string, `PROTOCOL_VERSION`. Bump only
 * when the JSON envelope, a required frame field, or the handshake changes.
 */
export const PROTOCOL_MAJOR = 1 as const

/** `x-ts-pf-protocol` header value: the decimal string of `PROTOCOL_MAJOR`. */
export const PROTOCOL_VERSION: `${typeof PROTOCOL_MAJOR}` = `${PROTOCOL_MAJOR}`

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

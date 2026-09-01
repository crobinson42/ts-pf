import { PFError } from './error.js'
import type { RpcCodec, RpcRequest, RpcResponse } from './envelope.js'

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new PFError({ code: 'BAD_REQUEST', status: 400, message: 'Invalid JSON' })
  }
}

export class JSONCodec implements RpcCodec {
  encodeRequest(req: RpcRequest): string {
    if (req.input === undefined) {
      return '{}'
    }
    return JSON.stringify({ input: req.input })
  }

  decodeRequest(body: string): RpcRequest {
    const parsed = parseJson(body)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new PFError({
        code: 'BAD_REQUEST',
        status: 400,
        message: 'Request body must be a JSON object',
      })
    }
    const input = (parsed as { input?: unknown }).input
    if (input === undefined || input === null) {
      return { input: undefined }
    }
    return { input }
  }

  encodeSuccess<T>(output: T): string {
    return JSON.stringify({ ok: true, output })
  }

  encodeFailure(error: { code: string; message: string; data?: unknown }): string {
    const payload: { code: string; message: string; data?: unknown } = {
      code: error.code,
      message: error.message,
    }
    if (error.data !== undefined) {
      payload.data = error.data
    }
    return JSON.stringify({ ok: false, error: payload })
  }

  decodeResponse<T = unknown>(body: string): RpcResponse<T> {
    const parsed = parseJson(body)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new PFError({
        code: 'BAD_REQUEST',
        status: 400,
        message: 'Response body must be a JSON object',
      })
    }
    const value = parsed as { ok?: unknown; output?: T; error?: RpcResponse<T> extends { error: infer E } ? E : never }
    if (value.ok === true) {
      return { ok: true, output: value.output as T }
    }
    if (value.ok === false && value.error && typeof value.error === 'object') {
      return { ok: false, error: value.error as { code: string; message: string; data?: unknown } }
    }
    throw new PFError({
      code: 'BAD_REQUEST',
      status: 400,
      message: 'Invalid RPC envelope',
    })
  }
}

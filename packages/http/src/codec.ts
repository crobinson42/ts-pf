import { PFError, type RpcRequest, type RpcResponse } from '@ts-pf/protocol'
import type { RpcBodySource, RpcCodec, RpcEncodedBody } from './rpc.js'

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new PFError({
      code: 'BAD_REQUEST',
      status: 400,
      message: 'Invalid JSON',
    })
  }
}

function jsonBody(body: string): RpcEncodedBody {
  return { contentType: 'application/json', body }
}

export class JSONCodec implements RpcCodec {
  encodeRequest(req: RpcRequest): RpcEncodedBody {
    if (req.input === undefined) {
      return jsonBody('{}')
    }
    return jsonBody(JSON.stringify({ input: req.input }))
  }

  async decodeRequest(source: RpcBodySource): Promise<RpcRequest> {
    const text = await source.text()
    const parsed = parseJson(text.length > 0 ? text : '{}')
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
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

  encodeSuccess<T>(output: T): RpcEncodedBody {
    return jsonBody(JSON.stringify({ ok: true, output }))
  }

  encodeFailure(error: {
    code: string
    message: string
    data?: unknown
  }): RpcEncodedBody {
    const payload: { code: string; message: string; data?: unknown } = {
      code: error.code,
      message: error.message,
    }
    if (error.data !== undefined) {
      payload.data = error.data
    }
    return jsonBody(JSON.stringify({ ok: false, error: payload }))
  }

  async decodeResponse<T = unknown>(
    source: RpcBodySource,
  ): Promise<RpcResponse<T>> {
    const parsed = parseJson(await source.text())
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new PFError({
        code: 'BAD_REQUEST',
        status: 400,
        message: 'Response body must be a JSON object',
      })
    }
    const value = parsed as {
      ok?: unknown
      output?: T
      error?: RpcResponse<T> extends { error: infer E } ? E : never
    }
    if (value.ok === true) {
      return { ok: true, output: value.output as T }
    }
    if (value.ok === false && value.error && typeof value.error === 'object') {
      return {
        ok: false,
        error: value.error as { code: string; message: string; data?: unknown },
      }
    }
    throw new PFError({
      code: 'BAD_REQUEST',
      status: 400,
      message: 'Invalid RPC envelope',
    })
  }
}

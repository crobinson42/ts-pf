import type { RpcBodySource } from './rpc.js'

/**
 * An `RpcBodySource` over one JSON envelope that is already in memory, for
 * handing a JSONL line, an SSE `data:` payload, or a multipart `rpc` part to
 * an inner `EnvelopeTextCodec`. `formData()` is empty and `body()` is `null`.
 */
export function jsonBodySource(text: string): RpcBodySource {
  return {
    contentType: 'application/json',
    text: async () => text,
    formData: async () => new FormData(),
    body: () => null,
  }
}

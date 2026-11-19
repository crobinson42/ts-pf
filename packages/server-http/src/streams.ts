import { PFError } from '@ts-pf/protocol'
import type { ImplementedProcedure } from '@ts-pf/server'

/**
 * The key `stream()` from `@ts-pf/stream` sets on its schema. Read inline:
 * `server-http` does not depend on `@ts-pf/stream`.
 */
const STREAM_BRAND = '~pfStream'

/** Fixed `PROTOCOL.md` message ("Message streams"). */
const MESSAGE = 'Stream procedure requires a streaming codec'

/** A stream procedure reached a codec that cannot carry streams. */
export function streamCodecError(): PFError {
  return new PFError({ code: 'BAD_REQUEST', message: MESSAGE, status: 400 })
}

function isStreamSchema(schema: unknown): boolean {
  return typeof schema === 'object' && schema !== null && STREAM_BRAND in schema
}

/** The contract's input or output schema is a `stream()` schema. */
export function isStreamProcedure(procedure: ImplementedProcedure): boolean {
  const def = procedure['~pf'].contract['~pf']
  return isStreamSchema(def.input) || isStreamSchema(def.output)
}

/**
 * Close a stream output the codec did not encode as a stream. Never throws:
 * a throwing or rejecting `return()` is cleanup, not the call's error.
 */
export function closeUnsentStream(output: AsyncIterable<unknown>): void {
  try {
    const iterator = output[Symbol.asyncIterator]()
    Promise.resolve(iterator.return?.()).catch(() => {})
  } catch {
    // The call already failed; nothing else to close.
  }
}

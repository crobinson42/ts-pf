import type { RpcFailure } from './envelope.js'
import { isPFError } from './error.js'

/**
 * The `error` object of a failure envelope for any thrown value. A `PFError`
 * is its `toJSON()` (`{ code, message, data? }`, never `status` / `cause` /
 * `local`). Anything else becomes a fixed `INTERNAL` with no stack and no
 * message, so server internals never reach the wire — log the original
 * value at the site instead of this result.
 */
export function toWireError(error: unknown): RpcFailure['error'] {
  if (isPFError(error)) {
    return error.toJSON()
  }
  return { code: 'INTERNAL', message: 'Internal server error' }
}

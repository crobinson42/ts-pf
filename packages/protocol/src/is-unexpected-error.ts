import { isPFError } from './error.js'

/**
 * `true` for a thrown value that is not a `PFError`, or a `PFError` whose code
 * is `INTERNAL`: the failures nobody declared. This is what `FetchHandler`
 * (and `@ts-pf/mcp`) log by default when no `onError` is given; call it in a
 * custom `onError` to keep the same filter. A `cause` is not unwrapped.
 */
export function isUnexpectedError(error: unknown): boolean {
  return !isPFError(error) || error.code === 'INTERNAL'
}

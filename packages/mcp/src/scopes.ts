/** RFC 6749 `scope-token`: printable ASCII without space, `"`, or `\`. */
const SCOPE_TOKEN = /^[\x21\x23-\x5B\x5D-\x7E]+$/

/** Throws on a scope the SDK would reject when it builds the challenge. */
export function checkScopes(
  scopes: readonly string[],
  where: string,
): readonly string[] {
  for (const scope of scopes) {
    if (!SCOPE_TOKEN.test(scope)) {
      throw new TypeError(`${where}: "${scope}" is not an OAuth scope token`)
    }
  }
  return scopes
}

/**
 * The step-up set for a caller missing some of `required`: the granted scopes
 * plus the required ones, so re-consent never drops a permission (the MCP
 * authorization spec's recommended approach). `undefined` when nothing is
 * missing.
 */
export function stepUpScopes(
  required: readonly string[],
  granted: readonly string[],
): { scopes: string[]; missing: string[] } | undefined {
  const missing = required.filter((scope) => !granted.includes(scope))
  if (missing.length === 0) return undefined
  return { scopes: [...new Set([...granted, ...required])], missing }
}

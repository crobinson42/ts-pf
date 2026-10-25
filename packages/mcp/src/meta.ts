/** How a tool affects the world. Drives annotations, host buckets, and `all({ effect })`. */
export type Effect = 'read' | 'write' | 'destructive'

export const MCP_KEY = 'mcp' as const

export interface McpMeta {
  /** Unclassified procedures count as `write`. */
  effect?: Effect
  /** Model-facing description; wins over `docs()` description / summary. */
  description?: string
  /** Extra search terms for tool-host discovery. */
  aliases?: readonly string[]
}

/**
 * Contract-level MCP hints, merged into `.meta()` like `docs()`.
 * The `const` type parameter keeps `effect` a literal so `all(node, { effect })`
 * can filter at the type level.
 */
export function mcp<const M extends McpMeta>(value: M): { [MCP_KEY]: M } {
  return { [MCP_KEY]: value }
}

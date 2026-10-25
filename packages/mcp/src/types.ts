import type { JsonSchema } from '@ts-pf/docs'
import type { Effect } from './meta.js'

/** What a caller brings to `McpTools.list` / `McpTools.call`. */
export type McpCallInfo = {
  /** Validated token info (HTTP: from `verifyBearer` or the SDK OAuth helpers). */
  authInfo?: {
    token: string
    clientId: string
    scopes: string[]
    expiresAt?: number
    resource?: URL
    resourceMetadataUrl?: string
    extra?: Record<string, unknown>
  }
  /** The HTTP request, when there is one. Headers are never forwarded to procedures. */
  requestInfo?: Request
  signal?: AbortSignal
  inputResponses?: Record<string, unknown>
  /** `modern` = MCP 2026-07-28, `legacy` = the 2025 protocol. */
  era?: 'legacy' | 'modern'
  /**
   * Set by `McpTools.call` before `context` runs: the tool being called (for a
   * host call, the inner tool). Copy it into your own context type to trace it
   * in interceptors.
   */
  tool?: { name: string; path: string }
}

export type McpToolAnnotations = {
  readOnlyHint?: boolean
  destructiveHint?: boolean
}

export type McpToolDefinition = {
  name: string
  description: string
  inputSchema: JsonSchema
  /** Only when the tool declares `.output(schema, map)`; results are then checked. */
  outputSchema?: JsonSchema
  annotations: McpToolAnnotations
  effect: Effect
}

export type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: true
}

/** A bound toolset: list and call tools without a transport (tests, agent frameworks, `./sdk`). */
export interface McpTools {
  list(info?: McpCallInfo): Promise<McpToolDefinition[]>
  call(name: string, args: unknown, info?: McpCallInfo): Promise<McpToolResult>
}

import { getDocs } from '@ts-pf/docs'
import { type Effect, MCP_KEY, type McpMeta } from './meta.js'
import type { ToolSpec } from './tool.js'
import type { McpToolAnnotations } from './types.js'

function contractMeta(spec: ToolSpec): Record<string, unknown> {
  return (spec.procedure?.['~pf'].meta ?? {}) as Record<string, unknown>
}

function mcpMeta(spec: ToolSpec): McpMeta | undefined {
  const value = contractMeta(spec)[MCP_KEY]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  return value as McpMeta
}

/** `.effect()` → `mcp({ effect })`; `undefined` when neither classifies the tool. */
export function declaredEffect(spec: ToolSpec): Effect | undefined {
  return spec.effect ?? mcpMeta(spec)?.effect
}

/** Unclassified tools count as `write`: they never claim to be harmless. */
export function effectOf(spec: ToolSpec): Effect {
  return declaredEffect(spec) ?? 'write'
}

/** `.describe()` → `mcp({ description })` → `docs().description` → `docs().summary`. */
export function descriptionOf(spec: ToolSpec): string {
  const docs = getDocs(contractMeta(spec))
  return (
    spec.description ??
    mcpMeta(spec)?.description ??
    docs?.description ??
    docs?.summary ??
    ''
  )
}

export function tagsOf(spec: ToolSpec): readonly string[] {
  return getDocs(contractMeta(spec))?.tags ?? []
}

export function aliasesOf(spec: ToolSpec): readonly string[] {
  return mcpMeta(spec)?.aliases ?? []
}

export function isHidden(spec: ToolSpec): boolean {
  return getDocs(contractMeta(spec))?.hidden === true
}

export function annotationsFor(effect: Effect): McpToolAnnotations {
  if (effect === 'read') return { readOnlyHint: true }
  return { readOnlyHint: false, destructiveHint: effect === 'destructive' }
}

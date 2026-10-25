import type { McpToolResult } from './types.js'

export const DEFAULT_MAX_RESULT_CHARS = 25_000

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const rest = text.length - maxChars
  return `${text.slice(0, maxChars)}\n\n[Truncated: ${rest} more characters. Narrow the request to see the rest.]`
}

/** Strings pass through; `undefined` becomes `OK`; anything else is JSON. */
export function valueText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return 'OK'
  return JSON.stringify(value) ?? 'OK'
}

export function successResult(
  value: unknown,
  maxChars: number,
  structured: boolean,
): McpToolResult {
  const result: McpToolResult = {
    content: [{ type: 'text', text: truncate(valueText(value), maxChars) }],
  }
  if (structured && typeof value === 'object' && value !== null) {
    result.structuredContent = value as Record<string, unknown>
  }
  return result
}

export function errorResult(text: string, maxChars: number): McpToolResult {
  return {
    content: [{ type: 'text', text: truncate(text, maxChars) }],
    isError: true,
  }
}

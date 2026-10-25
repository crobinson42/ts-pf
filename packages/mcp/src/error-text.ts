import type { ValidationIssue } from '@ts-pf/contract'
import type { JsonSchema } from '@ts-pf/docs'
import { isPFError, toWireError } from '@ts-pf/protocol'
import type { ErrorText } from './tool.js'
import type { McpCallInfo } from './types.js'

/** Side-effect only; replaces the default `console.error`, like `FetchHandler`'s `onError`. */
export type McpOnError = (error: unknown, info: McpCallInfo) => void

/** The issues plus the expected schema, so the model can repair the call in one turn. */
export function invalidInputText(
  name: string,
  issues: readonly ValidationIssue[],
  schema: JsonSchema,
): string {
  const list = issues
    .map((issue) =>
      issue.path.length > 0
        ? `${issue.path.join('.')}: ${issue.message}`
        : issue.message,
    )
    .join('; ')
  return `Invalid input for ${name}: ${list}\nExpected schema: ${JSON.stringify(schema)}`
}

function validationIssues(error: unknown): ValidationIssue[] | undefined {
  if (!isPFError(error) || error.code !== 'VALIDATION') return undefined
  const issues = (error.data as { issues?: unknown } | undefined)?.issues
  return Array.isArray(issues) ? (issues as ValidationIssue[]) : undefined
}

type ErrorTextOptions = {
  name: string
  schema: JsonSchema
  errors: Readonly<Record<string, ErrorText>>
  context: unknown
}

/**
 * Model-facing text for a thrown value: invalid input → issues + schema; a
 * declared code with a `.errors()` mapper → its next-step text; any other
 * `PFError` → its code and message; anything else → `toWireError` (no leak).
 * A throwing mapper propagates, so the caller reports it as unknown.
 */
export function errorText(error: unknown, options: ErrorTextOptions): string {
  const issues = validationIssues(error)
  if (issues) return invalidInputText(options.name, issues, options.schema)
  if (isPFError(error) && error.code !== 'INTERNAL') {
    const mapper = options.errors[error.code]
    if (mapper) {
      return mapper({
        data: error.data,
        message: error.message,
        context: options.context,
      })
    }
    const data =
      error.data === undefined ? '' : `\n${JSON.stringify(error.data)}`
    return `${error.code}: ${error.message}${data}`
  }
  const wire = toWireError(error)
  return `${wire.code}: ${wire.message}`
}

/** `onError` when given; otherwise log unknown throws and `INTERNAL` `PFError`s, as `FetchHandler` does. */
export function reportError(
  error: unknown,
  info: McpCallInfo,
  onError: McpOnError | undefined,
): void {
  if (onError) {
    onError(error, info)
    return
  }
  const where = `"${info.tool?.name ?? '?'}"`
  if (!isPFError(error)) {
    console.error(`[ts-pf/mcp] Unhandled error in ${where}:`, error)
  } else if (error.code === 'INTERNAL') {
    console.error(`[ts-pf/mcp] INTERNAL error in ${where}:`, error)
  }
}

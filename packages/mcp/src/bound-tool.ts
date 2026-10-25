import type { JsonSchema } from '@ts-pf/docs'
import {
  modelInputSchema,
  modelOutputSchema,
  type SchemaIssue,
} from './schema.js'
import type { ToolSpec } from './tool.js'
import { annotationsFor, descriptionOf, effectOf } from './tool-meta.js'
import type { McpToolDefinition } from './types.js'

/** One tool after binding: computed once, so listing and calling only read it. */
export type BoundTool = {
  readonly name: string
  readonly spec: ToolSpec
  /** The schema the model fills (injected keys removed). */
  readonly inputSchema: JsonSchema
  /** `structuredContent` is returned only when `outputSchema` is advertised. */
  readonly structured: boolean
  readonly definition: McpToolDefinition
  /** Schema problems for `audit()`. */
  readonly issues: readonly SchemaIssue[]
}

function withExamples(description: string, examples: readonly unknown[]) {
  if (examples.length === 0) return description
  const lines = examples.map((example) => JSON.stringify(example)).join('\n')
  return `${description}\n\nExamples:\n${lines}`
}

export function bindTool(name: string, spec: ToolSpec): BoundTool {
  const input = modelInputSchema(spec)
  const output = modelOutputSchema(spec)
  const effect = effectOf(spec)
  const definition: McpToolDefinition = {
    name,
    description: withExamples(descriptionOf(spec), spec.examples),
    inputSchema: input.schema,
    annotations: annotationsFor(effect),
    effect,
  }
  if (output.schema) definition.outputSchema = output.schema
  return {
    name,
    spec,
    inputSchema: input.schema,
    structured: output.schema !== undefined,
    definition,
    issues: [...input.issues, ...output.issues],
  }
}

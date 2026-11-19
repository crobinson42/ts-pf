import type { JsonSchema } from '@ts-pf/docs'
import { mapSchema } from './walk.js'

/** Which side of the wire a schema describes. */
export type Side = 'input' | 'output'

/**
 * The default normalizations of a catalog schema: drop nested `$schema`
 * (the document's `jsonSchemaDialect` declares it) and, on the output side,
 * drop `additionalProperties: false` so a newer server can add fields
 * without breaking generated clients. Input schemas keep their closedness.
 */
export function normalizeSchema(schema: JsonSchema, side: Side): JsonSchema {
  return mapSchema(schema, (node) => {
    const { $schema: _dialect, ...rest } = node
    if (side === 'output' && rest.additionalProperties === false) {
      const { additionalProperties: _closed, ...open } = rest
      return open
    }
    return rest
  }) as JsonSchema
}

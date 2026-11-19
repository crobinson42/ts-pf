import type { JsonSchema } from '@ts-pf/docs'
import { mapDocumentSchemas } from './document.js'
import type { OpenAPIDocument } from './types.js'
import { mapSchema } from './walk.js'

// The JSON Schema 2020-12 formats. Zod emits a `pattern` next to these that
// says the same thing in a regex many generators cannot compile. Other
// formats (`cuid`, `nanoid`, …) keep their pattern: it is the only detail.
const STANDARD_FORMATS = new Set([
  'date-time',
  'date',
  'time',
  'duration',
  'email',
  'idn-email',
  'hostname',
  'idn-hostname',
  'ipv4',
  'ipv6',
  'uri',
  'uri-reference',
  'iri',
  'iri-reference',
  'uuid',
  'uri-template',
  'json-pointer',
  'relative-json-pointer',
  'regex',
])

/** `dropFormatPatterns`: drop `pattern` where a standard `format` is set. */
export function dropFormatPatterns(document: OpenAPIDocument): void {
  mapDocumentSchemas(
    document,
    (schema) =>
      mapSchema(schema, (node) => {
        if (
          typeof node.format !== 'string' ||
          !STANDARD_FORMATS.has(node.format) ||
          node.pattern === undefined
        ) {
          return node
        }
        const { pattern: _regex, ...rest } = node
        return rest
      }) as JsonSchema,
  )
}

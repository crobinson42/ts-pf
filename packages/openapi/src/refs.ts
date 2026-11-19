import type { JsonSchema } from '@ts-pf/docs'
import { mapSchema } from './walk.js'

const COMPONENT_PREFIX = '#/components/schemas/'
const DEFS_REF = /^#\/(?:\$defs|definitions)\/([^/]+)(.*)$/

export function componentRef(name: string): JsonSchema {
  return { $ref: `${COMPONENT_PREFIX}${name}` }
}

export function putSchema(
  schemas: Record<string, JsonSchema>,
  name: string,
  schema: JsonSchema,
): JsonSchema {
  schemas[name] = schema
  return componentRef(name)
}

/** `#/$defs/<key>…` (or `#/definitions/…`) → the def key and the rest. */
export function defTarget(
  ref: string,
): { key: string; rest: string } | undefined {
  const match = DEFS_REF.exec(ref)
  if (match === null) {
    return undefined
  }
  return { key: unescapePointer(match[1] ?? ''), rest: match[2] ?? '' }
}

/** Rewrites every local `$ref` / `$dynamicRef` with `resolve`. */
export function rewriteRefs(
  schema: JsonSchema,
  resolve: (ref: string) => string,
): JsonSchema {
  return mapSchema(schema, (node) => {
    const out = { ...node }
    for (const key of ['$ref', '$dynamicRef'] as const) {
      const ref = out[key]
      if (typeof ref === 'string' && ref.startsWith('#')) {
        out[key] = resolve(ref)
      }
    }
    return out
  }) as JsonSchema
}

/**
 * Points a document-relative ref at the component that now holds that
 * document. Refs already under `#/components/` and anchors are left alone.
 */
export function relocateRef(ref: string, componentName: string): string {
  if (ref.startsWith('#/components/')) {
    return ref
  }
  if (ref === '#') {
    return `${COMPONENT_PREFIX}${componentName}`
  }
  if (ref.startsWith('#/')) {
    return `${COMPONENT_PREFIX}${componentName}${ref.slice(1)}`
  }
  return ref
}

function unescapePointer(value: string): string {
  return value.replace(/~1/g, '/').replace(/~0/g, '~')
}

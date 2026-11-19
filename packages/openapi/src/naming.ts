import type { JsonSchema, ProcedureCatalog } from '@ts-pf/docs'
import { componentTarget, mapDocumentSchemas } from './document.js'
import {
  pascalCase,
  protocolErrorSchemaName,
  schemaName,
  sharedErrorSchemaName,
} from './names.js'
import { componentRef, rewriteRefs } from './refs.js'
import type { OpenAPIDocument } from './types.js'

const GENERATED_COMPONENT = /^(.+)\.(__schema\d+)$/

/**
 * `naming: 'pascal'`: renames the components the document derived from
 * procedure paths and error codes (`auth.verifyCode.Input` →
 * `AuthVerifyCodeInput`, `Error.NOT_FOUND` → `NotFoundError`). Ids keep
 * their names, and a procedure whose input or output is just an id uses
 * the id: its `Input` / `Output` alias is dropped. Throws when two
 * different schemas end up with one name. Returns each renamed (or dropped
 * alias) component's new name.
 */
export function pascalNames(
  document: OpenAPIDocument,
  catalog: ProcedureCatalog,
): Map<string, string> {
  const { schemas } = document.components
  const renames = derivedNames(catalog, schemas)
  const aliases = new Map<string, string>()
  for (const proc of catalog.procedures) {
    for (const suffix of ['Input', 'Output']) {
      const name = schemaName(proc.path, suffix)
      const id = idAlias(schemas[name], renames)
      if (id !== undefined) {
        aliases.set(name, id)
      }
    }
  }
  const targets = new Map([...renames, ...aliases])

  const renamed: Record<string, JsonSchema> = {}
  const sources = new Map<string, string>()
  for (const [name, schema] of Object.entries(schemas)) {
    if (aliases.has(name)) {
      continue
    }
    const next = renames.get(name) ?? name
    const source = sources.get(next)
    if (source === undefined) {
      sources.set(next, name)
      renamed[next] = schema
    } else if (JSON.stringify(schemas[source]) !== JSON.stringify(schema)) {
      throw new Error(
        `openapi(): naming 'pascal' gives "${source}" and "${name}" one component name "${next}". Give one a distinct .meta({ id }).`,
      )
    }
  }

  document.components.schemas = renamed
  mapDocumentSchemas(document, (schema) =>
    rewriteRefs(schema, (ref) => {
      const target = componentTarget(ref)
      const next = target === undefined ? undefined : targets.get(target.name)
      return next === undefined
        ? ref
        : `${componentRef(next).$ref}${target?.rest ?? ''}`
    }),
  )
  return targets
}

/** Dotted component name → PascalCase name, for every derived name. */
function derivedNames(
  catalog: ProcedureCatalog,
  schemas: Record<string, JsonSchema>,
): Map<string, string> {
  const names = new Map<string, string>()
  const withData = (dotted: string, pascal: string) => {
    names.set(dotted, pascal)
    names.set(`${dotted}.Data`, `${pascal}Data`)
  }
  for (const err of catalog.protocolErrors) {
    withData(
      protocolErrorSchemaName(err.code),
      `TsPf${pascalCase(err.code)}Error`,
    )
  }
  for (const proc of catalog.procedures) {
    const base = proc.path.map(pascalCase).join('')
    for (const suffix of ['Input', 'Output', 'Request', 'Success']) {
      names.set(schemaName(proc.path, suffix), `${base}${suffix}`)
    }
    for (const err of proc.errors) {
      const code = pascalCase(err.code)
      withData(sharedErrorSchemaName(err.code), `${code}Error`)
      withData(
        schemaName(proc.path, `Error.${err.code}`),
        `${base}${code}Error`,
      )
    }
  }
  // Zod's unnamed recursion, named after its host: `<host>.__schemaN`.
  for (const name of Object.keys(schemas)) {
    const match = GENERATED_COMPONENT.exec(name)
    const host = match?.[1]
    if (host !== undefined && Object.hasOwn(schemas, host)) {
      names.set(
        name,
        `${names.get(host) ?? host}${pascalCase(match?.[2] ?? '')}`,
      )
    }
  }
  return names
}

/** The id a component is a bare `$ref` to (not another derived name). */
function idAlias(
  schema: JsonSchema | undefined,
  renames: Map<string, string>,
): string | undefined {
  if (schema === undefined || Object.keys(schema).length !== 1) {
    return undefined
  }
  const target = componentTarget(schema.$ref)
  return target !== undefined && target.rest === '' && !renames.has(target.name)
    ? target.name
    : undefined
}

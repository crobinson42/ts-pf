import type { JsonSchema, ProcedureCatalog } from '@ts-pf/docs'
import { protocolErrorRefs, sharedErrorRefs } from './errors.js'
import { createHoister } from './hoist.js'
import { toPathEntry } from './operation.js'
import { applySchemaPasses, resolveProfile } from './profile.js'
import { sharedErrorComponents } from './shared-errors.js'
import { isStreamProcedure, streamEntry } from './streams.js'
import type {
  OpenAPIDocument,
  OpenAPIOptions,
  OpenAPIStreamEntry,
  PathItem,
} from './types.js'

const JSON_SCHEMA_DIALECT =
  'https://json-schema.org/draft/2020-12/schema' as const

export function openapi(
  source: ProcedureCatalog,
  options: OpenAPIOptions,
): OpenAPIDocument {
  if (source.catalogVersion !== 1) {
    throw new Error(
      `Unsupported catalogVersion: ${String(source.catalogVersion)}`,
    )
  }
  if (!Array.isArray(source.procedures)) {
    throw new Error('catalog.procedures must be an array')
  }
  if (options.info.title.trim() === '' || options.info.version.trim() === '') {
    throw new Error('info.title and info.version are required')
  }

  const profile = resolveProfile(options)
  // `streams: 'omit'` leaves stream procedures out as a catalog filter would.
  const catalog: ProcedureCatalog =
    profile.streams === 'omit'
      ? {
          ...source,
          procedures: source.procedures.filter(
            (proc) => !isStreamProcedure(proc),
          ),
        }
      : source
  const schemas: Record<string, JsonSchema> = {}
  const hoister = createHoister(schemas)
  const includeProtocolErrors = options.protocolErrors !== false
  const sharedErrors = profile.errors === 'shared'
  const protocolRefs =
    includeProtocolErrors && !sharedErrors
      ? protocolErrorRefs(catalog, schemas, hoister)
      : new Map<string, JsonSchema>()
  const sharedRefs = sharedErrors
    ? new Map<string, JsonSchema>()
    : sharedErrorRefs(catalog, schemas, hoister)
  const rpcError = sharedErrors
    ? sharedErrorComponents(catalog, schemas, hoister, includeProtocolErrors)
    : undefined

  const paths: Record<string, PathItem> = {}
  const tags: string[] = []
  const seenTags = new Set<string>()

  const streams: Record<string, OpenAPIStreamEntry> = {}
  const context = {
    catalog,
    openapi: options,
    schemas,
    hoister,
    protocolRefs,
    sharedErrorRefs: sharedRefs,
    includeProtocolErrors,
    profile,
    rpcError,
  }

  for (const proc of catalog.procedures) {
    if (profile.streams === 'components' && isStreamProcedure(proc)) {
      streams[proc.key] = streamEntry(proc, context)
      continue
    }
    const entry = toPathEntry(proc, context)
    paths[entry.path] = entry.item
    if (entry.tags !== undefined) {
      for (const tag of entry.tags) {
        if (!seenTags.has(tag)) {
          seenTags.add(tag)
          tags.push(tag)
        }
      }
    }
  }

  const dataComponents = hoister.finish()

  const document: OpenAPIDocument = {
    openapi: '3.1.0',
    info: copyInfo(options),
    jsonSchemaDialect: JSON_SCHEMA_DIALECT,
    paths,
    components: {
      schemas,
      parameters: {
        TsPfProtocol: {
          name: catalog.protocol.header.name,
          in: 'header',
          required: true,
          schema: {
            type: 'string',
            const: catalog.protocol.header.value,
          },
        },
      },
    },
  }
  if (options.servers !== undefined) {
    document.servers = options.servers
  }
  if (tags.length > 0) {
    document.tags = tags.map((name) => ({ name }))
  }
  if (Object.keys(streams).length > 0) {
    document['x-ts-pf-streams'] = streams
  }
  const passes =
    options.enumNames === undefined
      ? { dataComponents }
      : { dataComponents, enumNames: options.enumNames }
  return applySchemaPasses(document, catalog, profile, passes)
}

function copyInfo({
  info,
  catalogHash,
}: OpenAPIOptions): OpenAPIDocument['info'] {
  const out: OpenAPIDocument['info'] = {
    title: info.title,
    version: info.version,
  }
  if (info.summary !== undefined) {
    out.summary = info.summary
  }
  if (info.description !== undefined) {
    out.description = info.description
  }
  if (info.termsOfService !== undefined) {
    out.termsOfService = info.termsOfService
  }
  if (info.contact !== undefined) {
    out.contact = info.contact
  }
  if (info.license !== undefined) {
    out.license = info.license
  }
  if (catalogHash !== undefined) {
    out['x-ts-pf-catalog-hash'] = catalogHash
  }
  return out
}

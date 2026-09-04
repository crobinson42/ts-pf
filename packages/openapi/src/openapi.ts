import type { JsonSchema, ProcedureCatalog } from '@ts-pf/docs'
import { protocolErrorRefs } from './errors.js'
import { toPathEntry } from './operation.js'
import type {
  OpenAPIDocument,
  OpenAPIInfo,
  OpenAPIOptions,
  PathItem,
} from './types.js'

const JSON_SCHEMA_DIALECT =
  'https://json-schema.org/draft/2020-12/schema' as const

export function openapi(
  catalog: ProcedureCatalog,
  options: OpenAPIOptions,
): OpenAPIDocument {
  if (catalog.catalogVersion !== 1) {
    throw new Error(
      `Unsupported catalogVersion: ${String(catalog.catalogVersion)}`,
    )
  }
  if (!Array.isArray(catalog.procedures)) {
    throw new Error('catalog.procedures must be an array')
  }
  if (options.info.title.trim() === '' || options.info.version.trim() === '') {
    throw new Error('info.title and info.version are required')
  }

  const schemas: Record<string, JsonSchema> = {}
  const includeProtocolErrors = options.protocolErrors !== false
  const protocolRefs = includeProtocolErrors
    ? protocolErrorRefs(catalog, schemas)
    : new Map<string, JsonSchema>()

  const paths: Record<string, PathItem> = {}
  const tags: string[] = []
  const seenTags = new Set<string>()

  for (const proc of catalog.procedures) {
    const entry = toPathEntry(proc, {
      catalog,
      openapi: options,
      schemas,
      protocolRefs,
      includeProtocolErrors,
    })
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

  const document: OpenAPIDocument = {
    openapi: '3.1.0',
    info: copyInfo(options.info),
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
  return document
}

function copyInfo(info: OpenAPIInfo): OpenAPIInfo {
  const out: OpenAPIInfo = {
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
  return out
}

import type {
  CatalogProcedure,
  CatalogSchema,
  JsonSchema,
  ProcedureCatalog,
} from '@ts-pf/docs'
import {
  innerFromCatalog,
  requestEnvelope,
  successEnvelope,
} from './envelope.js'
import { operationErrorResponses } from './errors.js'
import {
  operationId as makeOperationId,
  operationPath,
  schemaName,
} from './names.js'
import { putSchema } from './refs.js'
import type {
  OpenAPIOperation,
  OpenAPIOptions,
  OpenAPIRequestBody,
  OpenAPIResponse,
  PathItem,
} from './types.js'

export function toPathEntry(
  proc: CatalogProcedure,
  options: {
    catalog: ProcedureCatalog
    openapi: OpenAPIOptions
    schemas: Record<string, JsonSchema>
    protocolRefs: Map<string, JsonSchema>
    includeProtocolErrors: boolean
  },
): { path: string; item: PathItem; tags?: string[] } {
  const operation = toOperation(proc, options)
  const item: PathItem = { post: operation }
  const result: { path: string; item: PathItem; tags?: string[] } = {
    path: operationPath(proc.href, proc.key),
    item,
  }
  if (operation.tags !== undefined) {
    result.tags = operation.tags
  }
  return result
}

function toOperation(
  proc: CatalogProcedure,
  options: {
    catalog: ProcedureCatalog
    openapi: OpenAPIOptions
    schemas: Record<string, JsonSchema>
    protocolRefs: Map<string, JsonSchema>
    includeProtocolErrors: boolean
  },
): OpenAPIOperation {
  const requestName = schemaName(proc.path, 'Request')
  const successName = schemaName(proc.path, 'Success')
  const requestInner = innerFromCatalog(proc.input)
  const successInner = innerFromCatalog(proc.output)
  const requestSchema = putSchema(
    options.schemas,
    requestName,
    requestEnvelope(hasInput(proc) ? requestInner : undefined),
  )
  const successSchema = putSchema(
    options.schemas,
    successName,
    successEnvelope(hasOutput(proc) ? successInner : undefined),
  )

  const operation: OpenAPIOperation = {
    operationId: makeOperationId(proc.path),
    parameters: [{ $ref: '#/components/parameters/TsPfProtocol' }],
    requestBody: requestBody(proc, requestSchema, options.openapi),
    responses: {
      '200': successResponse(proc, successSchema, options),
      ...operationErrorResponses(proc, options),
    },
  }
  if (proc.docs?.summary !== undefined) {
    operation.summary = proc.docs.summary
  }
  if (proc.docs?.description !== undefined) {
    operation.description = proc.docs.description
  }
  if (proc.docs?.deprecated === true) {
    operation.deprecated = true
  }
  const tags = tagsFor(proc)
  if (tags !== undefined) {
    operation.tags = tags
  }
  return operation
}

function requestBody(
  proc: CatalogProcedure,
  requestSchema: JsonSchema,
  options: OpenAPIOptions,
): OpenAPIRequestBody {
  const content: Record<string, { schema: JsonSchema }> = {}
  if (isStream(proc.input)) {
    content['application/jsonl'] = { schema: requestSchema }
  } else {
    content['application/json'] = { schema: requestSchema }
    if (options.multipart === true) {
      content['multipart/form-data'] = {
        schema: {
          type: 'object',
          required: ['rpc'],
          properties: { rpc: requestSchema },
          additionalProperties: {
            type: 'string',
            contentMediaType: 'application/octet-stream',
          },
        },
      }
    }
  }
  const body: OpenAPIRequestBody = { content }
  if (hasInput(proc)) {
    body.required = true
  }
  if (options.multipart === true && !isStream(proc.input)) {
    body.description =
      'JSON RPC envelope, or multipart with JSON part `rpc` plus numbered file parts (see ts-pf PROTOCOL.md).'
  }
  return body
}

function successResponse(
  proc: CatalogProcedure,
  successSchema: JsonSchema,
  options: {
    catalog: ProcedureCatalog
    openapi: OpenAPIOptions
  },
): OpenAPIResponse {
  const headerName = options.catalog.protocol.header.name
  const headerValue = options.catalog.protocol.header.value
  const headers = {
    [headerName]: {
      required: true as const,
      schema: { type: 'string', const: headerValue },
    },
  }
  if (isStream(proc.output)) {
    const content: Record<string, { schema: JsonSchema }> = {
      'application/jsonl': { schema: successSchema },
    }
    const response: OpenAPIResponse = {
      description:
        'RPC success stream. HTTP status stays 200 after the stream starts; in-band `{ ok: false, error }` lines are failures; EOF ends the stream.',
      headers,
      content,
    }
    if (options.openapi.sse === true) {
      content['text/event-stream'] = { schema: successSchema }
      response.description = `${response.description} SSE framing uses event: message / error / close; data: is the same JSONL line.`
    }
    return response
  }
  return {
    description: 'RPC success',
    headers,
    content: {
      'application/json': { schema: successSchema },
    },
  }
}

function tagsFor(proc: CatalogProcedure): string[] | undefined {
  if (proc.docs?.tags !== undefined && proc.docs.tags.length > 0) {
    return [...proc.docs.tags]
  }
  const first = proc.path[0]
  if (proc.path.length > 1 && first !== undefined) {
    return [first]
  }
  return undefined
}

function isStream(schema: CatalogSchema | undefined): boolean {
  return schema?.kind === 'stream'
}

function hasInput(proc: CatalogProcedure): boolean {
  return proc.input !== undefined
}

function hasOutput(proc: CatalogProcedure): boolean {
  return proc.output !== undefined
}

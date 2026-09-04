import type { JsonSchema } from '@ts-pf/docs'

export type OpenAPIInfo = {
  title: string
  version: string
  summary?: string
  description?: string
  termsOfService?: string
  contact?: {
    name?: string
    url?: string
    email?: string
  }
  license?: {
    name: string
    url?: string
  }
}

export type OpenAPIServer = {
  url: string
  description?: string
}

export type OpenAPIOptions = {
  info: OpenAPIInfo
  servers?: ReadonlyArray<OpenAPIServer>
  /** Default true. Attach protocol errors that can occur on a matched POST. */
  protocolErrors?: boolean
  /**
   * For `kind: 'stream'` outputs, also advertise `text/event-stream`.
   * Default false — catalog does not know the codec.
   */
  sse?: boolean
  /**
   * Also advertise `multipart/form-data` request bodies (approximate).
   * Default false — files are a codec, not in the catalog.
   */
  multipart?: boolean
}

export type OpenAPIMediaType = {
  schema?: JsonSchema
}

export type OpenAPIRequestBody = {
  required?: boolean
  description?: string
  content: Record<string, OpenAPIMediaType>
}

export type OpenAPIResponseHeader = {
  schema?: JsonSchema
  required?: boolean
  description?: string
}

export type OpenAPIResponse = {
  description: string
  headers?: Record<string, OpenAPIResponseHeader>
  content?: Record<string, OpenAPIMediaType>
}

export type OpenAPIParameter = {
  name: string
  in: 'header' | 'query' | 'path' | 'cookie'
  required?: boolean
  schema?: JsonSchema
}

export type OpenAPIRef = {
  $ref: string
}

export type OpenAPIOperation = {
  operationId?: string
  summary?: string
  description?: string
  tags?: string[]
  deprecated?: boolean
  parameters?: Array<OpenAPIParameter | OpenAPIRef>
  requestBody?: OpenAPIRequestBody
  responses: Record<string, OpenAPIResponse>
}

export type PathItem = {
  post?: OpenAPIOperation
}

export type OpenAPIDocument = {
  openapi: '3.1.0'
  info: OpenAPIInfo
  jsonSchemaDialect?: string
  servers?: ReadonlyArray<OpenAPIServer>
  tags?: Array<{ name: string }>
  paths: Record<string, PathItem>
  components: {
    schemas: Record<string, JsonSchema>
    parameters?: Record<string, OpenAPIParameter>
  }
}

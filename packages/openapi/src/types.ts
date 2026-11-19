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

type OpenAPIServer = {
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
  /**
   * A preset for code generators. `'codegen'` sets every option below to
   * its generator-friendly value; an option you also pass wins.
   */
  profile?: 'codegen'
  /**
   * `'components'` (default): `<path>.Request` / `<path>.Success` envelope
   * components. `'inline'`: the envelopes are inline in each operation.
   */
  envelopes?: 'components' | 'inline'
  /**
   * `'per-code'` (default): one failure envelope per code (`Error.<CODE>`,
   * `TsPf.Error.<CODE>`, or `<path>.Error.<CODE>`). `'shared'`: one
   * `RpcError` envelope, an `ErrorCode` enum, a `<Code>Data` schema per code
   * with data, and `x-ts-pf-errors` on each operation. Throws when one code
   * has two `data` shapes.
   */
  errors?: 'per-code' | 'shared'
  /**
   * `'path'` (default): dotted names (`auth.verifyCode.Input`). `'pascal'`:
   * `AuthVerifyCodeInput`; a procedure whose input or output is a
   * `.meta({ id })` type uses the id. Throws when two schemas get one name.
   */
  naming?: 'path' | 'pascal'
  /**
   * Add `additionalProperties: false` to objects reached only from inputs
   * (stricter than the server, which strips unknown keys). Default false.
   */
  closeInputs?: boolean
  /**
   * `'exceptTags'`: rewrite `const: v` as `enum: [v]`, except on the tag
   * property of a union of objects. Default false.
   */
  constAsEnum?: false | 'exceptTags'
  /** Drop `pattern` where a standard `format` says the same. Default false. */
  dropFormatPatterns?: boolean
  /**
   * A procedure with no input (or a `null` input) gets an inline
   * `{ input: null }` request body and no `Input` component. Default false.
   */
  emptyInputNull?: boolean
}

type OpenAPIMediaType = {
  schema?: JsonSchema
}

export type OpenAPIRequestBody = {
  required?: boolean
  description?: string
  content: Record<string, OpenAPIMediaType>
}

type OpenAPIResponseHeader = {
  schema?: JsonSchema
  required?: boolean
  description?: string
}

export type OpenAPIResponse = {
  description: string
  headers?: Record<string, OpenAPIResponseHeader>
  content?: Record<string, OpenAPIMediaType>
}

type OpenAPIParameter = {
  name: string
  in: 'header' | 'query' | 'path' | 'cookie'
  required?: boolean
  schema?: JsonSchema
}

type OpenAPIRef = {
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
  /** The error codes this operation can return (`errors: 'shared'`). */
  'x-ts-pf-errors'?: string[]
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

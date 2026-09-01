import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Static, TSchema } from 'typebox'
import { standardSchemaAdapter } from './adapters/standard-schema.js'
import { typeboxAdapter } from './adapters/typebox.js'
import type { SchemaAdapter, SchemaResult } from './schema-types.js'

export type {
  SchemaAdapter,
  SchemaResult,
  ValidationIssue,
} from './schema-types.js'

const customAdapters: SchemaAdapter[] = []

export function registerSchemaAdapter(adapter: SchemaAdapter): void {
  customAdapters.unshift(adapter)
}

export function isStandardSchema(schema: unknown): schema is StandardSchemaV1 {
  return typeof schema === 'object' && schema !== null && '~standard' in schema
}

const builtinAdapters: SchemaAdapter[] = [standardSchemaAdapter, typeboxAdapter]

export async function validateSchema<T = unknown>(
  schema: unknown,
  value: unknown,
): Promise<SchemaResult<T>> {
  for (const adapter of customAdapters) {
    if (adapter.accept(schema)) {
      return (await adapter.validate(schema, value)) as SchemaResult<T>
    }
  }
  for (const adapter of builtinAdapters) {
    if (adapter.accept(schema)) {
      return (await adapter.validate(schema, value)) as SchemaResult<T>
    }
  }
  throw new Error(
    'No schema adapter. Pass a Standard Schema library (Zod, Valibot, ArkType) or a TypeBox TSchema.',
  )
}

export type AnySchema = StandardSchemaV1 | TypeBoxLike

export interface TypeBoxLike {
  readonly '~kind': string
}

type InferStandardIO<S, Kind extends 'input' | 'output'> = S extends {
  '~standard': { types?: infer T }
}
  ? NonNullable<T> extends { [K in Kind]: infer V }
    ? V
    : unknown
  : unknown

type InferTypeBox<S> = S extends { readonly '~kind': string }
  ? Static<Extract<S, TSchema>>
  : unknown

export type InferSchemaOutput<S> = S extends { _zod: { output: infer Z } }
  ? Z
  : S extends { readonly '~kind': string }
    ? InferTypeBox<S>
    : InferStandardIO<S, 'output'>

export type InferSchemaInput<S> = S extends { _zod: { input: infer Z } }
  ? Z
  : S extends { readonly '~kind': string }
    ? InferTypeBox<S>
    : InferStandardIO<S, 'input'>

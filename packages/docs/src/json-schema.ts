import { standardJsonSchemaConverter } from './converters/standard.js'
import { typeboxJsonSchemaConverter } from './converters/typebox.js'
import type { JsonSchema } from './types.js'

export type JsonSchemaConvertOptions = {
  io: 'input' | 'output'
  target?: 'draft-2020-12'
}

export interface JsonSchemaConverter {
  vendor: string
  accept(schema: unknown): boolean
  convert(schema: unknown, options: JsonSchemaConvertOptions): JsonSchema
}

const customConverters: JsonSchemaConverter[] = []
const builtinConverters: JsonSchemaConverter[] = [
  standardJsonSchemaConverter,
  typeboxJsonSchemaConverter,
]

export function registerJsonSchemaConverter(
  converter: JsonSchemaConverter,
): void {
  customConverters.unshift(converter)
}

export function toJsonSchema(
  schema: unknown,
  options: JsonSchemaConvertOptions,
): JsonSchema {
  const resolved: JsonSchemaConvertOptions = {
    io: options.io,
    target: options.target ?? 'draft-2020-12',
  }
  for (const converter of customConverters) {
    if (converter.accept(schema)) {
      return converter.convert(schema, resolved)
    }
  }
  for (const converter of builtinConverters) {
    if (converter.accept(schema)) {
      return converter.convert(schema, resolved)
    }
  }
  throw new Error(
    'No JSON Schema converter. Use a Standard JSON Schema library (Zod 4.2+, ArkType), TypeBox, or registerJsonSchemaConverter.',
  )
}

export function tryToJsonSchema(
  schema: unknown,
  options: JsonSchemaConvertOptions,
):
  | { ok: true; schema: JsonSchema; vendor: string }
  | { ok: false; reason: string } {
  try {
    const resolved: JsonSchemaConvertOptions = {
      io: options.io,
      target: options.target ?? 'draft-2020-12',
    }
    for (const converter of [...customConverters, ...builtinConverters]) {
      if (converter.accept(schema)) {
        return {
          ok: true,
          schema: converter.convert(schema, resolved),
          vendor: converter.vendor,
        }
      }
    }
    return { ok: false, reason: 'No JSON Schema converter matched' }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'JSON Schema conversion failed'
    return { ok: false, reason: message }
  }
}

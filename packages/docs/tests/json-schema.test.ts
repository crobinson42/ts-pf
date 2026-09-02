import Type from 'typebox'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  registerJsonSchemaConverter,
  toJsonSchema,
} from '../src/json-schema.js'

describe('toJsonSchema', () => {
  it('converts Standard JSON Schema (Zod) to draft-2020-12', () => {
    const schema = z.object({ id: z.number() })
    const json = toJsonSchema(schema, { io: 'output' })
    expect(json).toMatchObject({
      type: 'object',
      properties: { id: { type: 'number' } },
    })
  })

  it('converts TypeBox by JSON-cloning the TSchema', () => {
    const schema = Type.Object({ name: Type.String() })
    const json = toJsonSchema(schema, { io: 'output' })
    expect(json).toMatchObject({
      type: 'object',
      properties: { name: { type: 'string' } },
    })
    expect(json).not.toHaveProperty('~kind')
  })

  it('throws when no converter accepts the schema', () => {
    expect(() => toJsonSchema({ nope: true }, { io: 'output' })).toThrow(
      /converter/i,
    )
  })

  it('rejects Standard JSON Schema missing output converter', () => {
    const halfBaked = {
      '~standard': {
        jsonSchema: {
          input: () => ({ type: 'string' }),
        },
      },
    }
    expect(() => toJsonSchema(halfBaked, { io: 'output' })).toThrow(
      /converter/i,
    )
  })

  it('lets registerJsonSchemaConverter win first', () => {
    registerJsonSchemaConverter({
      vendor: 'test',
      accept: (schema) =>
        typeof schema === 'object' &&
        schema !== null &&
        (schema as { vendor?: string }).vendor === 'test',
      convert: () => ({ type: 'string', title: 'from-plugin' }),
    })
    expect(toJsonSchema({ vendor: 'test' }, { io: 'output' })).toEqual({
      type: 'string',
      title: 'from-plugin',
    })
  })
})

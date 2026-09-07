import { type CatalogSchema, catalog } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'
import { ioMatrixContract } from './io-matrix-contract.js'

const spec = catalog(ioMatrixContract)

function byKey(key: string) {
  const proc = spec.procedures.find((entry) => entry.key === key)
  if (proc === undefined) {
    throw new Error(`missing procedure ${key}`)
  }
  return proc
}

function kindOf(schema: CatalogSchema | undefined) {
  return schema?.kind
}

describe('io schema matrix (catalog)', () => {
  it('round-trips through JSON', () => {
    expect(JSON.parse(JSON.stringify(spec))).toEqual(spec)
  })

  it.each([
    'zod/primitives/string',
    'zod/primitives/number',
    'zod/primitives/int',
    'zod/primitives/boolean',
    'zod/primitives/null',
    'zod/primitives/unknown',
    'zod/primitives/any',
    'zod/primitives/never',
    'zod/literals/string',
    'zod/literals/number',
    'zod/literals/boolean',
    'zod/literals/null',
    'zod/enums/string',
    'zod/enums/numeric',
    'zod/nullability/nullable',
    'zod/nullability/optional',
    'zod/nullability/nullish',
    'zod/objects/closed',
    'zod/objects/strict',
    'zod/objects/passthrough',
    'zod/objects/catchall',
    'zod/objects/partial',
    'zod/objects/extend',
    'zod/objects/merge',
    'zod/objects/pick',
    'zod/objects/omit',
    'zod/objects/empty',
    'zod/objects/nested',
    'zod/objects/quoted',
    'zod/objects/record',
    'zod/objects/recordEnum',
    'zod/arrays/strings',
    'zod/arrays/unionItems',
    'zod/arrays/tuple',
    'zod/arrays/tupleRest',
    'zod/unions/primitives',
    'zod/unions/objects',
    'zod/unions/literals',
    'zod/unions/discriminated',
    'zod/unions/intersection',
    'zod/recursive/getter',
    'zod/recursive/lazy',
    'zod/formats/email',
    'zod/formats/uuid',
    'zod/formats/datetime',
    'zod/formats/url',
    'zod/formats/branded',
    'zod/formats/file',
    'zod/io/defaulted',
    'zod/io/pipe',
    'zod/io/transformIn',
    'typebox/object',
    'typebox/empty',
    'typebox/union',
    'typebox/nullable',
    'typebox/intersect',
    'typebox/tuple',
    'typebox/record',
    'typebox/literal',
    'typebox/enum',
    'typebox/integer',
    'typebox/thisRecursive',
    'typebox/cyclic',
    'typebox/quoted',
    'typebox/template',
    'names/find-planet',
    'names/class',
  ] as const)('%s is json on both slots', (key) => {
    const proc = byKey(key)
    expect(kindOf(proc.input), `${key} input`).toBe('json')
    expect(kindOf(proc.output), `${key} output`).toBe('json')
  })

  it.each([
    'zod/unrepresentable/date',
    'zod/unrepresentable/bigint',
    'zod/unrepresentable/map',
    'zod/unrepresentable/set',
    'zod/unrepresentable/void',
    'zod/unrepresentable/undefined',
    'zod/unrepresentable/nan',
    'zod/unrepresentable/symbol',
    'zod/unrepresentable/literalUndefined',
    'zod/unrepresentable/dateField',
    'typebox/unrepresentable/bigint',
    'typebox/unrepresentable/void',
    'typebox/unrepresentable/undefined',
  ] as const)('%s is unavailable', (key) => {
    const proc = byKey(key)
    expect(kindOf(proc.input), `${key} input`).toBe('unavailable')
    expect(kindOf(proc.output), `${key} output`).toBe('unavailable')
  })

  it('keeps structural JSON Schema markers', () => {
    expect(jsonOf('zod/objects/closed', 'input')).toMatchObject({
      type: 'object',
    })
    expect(jsonOf('zod/objects/closed', 'output')).toMatchObject({
      type: 'object',
      additionalProperties: false,
    })
    expect(jsonOf('zod/objects/catchall', 'output')).toMatchObject({
      additionalProperties: { type: 'string' },
    })
    expect(jsonOf('zod/objects/record', 'output')).toMatchObject({
      additionalProperties: { type: 'number' },
    })
    expect(jsonOf('zod/objects/recordEnum', 'output')).toMatchObject({
      required: ['a', 'b'],
    })
    expect(jsonOf('zod/arrays/tuple', 'output')).toMatchObject({
      prefixItems: [{ type: 'string' }, { type: 'number' }],
    })
    expect(jsonOf('zod/arrays/tupleRest', 'output')).toMatchObject({
      prefixItems: [{ type: 'string' }],
      items: { type: 'number' },
    })
    expect(jsonOf('zod/unions/primitives', 'output')).toMatchObject({
      type: ['string', 'number'],
    })
    expect(jsonOf('zod/unions/objects', 'output')).toHaveProperty('anyOf')
    expect(jsonOf('zod/unions/discriminated', 'output')).toHaveProperty('oneOf')
    expect(JSON.stringify(jsonOf('zod/recursive/getter', 'output'))).toContain(
      '"$ref":"#"',
    )
    expect(jsonOf('typebox/union', 'output')).toHaveProperty('anyOf')
    expect(jsonOf('typebox/intersect', 'output')).toHaveProperty('allOf')
    expect(Array.isArray(jsonOf('typebox/tuple', 'output').items)).toBe(true)
    expect(jsonOf('typebox/record', 'output')).toHaveProperty(
      'patternProperties',
    )
    expect(jsonOf('typebox/cyclic', 'output').$ref).toBe('#/$defs/Node')
    expect(jsonOf('zod/formats/file', 'output')).toMatchObject({
      type: 'string',
      format: 'binary',
    })
    expect(jsonOf('zod/formats/email', 'output')).toMatchObject({
      type: 'string',
      format: 'email',
    })
  })

  it('uses io: input vs output for defaults, pipes, and transforms', () => {
    // catalog.ts toCatalogSchema(..., 'input') vs contract builder InferSchemaOutput.
    const defaulted = byKey('zod/io/defaulted')
    expect(asJson(defaulted.input).required).toBeUndefined()
    expect(asJson(defaulted.output).required).toEqual(['a'])

    expect(asJson(byKey('zod/io/pipe').input)).toMatchObject({ type: 'string' })
    expect(asJson(byKey('zod/io/pipe').output)).toMatchObject({
      type: 'number',
    })

    expect(kindOf(byKey('zod/io/transformIn').input)).toBe('json')
    expect(asJson(byKey('zod/io/transformIn').input)).toMatchObject({
      type: 'string',
    })
    expect(kindOf(byKey('zod/io/transformOut').output)).toBe('unavailable')
  })

  it('projects slot and name edge cases', () => {
    expect(byKey('slots/noInput').input).toBeUndefined()
    expect(kindOf(byKey('slots/noInput').output)).toBe('json')
    expect(byKey('slots/noOutput').output).toBeUndefined()
    expect(kindOf(byKey('slots/noOutput').input)).toBe('json')

    expect(kindOf(byKey('slots/streamOut').output)).toBe('stream')
    expect(kindOf(byKey('slots/streamIn').input)).toBe('stream')
    expect(kindOf(byKey('slots/streamBoth').input)).toBe('stream')
    expect(kindOf(byKey('slots/streamBoth').output)).toBe('stream')

    expect(kindOf(byKey('slots/errorObject').errors[0]?.data)).toBe('json')
    expect(kindOf(byKey('slots/errorRecursive').errors[0]?.data)).toBe('json')
    expect(kindOf(byKey('slots/errorUnavailable').errors[0]?.data)).toBe(
      'unavailable',
    )

    expect(byKey('names/deep/nest/ping').path).toEqual([
      'names',
      'deep',
      'nest',
      'ping',
    ])
  })
})

function asJson(schema: CatalogSchema | undefined) {
  expect(schema?.kind).toBe('json')
  if (schema?.kind !== 'json') {
    throw new Error('expected json schema')
  }
  return schema.jsonSchema
}

function jsonOf(key: string, slot: 'input' | 'output') {
  return asJson(byKey(key)[slot])
}

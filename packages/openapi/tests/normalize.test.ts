import { describe, expect, it } from 'vitest'
import { normalizeSchema } from '../src/normalize.js'

const closed = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  properties: {
    nested: {
      type: 'object',
      additionalProperties: false,
      properties: { id: { type: 'string' } },
    },
    // A property literally named `additionalProperties` (boolean schema).
    additionalProperties: false,
  },
  default: { additionalProperties: false },
  $defs: {
    Item: { type: 'object', additionalProperties: false },
  },
}

describe('normalizeSchema', () => {
  it('opens output objects everywhere, including $defs', () => {
    expect(normalizeSchema(closed, 'output')).toEqual({
      type: 'object',
      properties: {
        nested: { type: 'object', properties: { id: { type: 'string' } } },
        additionalProperties: false,
      },
      default: { additionalProperties: false },
      $defs: { Item: { type: 'object' } },
    })
  })

  it('keeps input objects closed and only drops $schema', () => {
    const { $schema: _dialect, ...rest } = closed
    expect(normalizeSchema(closed, 'input')).toEqual(rest)
  })

  it('keeps additionalProperties schemas that are not false', () => {
    expect(
      normalizeSchema(
        { type: 'object', additionalProperties: { type: 'string' } },
        'output',
      ),
    ).toEqual({ type: 'object', additionalProperties: { type: 'string' } })
  })
})

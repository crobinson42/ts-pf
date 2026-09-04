import { describe, expect, it } from 'vitest'
import {
  failureEnvelope,
  innerFromCatalog,
  requestEnvelope,
  successEnvelope,
} from '../src/envelope.js'

describe('envelopes', () => {
  it('wraps input and treats missing input as optional null', () => {
    expect(requestEnvelope({ type: 'number' })).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['input'],
      properties: { input: { type: 'number' } },
    })
    expect(requestEnvelope()).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: { input: { type: 'null' } },
    })
  })

  it('wraps success output and omits output when unknown', () => {
    expect(successEnvelope({ type: 'string' })).toMatchObject({
      required: ['ok', 'output'],
      properties: {
        ok: { const: true },
        output: { type: 'string' },
      },
    })
    expect(successEnvelope()).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['ok'],
      properties: { ok: { const: true } },
    })
  })

  it('wraps failure code without status or cause', () => {
    const schema = failureEnvelope('NOT_FOUND', { type: 'object' })
    expect(schema).toMatchObject({
      required: ['ok', 'error'],
      properties: {
        ok: { const: false },
        error: {
          required: ['code', 'message', 'data'],
          properties: {
            code: { const: 'NOT_FOUND' },
            message: { type: 'string' },
            data: { type: 'object' },
          },
        },
      },
    })
    const error = (
      schema.properties as { error: { properties: Record<string, unknown> } }
    ).error.properties
    expect(error).not.toHaveProperty('status')
    expect(error).not.toHaveProperty('cause')
  })

  it('projects catalog schema kinds', () => {
    expect(
      innerFromCatalog({ kind: 'json', jsonSchema: { type: 'boolean' } }),
    ).toEqual({ type: 'boolean' })
    expect(
      innerFromCatalog({ kind: 'unavailable', reason: 'no converter' }),
    ).toMatchObject({ description: expect.stringMatching(/no converter/) })
    expect(
      innerFromCatalog({
        kind: 'stream',
        vendor: 'ts-pf',
        item: { kind: 'json', jsonSchema: { type: 'string' } },
      }),
    ).toEqual({ type: 'string' })
    expect(innerFromCatalog({ kind: 'stream', vendor: 'ts-pf' })).toEqual({})
  })
})

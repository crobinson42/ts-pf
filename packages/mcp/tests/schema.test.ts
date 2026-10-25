import { procedure } from '@ts-pf/contract'
import Type from 'typebox'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  modelInputSchema,
  modelOutputSchema,
  procedureInputKeys,
} from '../src/schema.js'
import { procedureSpec, type ToolSpec } from '../src/tool.js'

const spec = (input: unknown, patch: Partial<ToolSpec> = {}): ToolSpec => ({
  ...procedureSpec('x', procedure.input(input as z.ZodType) as never),
  ...patch,
})
const noop = () => undefined
/** A Standard Schema whose JSON Schema is `json` (or none at all). */
const standard = (json?: object) => ({
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value: unknown) => ({ value }),
    ...(json && { jsonSchema: { input: () => json, output: () => json } }),
  },
})
const intersection = Type.Intersect([
  Type.Object({ id: Type.String() }),
  Type.Object({ tenantId: Type.String() }),
])

describe('modelInputSchema', () => {
  it('removes injected keys from properties and required', () => {
    const { schema, issues } = modelInputSchema(
      spec(z.object({ tenantId: z.string(), id: z.string() }), {
        inject: { tenantId: noop },
      }),
    )
    expect(schema).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    })
    expect(issues).toEqual([])
  })

  it('removes injected keys from every union branch', () => {
    const input = z.union([
      z.object({ tenantId: z.string(), id: z.string() }),
      z.object({ tenantId: z.string(), email: z.string() }),
    ])
    const { schema, issues } = modelInputSchema(
      spec(input, { inject: { tenantId: noop } }),
    )
    expect(schema.type).toBe('object')
    expect(JSON.stringify(schema)).not.toContain('tenantId')
    expect(issues.map((i) => i.level)).toEqual(['warn'])
  })

  it('removes injected keys from every allOf member', () => {
    const { schema, issues } = modelInputSchema(
      spec(intersection, { inject: { tenantId: noop } }),
    )
    expect(schema).toEqual({
      type: 'object',
      allOf: [
        {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        { type: 'object', required: [], properties: {} },
      ],
    })
    expect(issues.map((i) => i.level)).toEqual(['warn'])
  })

  it('inlines $ref definitions', () => {
    const Address = z.object({ city: z.string() }).meta({ id: 'Address' })
    const { schema } = modelInputSchema(
      spec(z.object({ home: Address, work: Address })),
    )
    expect(JSON.stringify(schema)).not.toContain('$ref')
    expect(schema.properties).toMatchObject({
      home: { type: 'object', properties: { city: { type: 'string' } } },
    })
  })

  it('keeps recursive references and reports them', () => {
    type Node = { name: string; children: Node[] }
    const Node: z.ZodType<Node> = z.lazy(() =>
      z.object({ name: z.string(), children: z.array(Node) }),
    )
    const { schema, issues } = modelInputSchema(spec(z.object({ root: Node })))
    expect(JSON.stringify(schema)).toContain('$ref')
    expect(issues).toEqual([
      {
        level: 'warn',
        message: 'schema is recursive; references stay as $ref',
      },
    ])
  })

  it('advertises an empty object for no input; reports a non-object root', () => {
    expect(modelInputSchema(procedureSpec('x', procedure)).schema).toEqual({
      type: 'object',
      properties: {},
    })
    const { schema, issues } = modelInputSchema(spec(z.string()))
    expect(schema).toEqual({ type: 'object', properties: {} })
    expect(issues[0]?.level).toBe('error')
  })
})

describe('procedureInputKeys', () => {
  it('reads properties of the root and every union / allOf member', () => {
    expect(procedureInputKeys(procedureSpec('x', procedure))).toEqual({
      keys: [],
      open: false,
    })
    expect(procedureInputKeys(spec(intersection))).toEqual({
      keys: ['id', 'tenantId'],
      open: false,
    })
    const nested = Type.Intersect([
      Type.Object({ id: Type.String() }),
      Type.Union([
        Type.Object({ tenantId: Type.String() }),
        Type.Object({ teamId: Type.String() }),
      ]),
    ])
    expect(procedureInputKeys(spec(nested))?.keys).toEqual([
      'id',
      'tenantId',
      'teamId',
    ])
  })

  it('marks a record member open', () => {
    const input = z
      .record(z.string(), z.string())
      .and(z.object({ id: z.string() }))
    expect(procedureInputKeys(spec(input))).toEqual({
      keys: ['id'],
      open: true,
    })
  })

  it('cannot read a recursive $ref member or an input with no JSON Schema', () => {
    expect(
      procedureInputKeys(spec(standard({ allOf: [{ $ref: '#' }] }))),
    ).toBeUndefined()
    expect(procedureInputKeys(spec(standard()))).toBeUndefined()
  })
})

describe('modelOutputSchema', () => {
  it('advertises only object roots', () => {
    const base = procedureSpec('x', procedure)
    expect(modelOutputSchema(base)).toEqual({ issues: [] })
    const obj = modelOutputSchema({
      ...base,
      output: { schema: z.object({ a: z.number() }), map: noop },
    })
    expect(obj.schema).toMatchObject({ type: 'object' })
    const str = modelOutputSchema({
      ...base,
      output: { schema: z.string(), map: noop },
    })
    expect(str.schema).toBeUndefined()
    expect(str.issues[0]?.level).toBe('warn')
  })
})

import { procedure } from '@ts-pf/contract'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { modelInputSchema, modelOutputSchema } from '../src/schema.js'
import { procedureSpec, type ToolSpec } from '../src/tool.js'

const spec = (input: unknown, patch: Partial<ToolSpec> = {}): ToolSpec => ({
  ...procedureSpec('x', procedure.input(input as z.ZodType) as never),
  ...patch,
})
const noop = () => undefined

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

import { procedure, router } from '@ts-pf/contract'
import { catalog } from '@ts-pf/docs'
import Type from 'typebox'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { printJsonSchema } from '../src/print-type.js'

describe('printJsonSchema', () => {
  it('prints Zod objects, optionals, and unions', () => {
    const spec = catalog(
      router({
        planet: {
          find: procedure
            .input(
              z.object({
                id: z.number(),
                name: z.string().optional(),
                tag: z.union([z.string(), z.number()]),
              }),
            )
            .output(z.object({ ok: z.boolean() })),
        },
      }),
    )
    const input = spec.procedures[0]?.input
    expect(input?.kind).toBe('json')
    if (input?.kind !== 'json') {
      return
    }
    const printed = printJsonSchema(input.jsonSchema, {
      prefix: 'PlanetFindInput',
    })
    expect(printed.ts).toBe(
      '{ id: number; name?: string; tag: string | number }',
    )
    expect(printed.ts).not.toContain('[key: string]')
  })

  it('prints TypeBox objects', () => {
    const spec = catalog(
      router({
        planet: {
          create: procedure
            .input(Type.Object({ name: Type.String() }))
            .output(Type.Object({ id: Type.Number(), name: Type.String() })),
        },
      }),
    )
    const input = spec.procedures[0]?.input
    expect(input?.kind).toBe('json')
    if (input?.kind !== 'json') {
      return
    }
    const printed = printJsonSchema(input.jsonSchema, {
      prefix: 'PlanetCreateInput',
    })
    expect(printed.ts).toContain('name: string')
  })

  it('prints recursive $ref: # as a hoisted alias', () => {
    const Node: z.ZodTypeAny = z.object({
      name: z.string(),
      children: z.array(z.lazy(() => Node)),
    })
    const spec = catalog(
      router({
        tree: { get: procedure.output(Node) },
      }),
    )
    const output = spec.procedures[0]?.output
    expect(output?.kind).toBe('json')
    if (output?.kind !== 'json') {
      return
    }
    const printed = printJsonSchema(output.jsonSchema, {
      prefix: 'TreeGetOutput',
    })
    expect(printed.ts).toBe('TreeGetOutput')
    const alias = printed.aliases.find(
      (entry) => entry.name === 'TreeGetOutput',
    )
    expect(alias?.ts).toContain('children: TreeGetOutput[]')
    expect(alias?.ts).toContain('name: string')
  })

  it('closes objects when additionalProperties is false or omitted with properties', () => {
    expect(
      printJsonSchema(
        {
          type: 'object',
          properties: { id: { type: 'number' } },
          required: ['id'],
          additionalProperties: false,
        },
        { prefix: 'Closed' },
      ).ts,
    ).toBe('{ id: number }')
    expect(
      printJsonSchema(
        {
          type: 'object',
          properties: { id: { type: 'number' } },
          required: ['id'],
        },
        { prefix: 'Omitted' },
      ).ts,
    ).toBe('{ id: number }')
    expect(
      printJsonSchema(
        {
          type: 'object',
          properties: { id: { type: 'number' } },
          required: ['id'],
          additionalProperties: true,
        },
        { prefix: 'Open' },
      ).ts,
    ).toBe('{ id: number; [key: string]: unknown }')
    expect(printJsonSchema({ type: 'object' }, { prefix: 'Dict' }).ts).toBe(
      '{ [key: string]: unknown }',
    )
  })

  it('prints prefixItems tuples', () => {
    const printed = printJsonSchema(
      {
        type: 'array',
        prefixItems: [{ type: 'string' }, { type: 'number' }],
        items: false,
      },
      { prefix: 'Tuple' },
    )
    expect(printed.ts).toBe('[string, number]')
  })

  it('prints enum, const, and nullable type arrays', () => {
    expect(printJsonSchema({ enum: ['a', 'b'] }, { prefix: 'Enum' }).ts).toBe(
      "'a' | 'b'",
    )
    expect(printJsonSchema({ const: 'x' }, { prefix: 'Const' }).ts).toBe("'x'")
    expect(
      printJsonSchema({ type: ['string', 'null'] }, { prefix: 'Null' }).ts,
    ).toBe('string | null')
  })

  it('prints unknown and never', () => {
    expect(printJsonSchema({}, { prefix: 'Empty' }).ts).toBe('unknown')
    expect(printJsonSchema(true, { prefix: 'True' }).ts).toBe('unknown')
    expect(printJsonSchema(false, { prefix: 'False' }).ts).toBe('never')
    expect(printJsonSchema({ not: {} }, { prefix: 'Not' }).ts).toBe('never')
  })

  it('hoists $defs targets', () => {
    const printed = printJsonSchema(
      {
        type: 'object',
        properties: { child: { $ref: '#/$defs/Node' } },
        required: ['child'],
        additionalProperties: false,
        $defs: {
          Node: {
            type: 'object',
            properties: { n: { $ref: '#/$defs/Node' } },
            required: ['n'],
            additionalProperties: false,
          },
        },
      },
      { prefix: 'Root' },
    )
    expect(printed.ts).toBe('{ child: Root_Node }')
    expect(printed.aliases).toContainEqual({
      name: 'Root_Node',
      ts: '{ n: Root_Node }',
    })
  })
})

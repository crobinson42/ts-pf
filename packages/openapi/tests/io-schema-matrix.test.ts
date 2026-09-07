import { catalog } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'
import { ioMatrixContract } from '../../docs/tests/io-matrix-contract.js'
import { openapi } from '../src/openapi.js'
import { resolvePointer, unresolvedRefs } from './resolve-refs.js'

const spec = openapi(catalog(ioMatrixContract, { prefix: '/rpc' }), {
  info: { title: 'IO matrix', version: '1' },
})

function schema(name: string) {
  const value = spec.components.schemas[name]
  if (value === undefined) {
    throw new Error(`missing schema ${name}`)
  }
  return value
}

function deref(ref: { $ref?: string } | unknown) {
  if (typeof ref !== 'object' || ref === null || !('$ref' in ref)) {
    return ref
  }
  const pointer = (ref as { $ref: string }).$ref
  const target = resolvePointer(spec, pointer)
  expect(target, pointer).toBeDefined()
  return target
}

describe('io schema matrix (openapi)', () => {
  it('round-trips through JSON', () => {
    expect(JSON.parse(JSON.stringify(spec))).toEqual(spec)
  })

  it('resolves every internal $ref', () => {
    expect(unresolvedRefs(spec)).toEqual([])
  })

  it('is still POST JSON RPC', () => {
    for (const [path, item] of Object.entries(spec.paths)) {
      expect(item.post, path).toBeDefined()
      expect(item).not.toHaveProperty('get')
      expect(item).not.toHaveProperty('put')
      const request = schema(
        `${item.post?.operationId ?? ''}.Request`.replace(/^\./, ''),
      )
      expect(request).toMatchObject({
        type: 'object',
        properties: { input: expect.anything() },
      })
      expect(request.properties).not.toHaveProperty('id')
    }
  })

  it('hoists inner schemas so recursive $ref is not the envelope', () => {
    const input = schema('zod.recursive.getter.Input')
    expect(input).toMatchObject({
      type: 'object',
      properties: { name: { type: 'string' } },
    })
    expect(input).not.toHaveProperty('required', ['input'])
    const child = (input.properties as { child?: { $ref?: string } }).child
    expect(child?.$ref).toBe('#/components/schemas/zod.recursive.getter.Input')

    const lazy = schema('zod.recursive.lazy.Input')
    const items = (
      lazy.properties as { children?: { items?: { $ref?: string } } }
    ).children?.items
    expect(items?.$ref).toBe('#/components/schemas/zod.recursive.lazy.Input')

    const cyclic = schema('typebox.cyclic.Input')
    expect(cyclic.$ref).toBe(
      '#/components/schemas/typebox.cyclic.Input/$defs/Node',
    )
    const node = resolvePointer(spec, cyclic.$ref as string) as {
      properties?: { children?: { items?: { $ref?: string } } }
    }
    expect(node?.properties?.children?.items?.$ref).toBe(
      '#/components/schemas/typebox.cyclic.Input/$defs/Node',
    )
  })

  it('keeps combinators on the hoisted inner schema', () => {
    expect(schema('zod.unions.discriminated.Output')).toHaveProperty('oneOf')
    expect(schema('zod.unions.objects.Output')).toHaveProperty('anyOf')
    expect(schema('typebox.intersect.Output')).toHaveProperty('allOf')
    expect(schema('zod.arrays.tuple.Output')).toMatchObject({
      prefixItems: [{ type: 'string' }, { type: 'number' }],
    })
    expect(schema('typebox.record.Output')).toHaveProperty('patternProperties')
    expect(schema('zod.formats.file.Output')).toMatchObject({
      type: 'string',
      format: 'binary',
    })
  })

  it('wraps envelopes around $refs to inner schemas', () => {
    const request = schema('zod.objects.closed.Request')
    expect(request).toMatchObject({
      required: ['input'],
      properties: {
        input: { $ref: '#/components/schemas/zod.objects.closed.Input' },
      },
    })
    const success = schema('zod.objects.closed.Success')
    expect(success).toMatchObject({
      required: ['ok', 'output'],
      properties: {
        ok: { const: true },
        output: { $ref: '#/components/schemas/zod.objects.closed.Output' },
      },
    })
  })

  it('keeps missing input optional-null and missing output ok-only', () => {
    const noInput = schema('slots.noInput.Request')
    expect(noInput).toMatchObject({
      properties: { input: { type: 'null' } },
    })
    expect(noInput).not.toHaveProperty('required')
    const noOutput = schema('slots.noOutput.Success')
    expect(noOutput).toMatchObject({
      required: ['ok'],
      properties: { ok: { const: true } },
    })
    expect(noOutput.properties).not.toHaveProperty('output')
    expect(
      spec.paths['/rpc/slots/noInput']?.post?.responses['422'],
    ).toBeUndefined()
  })

  it('emits unavailable inners as description stubs, not crashes', () => {
    const output = schema('zod.unrepresentable.date.Output')
    expect(JSON.stringify(output)).toMatch(/unavailable/i)
    expect(spec.paths['/rpc/zod/unrepresentable/date']?.post).toBeDefined()
    expect(schema('typebox.unrepresentable.bigint.Output')).toMatchObject({
      description: expect.stringMatching(/unavailable/i),
    })
  })

  it('hoists error data so recursive error $refs resolve', () => {
    const data = schema('slots.errorRecursive.Error.CYCLE.Data')
    expect(data).toMatchObject({
      type: 'object',
      properties: { name: { type: 'string' } },
    })
    const failure = schema('slots.errorRecursive.Error.CYCLE')
    expect(
      deref((failure.properties as { error?: unknown }).error),
    ).toMatchObject({
      properties: {
        data: {
          $ref: '#/components/schemas/slots.errorRecursive.Error.CYCLE.Data',
        },
      },
    })
  })

  it('advertises JSONL for stream slots', () => {
    expect(
      spec.paths['/rpc/slots/streamOut']?.post?.responses['200']?.content,
    ).toHaveProperty('application/jsonl')
    expect(
      spec.paths['/rpc/slots/streamIn']?.post?.requestBody?.content,
    ).toHaveProperty('application/jsonl')
  })
})

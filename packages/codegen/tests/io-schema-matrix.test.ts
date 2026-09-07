import { emit } from '@ts-pf/codegen'
import { catalog } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'
import { ioMatrixContract } from '../../docs/tests/io-matrix-contract.js'
import { printJsonSchema } from '../src/print-type.js'
import { typecheckDts } from './typecheck-dts.js'

const spec = catalog(ioMatrixContract)

function byKey(key: string) {
  const proc = spec.procedures.find((entry) => entry.key === key)
  if (proc === undefined) {
    throw new Error(`missing procedure ${key}`)
  }
  return proc
}

function printed(key: string, slot: 'input' | 'output') {
  const schema = byKey(key)[slot]
  expect(schema?.kind, `${key} ${slot}`).toBe('json')
  if (schema?.kind !== 'json') {
    throw new Error('expected json')
  }
  return printJsonSchema(schema.jsonSchema, { prefix: 'T' })
}

describe('io schema matrix (codegen)', () => {
  it.each([
    ['zod/primitives/string', 'string'],
    ['zod/primitives/number', 'number'],
    ['zod/primitives/int', 'number'],
    ['zod/primitives/boolean', 'boolean'],
    ['zod/primitives/null', 'null'],
    ['zod/primitives/unknown', 'unknown'],
    ['zod/primitives/any', 'unknown'],
    ['zod/primitives/never', 'never'],
    ['zod/literals/string', "'x'"],
    ['zod/literals/number', '1'],
    ['zod/literals/boolean', 'true'],
    ['zod/literals/null', 'null'],
    ['zod/enums/string', "'a' | 'b'"],
    ['zod/enums/numeric', '1 | 2'],
    ['zod/nullability/nullable', 'string | null'],
    ['zod/formats/email', 'string'],
    ['zod/formats/uuid', 'string'],
    ['zod/formats/datetime', 'string'],
    ['zod/formats/url', 'string'],
    ['zod/formats/branded', 'string'],
    ['zod/formats/file', 'string'],
    ['zod/unions/primitives', 'string | number'],
    ['zod/unions/literals', "'a' | 'b'"],
    ['typebox/union', 'string | number'],
    ['typebox/nullable', 'string | null'],
    ['typebox/literal', "'x'"],
    ['typebox/enum', "'a' | 'b'"],
    ['typebox/integer', 'number'],
    ['typebox/template', 'string'],
    ['names/class', 'boolean'],
  ] as const)('%s prints %s', (key, ts) => {
    expect(printed(key, 'output').ts).toBe(ts)
  })

  it('prints object shapes', () => {
    expect(printed('zod/objects/closed', 'output').ts).toBe(
      '{ id: number; name?: string }',
    )
    expect(printed('zod/nullability/optional', 'output').ts).toBe(
      '{ name?: string }',
    )
    expect(printed('zod/nullability/nullish', 'output').ts).toBe(
      '{ name?: string | null }',
    )
    expect(printed('zod/objects/strict', 'output').ts).toBe('{ id: number }')
    expect(printed('zod/objects/passthrough', 'output').ts).toBe(
      '{ id: number; [key: string]: unknown }',
    )
    expect(printed('zod/objects/catchall', 'output').ts).toBe(
      '{ id: number; [key: string]: number | string }',
    )
    expect(printed('zod/objects/partial', 'output').ts).toBe(
      '{ a?: string; b?: number }',
    )
    expect(printed('zod/objects/extend', 'output').ts).toBe(
      '{ a: string; b: number }',
    )
    expect(printed('zod/objects/empty', 'output').ts).toBe('{}')
    expect(printed('typebox/empty', 'output').ts).toBe('{}')
    expect(printed('typebox/object', 'output').ts).toBe(
      '{ id: number; name?: string }',
    )
    expect(printed('zod/objects/quoted', 'output').ts).toBe(
      "{ 'kebab-case': string; 'with space': number; 'class': boolean }",
    )
    expect(printed('typebox/quoted', 'output').ts).toBe(
      "{ 'kebab-case': string; 'class': boolean }",
    )
    expect(printed('zod/objects/record', 'output').ts).toBe(
      '{ [key: string]: number }',
    )
    expect(printed('typebox/record', 'output').ts).toBe(
      '{ [key: string]: number }',
    )
    expect(printed('zod/objects/recordEnum', 'output').ts).toBe(
      '{ a: number; b: number; [key: string]: number }',
    )
    expect(printed('zod/objects/nested', 'output').ts).toBe(
      '{ a: { b: { c: string } } }',
    )
    expect(printed('typebox/intersect', 'output').ts).toBe(
      '{ a: string } & { b: number }',
    )
    expect(printed('zod/unions/intersection', 'output').ts).toBe(
      '{ a: string; b: number }',
    )
    expect(printed('zod/unions/objects', 'output').ts).toBe(
      '{ a: string } | { b: number }',
    )
    expect(printed('zod/unions/discriminated', 'output').ts).toBe(
      "{ type: 'a'; n: number } | { type: 'b'; s: string }",
    )
  })

  it('prints arrays and tuples', () => {
    expect(printed('zod/arrays/strings', 'output').ts).toBe('string[]')
    expect(printed('zod/arrays/unionItems', 'output').ts).toBe(
      '(string | number)[]',
    )
    expect(printed('zod/arrays/tuple', 'output').ts).toBe('[string, number]')
    expect(printed('zod/arrays/tupleRest', 'output').ts).toBe(
      '[string, ...number[]]',
    )
    expect(printed('typebox/tuple', 'output').ts).toBe('[string, number]')
  })

  it('hoists recursive aliases', () => {
    const getter = printed('zod/recursive/getter', 'output')
    expect(getter.ts).toBe('T')
    expect(getter.aliases).toContainEqual({
      name: 'T',
      ts: '{ name: string; child?: T }',
    })
    const lazy = printed('zod/recursive/lazy', 'output')
    expect(lazy.ts).toBe('T')
    expect(lazy.aliases).toContainEqual({
      name: 'T',
      ts: '{ name: string; children: T[] }',
    })
    const typeboxThis = printed('typebox/thisRecursive', 'output')
    expect(typeboxThis.ts).toBe('T')
    expect(typeboxThis.aliases[0]?.ts).toContain('children: T[]')
    const cyclic = printed('typebox/cyclic', 'output')
    expect(cyclic.ts).toBe('T_Node')
    expect(cyclic.aliases).toContainEqual({
      name: 'T_Node',
      ts: '{ name: string; children: T_Node[] }',
    })
  })

  it('locks catalog io vs live InferSchemaOutput for pipes and defaults', () => {
    // procedure.input types InferSchemaOutput (parsed). catalog input uses io: 'input'.
    expect(printed('zod/io/pipe', 'input').ts).toBe('string')
    expect(printed('zod/io/pipe', 'output').ts).toBe('number')
    expect(printed('zod/io/defaulted', 'input').ts).toBe('{ a?: string }')
    expect(printed('zod/io/defaulted', 'output').ts).toBe('{ a: string }')
    expect(printed('zod/io/transformIn', 'input').ts).toBe('string')
  })

  it('prints missing, stream, and unavailable slots from emit', () => {
    const dts = emit(spec, { banner: false })
    expect(dts).toContain('noInput: ContractProcedure<void, string>')
    expect(dts).toContain('noOutput: ContractProcedure<string, unknown>')
    expect(dts).toContain(
      'streamOut: ContractProcedure<void, AsyncIterable<{ token: string }>>',
    )
    expect(dts).toContain(
      'streamIn: ContractProcedure<AsyncIterable<{ chunk: number }>, unknown>',
    )
    expect(dts).toContain(
      'streamBoth: ContractProcedure<AsyncIterable<{ chunk: number }>, AsyncIterable<{ token: string }>>',
    )
    expect(dts).toContain('date: ContractProcedure<unknown, unknown>')
    expect(dts).toContain('bigint: ContractProcedure<unknown, unknown>')
    expect(dts).toContain("'find-planet': ContractProcedure<")
    expect(dts).toContain('data: Phantom<{ id: number }>')
    expect(dts).toContain('data: Phantom<unknown>')
  })

  it('emits a .d.ts that typechecks under strict + exactOptionalPropertyTypes', () => {
    const dts = emit(spec)
    expect(typecheckDts(dts)).toEqual([])
  })
})
